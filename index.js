const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const pino = require("pino");

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; // חובה להגדיר ב-Railway ENV
if (!N8N_WEBHOOK_URL) {
  console.error("❌ N8N_WEBHOOK_URL is not set");
  process.exit(1);
}

const log = pino({ level: "info" });

function extractText(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    ""
  );
}

async function postToN8n(payload) {
  try {
    await axios.post(N8N_WEBHOOK_URL, payload, {
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    });
  } catch (e) {
    log.error({ err: e?.message }, "N8N POST failed");
  }
}

async function start() {
  log.info("BOOT - PRODUCTION BOT");

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["ProdBot", "Chrome", "1.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      log.info("CONNECTED TO WHATSAPP");
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      log.warn({ code }, "CONNECTION CLOSED");
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(start, 2000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    if (upsert?.type !== "notify") return;
    const msg = upsert.messages?.[0];
    if (!msg?.message) return;

    const remoteJid = msg.key?.remoteJid || null;
    const isGroup = Boolean(remoteJid && remoteJid.endsWith("@g.us"));

    const payload = {
      source: "baileys",
      ts: Date.now(),
      message_id: msg.key?.id || null,
      chat_id: remoteJid,
      is_group: isGroup,
      sender_id: msg.key?.participant || remoteJid || null,
      sender_name: msg.pushName || null,
      text: extractText(msg),
      raw_type: msg.message ? Object.keys(msg.message)[0] : null,
    };

    log.info({ isGroup, chat: remoteJid }, "MESSAGE RECEIVED");
    await postToN8n(payload);
  });
}

start().catch((e) => {
  console.error("FATAL ERROR:", e?.message || e);
});
