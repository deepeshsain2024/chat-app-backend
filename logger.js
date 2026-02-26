// ============================================================
//  logger.js — Centralized Logger for Chat Application
// ============================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function timestamp() {
  return new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatLine(icon, category, color, message, detail = "") {
  const ts = `${COLORS.gray}[${timestamp()}]${COLORS.reset}`;
  const tag = `${color}${COLORS.bold}[${icon} ${category.toUpperCase()}]${COLORS.reset}`;
  const msg = `${COLORS.white}${message}${COLORS.reset}`;
  const extra = detail ? `  ${COLORS.dim}→ ${detail}${COLORS.reset}` : "";
  console.log(`${ts} ${tag} ${msg}${extra}`);
}

const logger = {
  // ── Server / System ─────────────────────────────────────────
  server(message, detail) {
    formatLine("🚀", "SERVER", COLORS.green, message, detail);
  },
  db(message, detail) {
    formatLine("🗄️ ", "DATABASE", COLORS.cyan, message, detail);
  },
  info(message, detail) {
    formatLine("ℹ️ ", "INFO", COLORS.blue, message, detail);
  },
  error(message, detail) {
    formatLine("❌", "ERROR", COLORS.red, message, detail);
  },
  warn(message, detail) {
    formatLine("⚠️ ", "WARN", COLORS.yellow, message, detail);
  },

  // ── Auth ────────────────────────────────────────────────────
  register(name, email) {
    formatLine("📝", "REGISTER", COLORS.magenta, `New user registered`, `Name: "${name}"  Email: ${email}`);
  },
  login(name, email) {
    formatLine("🔑", "LOGIN", COLORS.green, `User logged in`, `Name: "${name}"  Email: ${email}`);
  },
  loginFailed(email, reason) {
    formatLine("🔒", "LOGIN FAIL", COLORS.red, `Login attempt failed`, `Email: ${email}  Reason: ${reason}`);
  },
  logout(name) {
    formatLine("🚪", "LOGOUT", COLORS.yellow, `User logged out`, `Name: "${name}"`);
  },

  // ── Socket / Connection ─────────────────────────────────────
  socketConnect(name, socketId) {
    formatLine("🟢", "CONNECTED", COLORS.green, `Socket connected`, `User: "${name}"  Socket: ${socketId}`);
  },
  socketDisconnect(name, socketId) {
    formatLine("🔴", "DISCONNECTED", COLORS.yellow, `Socket disconnected`, `User: "${name}"  Socket: ${socketId}`);
  },
  socketAuth(name) {
    formatLine("✅", "SOCKET AUTH", COLORS.cyan, `Socket authenticated`, `User: "${name}"`);
  },
  socketAuthFail(reason) {
    formatLine("🚫", "SOCKET AUTH", COLORS.red, `Socket auth failed`, `Reason: ${reason}`);
  },

  // ── Contacts ────────────────────────────────────────────────
  contactAdded(fromName, toName) {
    formatLine("➕", "CONTACT", COLORS.blue, `Contact added`, `"${fromName}" added "${toName}"`);
  },
  contactFetched(name, count) {
    formatLine("👥", "CONTACTS", COLORS.blue, `Contacts fetched`, `User: "${name}"  Count: ${count}`);
  },
  usersFetched(name, count) {
    formatLine("📋", "USERS", COLORS.blue, `All users fetched`, `Requested by: "${name}"  Count: ${count}`);
  },
  searchUsers(name, term, count) {
    formatLine("🔍", "SEARCH", COLORS.magenta, `User search performed`, `By: "${name}"  Query: "${term}"  Results: ${count}`);
  },

  // ── Messaging ───────────────────────────────────────────────
  messageSent(fromName, toName, preview) {
    const short = preview?.length > 40 ? preview.substring(0, 40) + "…" : preview;
    formatLine("📨", "MSG SENT", COLORS.green, `Message sent`, `From: "${fromName}"  To: "${toName}"  Preview: "${short}"`);
  },
  messageDelivered(fromName, toName) {
    formatLine("📬", "DELIVERED", COLORS.cyan, `Message delivered`, `From: "${fromName}"  To: "${toName}"`);
  },
  messageRead(readerName, senderName) {
    formatLine("👁️ ", "MSG READ", COLORS.magenta, `Message read`, `Reader: "${readerName}"  Original sender: "${senderName}"`);
  },
  historyFetched(requesterName, otherName, count) {
    formatLine("📜", "HISTORY", COLORS.blue, `Chat history fetched`, `Between: "${requesterName}" & "${otherName}"  Messages: ${count}`);
  },

  // ── Activity ────────────────────────────────────────────────
  typing(fromName, toName) {
    formatLine("✏️ ", "TYPING", COLORS.gray, `Typing indicator`, `"${fromName}" is typing to "${toName}"`);
  },
  statusChanged(name, status) {
    const icon = status === "online" ? "🟢" : "🔴";
    formatLine(icon, "STATUS", COLORS.cyan, `User status changed`, `User: "${name}"  Status: ${status}`);
  },
  pingReceived(name) {
    formatLine("💓", "PING", COLORS.gray, `Keepalive ping received`, `User: "${name}"`);
  },

  // ── Divider ─────────────────────────────────────────────────
  divider() {
    console.log(`${COLORS.gray}${"─".repeat(75)}${COLORS.reset}`);
  },
};

module.exports = logger;
