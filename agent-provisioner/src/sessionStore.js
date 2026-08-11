const fs = require("fs");
const path = require("path");

const DEFAULT_SESSIONS_DIR = path.join(__dirname, "..", "data", "sessions");

function sessionFile(chatId, dir) {
  return path.join(dir, `${chatId}.json`);
}

function loadSession(chatId, dir = DEFAULT_SESSIONS_DIR) {
  try {
    const raw = fs.readFileSync(sessionFile(chatId, dir), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    // No session yet (or corrupted file) — start fresh rather than throw.
    // A missing session is an expected, normal state, not an error.
    return { provider: null, history: [], turns: [] };
  }
}

function saveSession(chatId, session, dir = DEFAULT_SESSIONS_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionFile(chatId, dir), JSON.stringify(session, null, 2));
}

/**
 * Records one completed turn: appends to the durable transcript, and updates
 * the stored history to whatever the agent returned (which becomes the
 * starting history for the NEXT turn in this chat).
 *
 * If the provider changed since the last turn (e.g. LLM_PROVIDER was
 * switched between restarts), the two providers' history formats are NOT
 * compatible with each other — starting fresh is correct here, not a bug to
 * work around.
 */
function recordTurn(chatId, { userMessage, finalText, trace, history, provider }, dir = DEFAULT_SESSIONS_DIR) {
  const session = loadSession(chatId, dir);
  const providerChanged = session.provider !== null && session.provider !== provider;

  const updated = {
    provider,
    history,
    turns: [
      ...(providerChanged ? [] : session.turns),
      { timestamp: new Date().toISOString(), userMessage, finalText, trace },
    ],
  };
  saveSession(chatId, updated, dir);
  return { session: updated, providerChanged };
}

function clearSession(chatId, dir = DEFAULT_SESSIONS_DIR) {
  try {
    fs.unlinkSync(sessionFile(chatId, dir));
    return true;
  } catch (err) {
    return false; // nothing to clear — not an error
  }
}

module.exports = { loadSession, saveSession, recordTurn, clearSession };
