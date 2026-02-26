const { Server } = require("socket.io");
const chatHandler = require("./chat.handler");
const authMiddleware = require("../middleware/auth.middleware");
const User = require("../models/User.model");
const logger = require("../logger");

module.exports = function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Run JWT auth middleware before every socket connection
  io.use(authMiddleware);

  io.on("connection", async (socket) => {
    logger.socketConnect(socket.user.name, socket.id);

    // Update status to online in the database
    await User.findByIdAndUpdate(socket.user._id, {
      status: "online",
      lastSeen: new Date(),
    });

    logger.statusChanged(socket.user.name, "online");

    // Notify all other connected clients that this user is now online
    socket.broadcast.emit("user_status_changed", {
      userId: socket.user._id,
      status: "online",
      user: {
        id: socket.user._id,
        name: socket.user.name,
        avatar: socket.user.avatar,
      },
    });

    // Register all chat-related event listeners
    chatHandler(io, socket);

    // Handle disconnection
    socket.on("disconnect", async () => {
      logger.socketDisconnect(socket.user.name, socket.id);

      // Update status to offline in the database
      await User.findByIdAndUpdate(socket.user._id, {
        status: "offline",
        lastSeen: new Date(),
      });

      logger.statusChanged(socket.user.name, "offline");

      // Notify all other clients that this user went offline
      socket.broadcast.emit("user_status_changed", {
        userId: socket.user._id,
        status: "offline",
        lastSeen: new Date(),
      });
    });
  });
};
