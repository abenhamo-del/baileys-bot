const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const qrcode = require("qrcode-terminal");

async function start() {
  console.log("BOOT - QR ONLY BOT");

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["QR-BOT", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      console.log("SCAN THIS QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("CONNECTED TO WHATSAPP");
    }

    if (connection === "close") {
      console.log("CONNECTION CLOSED");
    }
  });
}

start().catch((err) => {
  console.error("FATAL ERROR:", err);
});
