/**
 * Repo index.js – Verified Build...
 * Version stamp: 2025-12-13-01.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const pino = require("pino");

const WEBHOOK_URL = "https://omerthestar11.app.n8n.cloud/webhook/84856633-337c-4b16-a3b0-de6d1bdf326c";

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
  const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  log.info({ reqId, url: WEBHOOK_URL }, "N8N POST start");

  try {
    const res = await axios.post(WEBHOOK_URL, payload, {
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": reqId,
      },
      validateStatus: () => true,
    });

    log.info({ reqId, status: res.status, data: res.data }, "N8N POST done");
  } catch (err) {
    log.error(
      {
        reqId,
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        data: err?.response?.data,
      },
      "N8N POST failed",
    );
  }
}

async function startBot() {
  console.log("✅ BOOT OK. Version stamp: 2025-12-13-01.");

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`✅ Using Baileys v${version.join(".")}. Latest: ${isLatest}.`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["BaileysBot", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp.");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed.", code || "");
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 1500);
      }
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    console.log("📥 UPSERT FIRED.", "type=", upsert?.type, "count=", upsert?.messages?.length || 0);

    if (upsert?.type !== "notify") return;

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
      rawType: msg.message ? Object.keys(msg.message)[0] : null,
    };

    console.log("🔥 MESSAGE RECEIVED:", payload.text);
    await postToN8n(payload);
  });
}

startBot().catch((e) => {
  console.error("❌ Fatal.", e?.message || e);
});
