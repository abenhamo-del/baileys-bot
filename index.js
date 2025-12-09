/**
 * WhatsApp Bot Entry Point
 * Loads config, commands, events, and starts the bot.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const config = require("./utils");

// ---- SAFE LOGGER (WITHOUT pino-pretty) ----
const logger = pino({
  level: config.logging?.level || "info",
});

// ----- LOAD COMMANDS -----
const commands = new Map();
fs.readdirSync("./commands").forEach((file) => {
  const cmd = require(`./commands/${file}`);
  if (cmd?.name) commands.set(cmd.name, cmd);
});

// ----- LOAD EVENTS -----
const eventFiles = fs.readdirSync("./events").filter((f) => f.endsWith(".js"));
const eventHandlers = [];

for (const file of eventFiles) {
  const eventModule = require(`./events/${file}`);
  if (eventModule.eventName && typeof eventModule.handler === "function") {
    eventHandlers.push(eventModule);
  }
}

// ---- START BOT ----
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(`Using Baileys v${version.join(".")}, Latest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // Railway לא יכול להציג QR
    logger: pino({ level: "silent" }),
    browser: ["NexosBot", "Opera GX", "120.0.5543.204"],
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: config.bot?.online ?? true,
    syncFullHistory: config.bot?.history ?? false,
    shouldSyncHistoryMessage: config.bot?.history ?? false,
  });

  // שמירת קרדנציאלס
  sock.ev.on("creds.update", saveCreds);

  // רישום האירועים
  for (const { eventName, handler } of eventHandlers) {
    if (eventName === "connection.update") {
      sock.ev.on(eventName, handler(sock, logger, saveCreds, startBot));
    } else if (eventName === "messages.upsert") {
      sock.ev.on(eventName, handler(sock, logger, commands));
    } else {
      sock.ev.on(eventName, handler(sock, logger));
    }
  }
}

startBot();
