const Message = require("../models/Message.model");
const User = require("../models/User.model");

// Track online users with additional info
const onlineUsers = new Map(); // Structure: Map<userId, {socketId, lastActive}>

module.exports = function chatHandler(io, socket) {
  const userId = socket.user._id.toString();
  const userData = socket.user;

  // Track online users with timestamp
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

  // Broadcast updated online users list to all clients
  broadcastOnlineUsers();

  // Join user to their personal room
  socket.join(`user:${userId}`);

  // =========================
  // GET ALL USERS (CONTACTS)
  // =========================
  socket.on("get_all_users", async () => {
    try {
      const users = await User.find({ _id: { $ne: userId } })
        .select("-password")
        .lean();

      // Enhance users with online status
      const enhancedUsers = users.map((user) => ({
        ...user,
        status: onlineUsers.has(user._id.toString()) ? "online" : "offline",
        lastSeen: user.lastSeen || user.updatedAt,
      }));

      socket.emit("all_users", enhancedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  });

  // =========================
  // ADD CONTACT
  // =========================
  socket.on("add_contact", async ({ contactId }) => {
    try {
      const user = await User.findById(userId);

      if (!user.contacts.includes(contactId)) {
        user.contacts.push(contactId);
        await user.save();

        // Get contact details
        const contact = await User.findById(contactId).select("-password");

        // Notify the contact that someone added them
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

        socket.emit("contact_added", {
          success: true,
          contact: {
            ...contact.toObject(),
            status: onlineUsers.has(contactId) ? "online" : "offline",
          },
        });
      }
    } catch (error) {
      console.error("Error adding contact:", error);
      socket.emit("error", { message: "Failed to add contact" });
    }
  });

  // =========================
  // GET USER CONTACTS
  // =========================
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

      socket.emit("my_contacts", contactsWithStatus);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  });

  // =========================
  // USER ACTIVITY (typing, etc)
  // =========================
  socket.on("user_activity", ({ receiverId, activity }) => {
    // Update last active time
    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId).lastActive = new Date();
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

  // =========================
  // CHECK USER STATUS
  // =========================
  socket.on("check_user_status", (targetUserId) => {
    const isOnline = onlineUsers.has(targetUserId);
    socket.emit("user_status", {
      userId: targetUserId,
      status: isOnline ? "online" : "offline",
      lastSeen: isOnline ? null : getUserLastSeen(targetUserId),
    });
  });

  // =========================
  // SEARCH USERS
  // =========================
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

      socket.emit("search_results", enhancedUsers);
    } catch (error) {
      console.error("Error searching users:", error);
    }
  });

  // =========================
  // PING - keep alive and update status
  // =========================
  socket.on("ping", () => {
    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId).lastActive = new Date();
    }
  });

  // =========================
  // DISCONNECT HANDLER
  // =========================
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${userData.name}`);

    onlineUsers.delete(userId);

    // Update last seen in database
    await User.findByIdAndUpdate(userId, {
      status: "offline",
      lastSeen: new Date(),
    });

    broadcastOnlineUsers();
  });

  // Helper function to broadcast online users
  function broadcastOnlineUsers() {
    const onlineUsersList = Array.from(onlineUsers.values()).map((item) => ({
      userId: item.user.id,
      name: item.user.name,
      avatar: item.user.avatar,
      lastActive: item.lastActive,
    }));

    io.emit("online_users_update", onlineUsersList);
  }

  // Helper function to get user last seen
  async function getUserLastSeen(targetUserId) {
    try {
      const user = await User.findById(targetUserId).select("lastSeen");
      return user?.lastSeen;
    } catch (error) {
      return null;
    }
  }
};
