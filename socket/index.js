const { Server } = require("socket.io");
const chatHandler = require("./chat.handler");
const authMiddleware = require("../middleware/auth.middleware");
const User = require("../models/User.model");

module.exports = function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(authMiddleware);

  io.on("connection", async (socket) => {
    console.log("User connected:", socket.user.name);

    // Update user status in database
    await User.findByIdAndUpdate(socket.user._id, {
      status: "online",
      lastSeen: new Date(),
    });

    // Broadcast to all clients that this user is online
    socket.broadcast.emit("user_status_changed", {
      userId: socket.user._id,
      status: "online",
      user: {
        id: socket.user._id,
        name: socket.user.name,
        avatar: socket.user.avatar,
      },
    });

    // Initialize chat handlers
    chatHandler(io, socket);

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.user.name);

      // Update user status in database
      await User.findByIdAndUpdate(socket.user._id, {
        status: "offline",
        lastSeen: new Date(),
      });

      // Broadcast offline status
      socket.broadcast.emit("user_status_changed", {
        userId: socket.user._id,
        status: "offline",
        lastSeen: new Date(),
      });
    });
  });

  // return io;
};
