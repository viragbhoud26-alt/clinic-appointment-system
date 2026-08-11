function getAllowList() {
  const raw = process.env.ALLOWED_USER_IDS;
  if (!raw) return null;
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

function isAuthorized(userId) {
  const allowList = getAllowList();
  if (allowList === null) return true;
  return allowList.includes(String(userId));
}

function allowListEnabled() {
  return getAllowList() !== null;
}

module.exports = { isAuthorized, allowListEnabled };
