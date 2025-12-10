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
const pino = require("pino");
const axios = require("axios");
const config = require("./utils");

// ---- LOGGER ----
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

// ===========================
//       START BOT
// ===========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(`Using Baileys v${version.join(".")}, Latest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true, // מציג QR מקומית (חשוב!)
    logger: pino({ level: "silent" }),
    browser: ["NexosBot", "Opera GX", "120.0.5543.204"],
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: config.bot?.online ?? true,
    syncFullHistory: false,
    shouldSyncHistoryMessage: false,
  });

  // ===========================
  //  שמירת קרדנציאלס
  // ===========================
  sock.ev.on("creds.update", saveCreds);

  // ===========================
  //    שליחת הודעות ל-n8n
  // ===========================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message) return;

    const isGroup = msg.key.remoteJid.endsWith("@g.us");
    let groupName = null;

    if (isGroup) {
      try {
        const metadata = await sock.groupMetadata(msg.key.remoteJid);
        groupName = metadata.subject;
      } catch (e) {
        console.error("Could not read group metadata:", e.message);
      }
    }

    const senderName = msg.pushName || "לא ידוע";
    const senderPhone = msg.key.participant || msg.key.remoteJid;

    const messageText =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const payload = {
      group_name: groupName,
      sender_name: senderName,
      sender_phone: senderPhone,
      message: messageText,
      timestamp: Date.now(),
    };

    console.log("Sending message to n8n:", payload);

    try {
      await axios.post(
        "https://omerthestar11.app.n8n.cloud/webhook/84856633-337c-4b16-a3b0-de6d1bdf326c",
        payload
      );
      console.log("Message forwarded successfully.");
    } catch (err) {
      console.error("Error sending to n8n:", err.message);
    }
  });

  // ===========================
  //   רישום אירועים אחרים
  // ===========================
  for (const { eventName, handler } of eventHandlers) {
    if (eventName === "connection.update") {
      sock.ev.on(eventName, handler(sock, logger, saveCreds, startBot));
    } else {
      sock.ev.on(eventName, handler(sock, logger));
    }
  }
}

startBot();
