const TelegramBot = require("node-telegram-bot-api");
const { runAgent } = require("./agent");
const { isAuthorized, allowListEnabled } = require("./authz");
const { loadSession, recordTurn, clearSession } = require("./sessionStore");
const { formatTraceForHumans } = require("./formatTrace");

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN. Get one from @BotFather and export it.");
  process.exit(1);
}
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const PROVIDER = process.env.LLM_PROVIDER || "gemini";
if (PROVIDER === "gemini" && !process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY. Get one free at aistudio.google.com and export it:");
  console.error("  export GEMINI_API_KEY=...");
  process.exit(1);
}
if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Get one from console.anthropic.com and export it:");
  console.error("  export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}
if (!allowListEnabled()) {
  console.warn("\u26a0\ufe0f  ALLOWED_USER_IDS is not set \u2014 the agent is running OPEN.");
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("AI Agent provisioner is running.");
console.log(`LLM_PROVIDER=${PROVIDER}`);
console.log(`APPLY_MODE=${process.env.APPLY_MODE || "dryrun"}`);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();
  const sender = msg.from?.username || msg.from?.first_name || "unknown";
  if (!text || text.startsWith("/start")) return;

  if (!isAuthorized(userId)) {
    console.warn(`[unauthorized] blocked request from user=${sender} id=${userId}`);
    bot.sendMessage(chatId, `\ud83d\udeab Not authorized. Your Telegram user ID is \`${userId}\`.`, { parse_mode: "Markdown" });
    return;
  }

  // /why — show the reasoning trace from the last completed turn in this chat.
  if (text === "/why") {
    const session = loadSession(chatId);
    const lastTurn = session.turns[session.turns.length - 1];
    if (!lastTurn) {
      bot.sendMessage(chatId, "No previous turn in this chat to explain yet.");
      return;
    }
    const summary = formatTraceForHumans(lastTurn.trace);
    bot.sendMessage(chatId, `*Reasoning for:* "${lastTurn.userMessage}"\n\n${summary}`, { parse_mode: "Markdown" });
    return;
  }

  // /reset — forget this chat's conversation history and start fresh.
  if (text === "/reset") {
    const cleared = clearSession(chatId);
    bot.sendMessage(chatId, cleared ? "Conversation history cleared. Starting fresh." : "Nothing to clear \u2014 no history yet.");
    return;
  }

  console.log(`[request] from=${sender} id=${userId} text="${text}"`);
  bot.sendChatAction(chatId, "typing");

  try {
    const session = loadSession(chatId);

    // A provider switch between restarts makes the stored history unusable
    // (Anthropic and Gemini use incompatible wire formats) — start this
    // turn fresh rather than crash trying to replay incompatible history.
    const historyToUse = session.provider && session.provider !== PROVIDER ? [] : session.history;
    if (session.provider && session.provider !== PROVIDER) {
      console.warn(`[session] provider changed (${session.provider} -> ${PROVIDER}) for chat=${chatId}, starting fresh history`);
    }

    const { finalText, trace, history, provider } = await runAgent(text, { history: historyToUse });

    recordTurn(chatId, { userMessage: text, finalText, trace, history, provider });

    console.log(`[trace] ${JSON.stringify(trace, null, 2)}`);

    await bot.sendMessage(chatId, (finalText || "(no response text)") + "\n\n_Tip: send /why to see how I got here._", { parse_mode: "Markdown" });
  } catch (err) {
    console.error("[agent_error]", err);
    await bot.sendMessage(chatId, `\u26a0\ufe0f Something went wrong: ${err.message}`);
  }
});

bot.on("polling_error", (err) => console.error("[polling_error]", err.message));
