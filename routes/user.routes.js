const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const Message = require("../models/Message.model");
const router = express.Router();
const logger = require("../logger");

// ── Auth Middleware ───────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    logger.warn("REST auth failed — no token provided", req.originalUrl);
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    logger.warn("REST auth failed — invalid token", req.originalUrl);
    res.status(401).json({ error: "Invalid token" });
  }
};

// ── GET /contacts — All users (for discovery) ────────────────
router.get("/contacts", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select("-password")
      .sort({ name: 1 });

    logger.usersFetched(req.userId, users.length);
    res.json(users);
  } catch (error) {
    logger.error("Failed to fetch contacts list", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /my-contacts — User's own contacts + last message ────
router.get("/my-contacts", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate(
      "contacts",
      "-password"
    );

    // Attach last message to each contact
    const contactsWithLastMessage = await Promise.all(
      user.contacts.map(async (contact) => {
        const lastMessage = await Message.findOne({
          $or: [
            { sender: req.userId, receiver: contact._id },
            { sender: contact._id, receiver: req.userId },
          ],
        }).sort({ createdAt: -1 });

        return {
          ...contact.toObject(),
          lastMessage: lastMessage || null,
        };
      })
    );

    logger.contactFetched(user.name, user.contacts.length);
    res.json(contactsWithLastMessage);
  } catch (error) {
    logger.error("Failed to fetch my-contacts", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /add-contact/:contactId — Add a contact ─────────────
router.post("/add-contact/:contactId", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const contact = await User.findById(req.params.contactId);

    if (!contact) {
      logger.warn("Add contact failed — contact not found", req.params.contactId);
      return res.status(404).json({ error: "Contact not found" });
    }

    if (user.contacts.includes(contact._id)) {
      logger.warn(
        "Add contact skipped — already in contacts",
        `User: "${user.name}"  Contact: "${contact.name}"`
      );
      return res.status(400).json({ error: "Contact already added" });
    }

    user.contacts.push(contact._id);
    await user.save();

    logger.contactAdded(user.name, contact.name);
    res.json({ message: "Contact added successfully" });
  } catch (error) {
    logger.error("Failed to add contact", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /messages/:userId — Chat history ─────────────────────
router.get("/messages/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const otherUser = await User.findById(userId);
    if (!otherUser) {
      logger.warn("Chat history fetch failed — target user not found", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: userId },
        { sender: userId, receiver: req.userId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate("sender", "name avatar")
      .populate("receiver", "name avatar");

    // Format for GiftedChat
    const formattedMessages = messages.map((msg) => ({
      _id: msg._id.toString(),
      text: msg.message,
      createdAt: msg.createdAt,
      user: {
        _id: msg.sender._id.toString(),
        name: msg.sender.name,
        avatar: msg.sender.avatar,
      },
      status: msg.status,
    }));

    const requester = await User.findById(req.userId).select("name");
    logger.historyFetched(requester?.name || req.userId, otherUser.name, messages.length);

    res.json(formattedMessages);
  } catch (error) {
    logger.error("Failed to fetch message history", error.message);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

module.exports = router;
