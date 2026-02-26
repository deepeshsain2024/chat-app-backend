const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const logger = require("./logger");
const initSocket = require("./socket");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");

const app = express();

// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Root Route — Browser Health Check ──────────────────────────
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Chat Server</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f0f1a;
          font-family: 'Segoe UI', system-ui, sans-serif;
          color: #e2e8f0;
        }
        .card {
          background: #1a1a2e;
          border: 1px solid #2d2d4e;
          border-radius: 16px;
          padding: 48px 56px;
          text-align: center;
          max-width: 520px;
          width: 90%;
          box-shadow: 0 0 60px rgba(99,102,241,0.15);
        }
        .pulse {
          display: inline-block;
          width: 14px;
          height: 14px;
          background: #22c55e;
          border-radius: 50%;
          margin-right: 8px;
          animation: pulse 1.6s ease-in-out infinite;
          vertical-align: middle;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; color: #a5b4fc; }
        .status { font-size: 1.1rem; margin-bottom: 28px; color: #86efac; font-weight: 500; }
        .divider { border: none; border-top: 1px solid #2d2d4e; margin: 24px 0; }
        .routes { text-align: left; }
        .routes h3 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; margin-bottom: 12px; }
        .route {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: #0f0f1a;
          border-radius: 8px;
          margin-bottom: 8px;
          font-size: 0.875rem;
        }
        .method {
          font-weight: 700;
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 4px;
          margin-right: 10px;
        }
        .post { background: #7c3aed22; color: #a78bfa; }
        .get  { background: #065f4622; color: #34d399; }
        .path { color: #cbd5e1; font-family: monospace; }
        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 99px;
          font-size: 0.7rem;
          font-weight: 600;
          background: #16213e;
          color: #818cf8;
          border: 1px solid #3730a3;
          margin-left: auto;
        }
        .footer { margin-top: 28px; font-size: 0.75rem; color: #4b5563; }
        .footer span { color: #6366f1; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚡ Chat Server</h1>
        <div class="status"><span class="pulse"></span>Server is Running &amp; Ready</div>
        <hr class="divider"/>
        <div class="routes">
          <h3>Available REST Endpoints</h3>
          <div class="route">
            <span><span class="method post">POST</span><span class="path">/api/auth/register</span></span>
            <span class="badge">Public</span>
          </div>
          <div class="route">
            <span><span class="method post">POST</span><span class="path">/api/auth/login</span></span>
            <span class="badge">Public</span>
          </div>
          <div class="route">
            <span><span class="method get">GET</span><span class="path">/api/users/contacts</span></span>
            <span class="badge">Auth</span>
          </div>
          <div class="route">
            <span><span class="method get">GET</span><span class="path">/api/users/my-contacts</span></span>
            <span class="badge">Auth</span>
          </div>
          <div class="route">
            <span><span class="method post">POST</span><span class="path">/api/users/add-contact/:id</span></span>
            <span class="badge">Auth</span>
          </div>
          <div class="route">
            <span><span class="method get">GET</span><span class="path">/api/users/messages/:userId</span></span>
            <span class="badge">Auth</span>
          </div>
        </div>
        <hr class="divider"/>
        <div class="footer">
          Real-time events via <span>Socket.IO</span> &nbsp;|&nbsp; DB: <span>MongoDB</span>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ── MongoDB Connection ─────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp")
  .then(() => logger.db("MongoDB connected successfully"))
  .catch((err) => {
    logger.error("MongoDB connection failed", err.message);
    process.exit(1);
  });

mongoose.connection.on("error", (err) => {
  logger.error("MongoDB runtime error", err.message);
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected unexpectedly");
});

process.on("SIGINT", async () => {
  logger.warn("SIGINT received — shutting down gracefully");
  await mongoose.connection.close();
  logger.db("MongoDB connection closed");
  process.exit(0);
});

// ── REST Routes ────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// ── 404 Handler ────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn(`404 — Route not found`, `${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error("Unhandled server error", err.message);
  res.status(500).json({ error: "Something went wrong!" });
});

// ── HTTP Server + Socket.IO ────────────────────────────────────
const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  logger.divider();
  logger.server(`Chat server listening on http://localhost:${PORT}`);
  logger.server(`Open http://localhost:${PORT} in your browser to verify`);
  logger.divider();
});