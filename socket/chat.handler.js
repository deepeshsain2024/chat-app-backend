const Message = require("../models/Message.model");
const User = require("../models/User.model");
const logger = require("../logger");

// In-memory map of currently connected users
// Structure: Map<userId, { socketId, lastActive, user: { id, name, avatar, status } }>
const onlineUsers = new Map();

module.exports = function chatHandler(io, socket) {
  const userId = socket.user._id.toString();
  const userData = socket.user;

  // Register user in the online map
  onlineUsers.set(userId, {
    socketId: socket.id,
    lastActive: new Date(),
    user: {
      id: userId,
      name: userData.name,
      avatar: userData.avatar,
      status: "online",
    },
  });

  // Tell all clients the updated list of online users
  broadcastOnlineUsers();

  // Join a personal room so we can send targeted messages to this user
  socket.join(`user:${userId}`);

  // ──────────────────────────────────────────────────────────────
  // GET ALL USERS
  // Client requests the full user list (for "New Chat" / discovery)
  // ──────────────────────────────────────────────────────────────
  socket.on("get_all_users", async () => {
    try {
      const users = await User.find({ _id: { $ne: userId } })
        .select("-password")
        .lean();

      // Attach live online status from the in-memory map
      const enhancedUsers = users.map((user) => ({
        ...user,
        status: onlineUsers.has(user._id.toString()) ? "online" : "offline",
        lastSeen: user.lastSeen || user.updatedAt,
      }));

      logger.usersFetched(userData.name, enhancedUsers.length);
      socket.emit("all_users", enhancedUsers);
    } catch (error) {
      logger.error("get_all_users failed", error.message);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // ADD CONTACT
  // User adds another user to their contacts list
  // ──────────────────────────────────────────────────────────────
  socket.on("add_contact", async ({ contactId }) => {
    try {
      const user = await User.findById(userId);

      if (!user.contacts.includes(contactId)) {
        user.contacts.push(contactId);
        await user.save();

        const contact = await User.findById(contactId).select("-password");

        // If the added contact is online, notify them instantly
        const contactSocket = onlineUsers.get(contactId);
        if (contactSocket) {
          io.to(contactSocket.socketId).emit("contact_added_you", {
            contactId: userId,
            user: {
              id: userId,
              name: userData.name,
              avatar: userData.avatar,
            },
          });
        }

        logger.contactAdded(userData.name, contact.name);

        socket.emit("contact_added", {
          success: true,
          contact: {
            ...contact.toObject(),
            status: onlineUsers.has(contactId) ? "online" : "offline",
          },
        });
      } else {
        logger.warn(
          "add_contact skipped — already in contacts",
          `User: "${userData.name}"  ContactId: ${contactId}`
        );
      }
    } catch (error) {
      logger.error("add_contact failed", error.message);
      socket.emit("error", { message: "Failed to add contact" });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // GET MY CONTACTS
  // User requests their own saved contacts list
  // ──────────────────────────────────────────────────────────────
  socket.on("get_my_contacts", async () => {
    try {
      const user = await User.findById(userId)
        .populate("contacts", "-password")
        .lean();

      const contactsWithStatus = user.contacts.map((contact) => ({
        ...contact,
        status: onlineUsers.has(contact._id.toString()) ? "online" : "offline",
        lastSeen: contact.lastSeen,
      }));

      logger.contactFetched(userData.name, contactsWithStatus.length);
      socket.emit("my_contacts", contactsWithStatus);
    } catch (error) {
      logger.error("get_my_contacts failed", error.message);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // SEND MESSAGE
  // User sends a text message to another user in real-time
  // ──────────────────────────────────────────────────────────────
  socket.on("send_message", async ({ receiverId, message }) => {
    try {
      // Save the message to the database
      const newMessage = await Message.create({
        sender: userId,
        receiver: receiverId,
        message,
        status: "sent",
      });

      const receiver = await User.findById(receiverId).select("name");
      logger.messageSent(userData.name, receiver?.name || receiverId, message);

      const messageData = {
        _id: newMessage._id.toString(),
        text: newMessage.message,
        createdAt: newMessage.createdAt,
        status: newMessage.status,
        user: {
          _id: userId,
          name: userData.name,
          avatar: userData.avatar,
        },
      };

      // Deliver to receiver if they are currently online
      const receiverSocket = onlineUsers.get(receiverId);
      if (receiverSocket) {
        io.to(receiverSocket.socketId).emit("receive_message", messageData);

        // Update status to "delivered" since receiver is online
        await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
        messageData.status = "delivered";
        logger.messageDelivered(userData.name, receiver?.name || receiverId);
      }

      // Confirm to the sender with final status
      socket.emit("message_sent", messageData);
    } catch (error) {
      logger.error("send_message failed", error.message);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // MARK MESSAGE AS READ
  // Receiver tells the server they have read a message
  // ──────────────────────────────────────────────────────────────
  socket.on("message_read", async ({ messageId, senderId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, {
        status: "read",
        readAt: new Date(),
      });

      const sender = await User.findById(senderId).select("name");
      logger.messageRead(userData.name, sender?.name || senderId);

      // Notify the original sender that their message was read
      const senderSocket = onlineUsers.get(senderId);
      if (senderSocket) {
        io.to(senderSocket.socketId).emit("message_status_updated", {
          messageId,
          status: "read",
          readAt: new Date(),
        });
      }
    } catch (error) {
      logger.error("message_read failed", error.message);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // TYPING / ACTIVITY INDICATOR
  // Forwards typing events to the other user in real-time
  // ──────────────────────────────────────────────────────────────
  socket.on("user_activity", ({ receiverId, activity }) => {
    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId).lastActive = new Date();
    }

    if (activity === "typing") {
      logger.typing(userData.name, receiverId);
    }

    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket.socketId).emit("contact_activity", {
        userId,
        activity,
        timestamp: new Date(),
      });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // CHECK USER STATUS
  // Ask whether a specific user is currently online
  // ──────────────────────────────────────────────────────────────
  socket.on("check_user_status", (targetUserId) => {
    const isOnline = onlineUsers.has(targetUserId);
    logger.info(
      "User status check",
      `Requested by: "${userData.name}"  Target: ${targetUserId}  Status: ${isOnline ? "online" : "offline"}`
    );
    socket.emit("user_status", {
      userId: targetUserId,
      status: isOnline ? "online" : "offline",
      lastSeen: isOnline ? null : getUserLastSeen(targetUserId),
    });
  });

  // ──────────────────────────────────────────────────────────────
  // SEARCH USERS
  // Search for users by name or email (for adding contacts)
  // ──────────────────────────────────────────────────────────────
  socket.on("search_users", async (searchTerm) => {
    try {
      const users = await User.find({
        _id: { $ne: userId },
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { email: { $regex: searchTerm, $options: "i" } },
        ],
      })
        .select("-password")
        .limit(20)
        .lean();

      const enhancedUsers = users.map((user) => ({
        ...user,
        status: onlineUsers.has(user._id.toString()) ? "online" : "offline",
      }));

      logger.searchUsers(userData.name, searchTerm, enhancedUsers.length);
      socket.emit("search_results", enhancedUsers);
    } catch (error) {
      logger.error("search_users failed", error.message);
    }
  });

  // ──────────────────────────────────────────────────────────────
  // PING — Keep-alive heartbeat from client
  // ──────────────────────────────────────────────────────────────
  socket.on("ping", () => {
    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId).lastActive = new Date();
    }
    logger.pingReceived(userData.name);
  });

  // ──────────────────────────────────────────────────────────────
  // DISCONNECT
  // User closes the app or loses connection
  // ──────────────────────────────────────────────────────────────
  socket.on("disconnect", async () => {
    onlineUsers.delete(userId);

    await User.findByIdAndUpdate(userId, {
      status: "offline",
      lastSeen: new Date(),
    });

    broadcastOnlineUsers();
  });

  // ── Helpers ──────────────────────────────────────────────────

  // Broadcast the current list of online users to ALL connected clients
  function broadcastOnlineUsers() {
    const onlineUsersList = Array.from(onlineUsers.values()).map((item) => ({
      userId: item.user.id,
      name: item.user.name,
      avatar: item.user.avatar,
      lastActive: item.lastActive,
    }));

    io.emit("online_users_update", onlineUsersList);
  }

  // Look up the last seen timestamp for an offline user
  async function getUserLastSeen(targetUserId) {
    try {
      const user = await User.findById(targetUserId).select("lastSeen");
      return user?.lastSeen;
    } catch (error) {
      return null;
    }
  }
};
