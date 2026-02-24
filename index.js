const http = require("http");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 5001);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join personal room
  socket.on("join", (userId) => {
    socket.data.userId = userId;
    socket.join(userId);
    socket.broadcast.emit("user_online", userId);
  });

  const forwardMessage = ({ senderId, receiverId, message }) => {
    if (!senderId || !receiverId || !message) {
      return;
    }

    const messageObj =
      typeof message === "string"
        ? {
            _id: Date.now().toString(),
            text: message,
            createdAt: new Date(),
            user: { _id: senderId },
          }
        : {
            _id: message._id || Date.now().toString(),
            text: message.text || "",
            createdAt: message.createdAt || new Date(),
            user: {
              _id: message.user?._id || senderId,
              name: message.user?.name,
              avatar: message.user?.avatar,
            },
          };

    const payload = { ...messageObj, receiverId };
    io.to(receiverId).emit("receive_message", payload);
    io.to(senderId).emit("message_delivered", {
      messageId: messageObj._id,
      receiverId,
    });
  };

  socket.on("send_message", forwardMessage);
  socket.on("send-message", forwardMessage);

  socket.on("typing", ({ receiverId, userId, isTyping }) => {
    if (!receiverId) {
      return;
    }
    io.to(receiverId).emit("typing", {
      userId: userId || socket.data.userId,
      isTyping: !!isTyping,
    });
  });

  socket.on("message_delivered", ({ messageId, receiverId }) => {
    if (receiverId && messageId) {
      io.to(receiverId).emit("message_delivered", { messageId });
    }
  });

  socket.on("message_read", ({ messageId, senderId, receiverId }) => {
    const targetId = senderId || receiverId;
    if (targetId && messageId) {
      io.to(targetId).emit("message_read", { messageId });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.userId) {
      socket.broadcast.emit("user_offline", socket.data.userId);
    }
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
