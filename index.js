/**
 * WhatsApp Bot Entry Point
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const axios = require("axios");
const pino = require("pino");
const config = require("./utils");

// ---- LOGGER ----
const logger = pino({
  level: "info",
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`🚀 Baileys v${version.join(".")} (latest: ${isLatest})`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["MyBot", "Chrome", "1.0"],
    syncFullHistory: false,
    shouldSyncHistoryMessage: false,
    markOnlineOnConnect: false,
  });

  // ============================
  //       DEBUG לכל אירוע
  // ============================
  sock.ev.on("*", (event, data) => {
    console.log("📡 EVENT:", event);
  });

  // ============================
  //     שמירת קרדנציאלס
  // ============================
  sock.ev.on("creds.update", saveCreds);

  // ============================
  //  קליטת הודעות → שליחה ל-n8n
  // ============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const isGroup = msg.key.remoteJid.endsWith("@g.us");
      let groupName = null;

      if (isGroup) {
        try {
          const metadata = await sock.groupMetadata(msg.key.remoteJid);
          groupName = metadata.subject || null;
        } catch (err) {
          console.log("⚠️ Cannot read group metadata:", err.message);
        }
      }

      const senderName = msg.pushName || "לא ידוע";
      const senderPhone = msg.key.participant || msg.key.remoteJid;

      const messageText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      const payload = {
        group_name: groupName,
        sender_name: senderName,
        sender_phone: senderPhone,
        message: messageText,
        remoteJid: msg.key.remoteJid,
        is_group: isGroup,
        timestamp: Date.now(),
      };

      console.log("📨 MESSAGE RECEIVED:", payload);

      // ============================
      //שליחה ל־n8n (URL תקין שלך)
      // ============================
      await axios.post(
        "https://omerthestar11.app.n8n.cloud/webhook/84856633-337c-4b16-a3b0-de6d1bdf326c",
        payload
      );

      console.log("✅ Sent to n8n");
    } catch (err) {
      console.error("❌ ERROR in messages.upsert:", err.message);
    }
  });

  // ============================
  //   טיפול בניתוקים
  // ============================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const reason =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.toString();

      console.log("⚠️ CONNECTION CLOSED:", reason);

      // התחברות מחדש
      startBot();
    }

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    }
  });
}

startBot();
