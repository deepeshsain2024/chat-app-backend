const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const Message = require("../models/Message.model");
const router = express.Router();

// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Get all users (potential contacts)
router.get("/contacts", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select("-password")
      .sort({ name: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's contacts with last messages
router.get("/my-contacts", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate(
      "contacts",
      "-password",
    );

    // Get last message for each contact
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
      }),
    );

    res.json(contactsWithLastMessage);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Add contact
router.post("/add-contact/:contactId", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const contact = await User.findById(req.params.contactId);

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    if (user.contacts.includes(contact._id)) {
      return res.status(400).json({ error: "Contact already added" });
    }

    user.contacts.push(contact._id);
    await user.save();

    res.json({ message: "Contact added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get chat history with a specific user
router.get("/messages/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if the other user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
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

    // Format messages for GiftedChat
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

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

module.exports = router;
