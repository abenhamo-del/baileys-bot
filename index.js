sock.ev.on("messages.upsert", ({ messages }) => {
  const msg = messages[0];
  if (!msg?.message) return;

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text;

  console.log("🔥 MESSAGE RECEIVED:", text);
});
