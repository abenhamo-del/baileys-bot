const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const pino = require("pino");

const WEBHOOK_URL = "https://omerthestar11.app.n8n.cloud/webhook/84856633-337c-4b16-a3b0-de6d1bdf326c";

function pickText(msg) {
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
  console.log(`[N8N][${reqId}] POST start -> ${WEBHOOK_URL}.`);
  try {
    const res = await axios.post(WEBHOOK_URL, payload, {
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": reqId,
      },
      validateStatus: () => true,
    });
    console.log(`[N8N][${reqId}] POST done -> status=${res.status}.`);
    console.log(`[N8N][${reqId}] response body:`, res.data);
    return res.status;
  } catch (err) {
    console.log(`[N8N][${reqId}] POST failed.`);

    console.log(`[N8N][${reqId}] message:`, err?.message);
    console.log(`[N8N][${reqId}] code:`, err?.code);
    console.log(`[N8N][${reqId}] response.status:`, err?.response?.status);
    console.log(`[N8N][${reqId}] response.data:`, err?.response?.data);
    throw err;
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

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

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp.");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Connection closed.", statusCode || "");
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        setTimeout(() => startBot(), 1500);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const remoteJid = msg.key?.remoteJid || null;
    const isGroup = Boolean(remoteJid && remoteJid.endsWith("@g.us"));
    const sender = msg.key?.participant || remoteJid || null;

    const payload = {
      source: "baileys",
      ts: Date.now(),
      id: msg.key?.id || null,
      chat: remoteJid,
      is_group: isGroup,
      sender,
      pushName: msg.pushName || null,
      text: pickText(msg),
      rawType: msg.message ? Object.keys(msg.message)[0] : null,
    };

    console.log("🔥 MESSAGE RECEIVED:", payload.text);
    console.log("📨 PAYLOAD:", payload);

    await postToN8n(payload);
  });
}

startBot().catch((e) => {
  console.error("❌ Fatal:", e?.message || e);
});
