// server.js
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const TelegramBot = require("node-telegram-bot-api");

const PORT = process.env.PORT || 8080;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!TELEGRAM_TOKEN || !CHAT_ID) {
  console.error("Missing TELEGRAM_TOKEN or CHAT_ID in environment variables!");
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Create HTTP server for Railway health checks and WebSocket upgrades
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", extensionOnline: !!extensionClient }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
let extensionClient = null;

wss.on("connection", (ws) => {
  console.log("Browser Extension connected via WebSocket!");
  extensionClient = ws;
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);

      if (parsed.type === "ACCOUNT_CREATED") {
        bot.sendMessage(
          CHAT_ID,
          `✅ *New Knowunity Account Created!*\n\n` +
          `• *Email:* \`${parsed.data.email}\`\n` +
          `• *Referral:* \`${parsed.data.referralCode}\`\n` +
          `• *Cycle:* #${parsed.data.cycleCount}\n` +
          `• *Time:* ${parsed.data.time}`,
          { parse_mode: "Markdown" }
        );
      } else if (parsed.type === "STATUS_REPORT") {
        bot.sendMessage(
          CHAT_ID,
          `📊 *Live Extension Status:*\n\n` +
          `• *Active Loop:* ${parsed.data.rotationLoopActive ? "Running" : "Stopped"}\n` +
          `• *Total Completed:* ${parsed.data.rotationCycleCount || 0}\n` +
          `• *Current Code:* \`${parsed.data.currentReferralCode || "Default"}\``,
          { parse_mode: "Markdown" }
        );
      }
    } catch (e) {
      console.error("Error processing message:", e);
    }
  });

  ws.on("close", () => {
    if (extensionClient === ws) extensionClient = null;
    console.log("Extension disconnected.");
  });
});

// Keep-alive heartbeat every 25 seconds to prevent Railway proxy timeouts
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on("close", () => clearInterval(heartbeatInterval));

// Telegram Bot Command Handlers
bot.onText(/\/start_loop/, (msg) => {
  if (extensionClient && extensionClient.readyState === WebSocket.OPEN) {
    extensionClient.send(JSON.stringify({ action: "START" }));
    bot.sendMessage(msg.chat.id, "🚀 START command sent to the extension.");
  } else {
    bot.sendMessage(msg.chat.id, "⚠️ Extension is currently offline. Open your browser on the Knowunity tab.");
  }
});

bot.onText(/\/stop_loop/, (msg) => {
  if (extensionClient && extensionClient.readyState === WebSocket.OPEN) {
    extensionClient.send(JSON.stringify({ action: "STOP" }));
    bot.sendMessage(msg.chat.id, "🛑 STOP command sent to the extension.");
  } else {
    bot.sendMessage(msg.chat.id, "⚠️ Extension is currently offline.");
  }
});

bot.onText(/\/status/, (msg) => {
  if (extensionClient && extensionClient.readyState === WebSocket.OPEN) {
    extensionClient.send(JSON.stringify({ action: "GET_STATUS" }));
    bot.sendMessage(msg.chat.id, "📡 Querying extension for live stats...");
  } else {
    bot.sendMessage(msg.chat.id, "⚠️ Extension is currently offline.");
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
