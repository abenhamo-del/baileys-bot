/**
 * WhatsApp Baileys Bot – Stable Repo Version
 * Reads messages and sends JSON to n8n Webhook
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const pino = require("pino");

// ============================
// CONFIG
// ============================
const WEBHOOK_URL =
  "https://omerthestar11.app.n8n.cloud/webhook/84856633-337c-4b16-a3b0-de6d1bdf326c";

const logger = pino({ level: "info" });

// ============================
// HELPERS
// ============================
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
  const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  logger.info(`[N8N][${reqId}] POST start`);

  try {
    const res = await axios.post(WEBHOOK_URL, payload, {
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": reqId,
      },
      validateStatus: () => true,
    });

    logger.info(`[N8N][${reqId}] POST done -> ${res.status}`);
    logger.info(`[N8N][${reqId}] response body`, res.data);
  } catch (err) {
    logger.error(`[N8N][${reqId}] POST failed`);
    logger.error(err?.message);
    if (err?.response) {
      logger.error(err.response.status, err.response.data);
    }
  }
}

// ============================
// MAIN
// ============================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(`Using Baileys v${version.join(".")} (latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["BaileysBot", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // Save credentials
  sock.ev.on("creds.update", saveCreds);

  // Connection lifecycle
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      logger.info("✅ Connected to WhatsApp");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      logger.warn("⚠️ Connection closed", statusCode || "");

      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 1500);
      }
    }
  });

  // ============================
  // MESSAGE HANDLING (FIXED)
  // ============================
  sock.ev.on("messages.upsert", async (upsert) => {
    try {
      // Debug – proves event fires
      logger.info("📥 messages.upsert event", {
        type: upsert.type,
        count: upsert.messages?.length || 0,
      });

      // Only real incoming messages
      if (upsert.type !== "notify") return;

      const msg = upsert.messages?.[0];
      if (!msg?.message) return;

      const remoteJid = msg.key?.remoteJid || null;
      const isGroup = Boolean(remoteJid && remoteJid.endsWith("@g.us"));

      const payload = {
        source: "baileys",
        ts: Date.now(),
        id: msg.key?.id || null,
        chat: remoteJid,
        is_group: isGroup,
        sender: msg.key?.participant || remoteJid || null,
        pushName: msg.pushName || null,
        text: extractText(msg),
        rawType: Object.keys(msg.message)[0],
      };

      logger.info("🔥 MESSAGE RECEIVED", payload.text);
      logger.info("📨 PAYLOAD", payload);

      await postToN8n(payload);
    } catch (err) {
      logger.error("❌ ERROR in messages.upsert", err?.message || err);
    }
  });
}

// ============================
// START
// ============================
startBot().catch((err) => {
  logger.error("❌ Fatal startup error", err);
});
