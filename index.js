const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const pino = require("pino");

async function start() {
  console.log("BOOT – QR TEST BOT");

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["QR-BOT", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) {
      console.log("===== QR CODE =====");
      console.log(qr);
      console.log("===================");
    }

    if (connection === "open") {
      console.log("✅ Connected to WhatsApp.");
    }

    if (connection === "close") {
      console.log("❌ Connection closed.");
    }
  });
}

start().catch(console.error);
