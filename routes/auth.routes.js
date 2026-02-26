const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const router = express.Router();
const bcrypt = require("bcryptjs");
const logger = require("../logger");

// ── Register ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, avatar } = req.body;

    logger.info("Register attempt received", `Email: ${email}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration rejected — email already in use", email);
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create and save new user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      avatar:
        avatar || `https://ui-avatars.com/api/?name=${name}&background=random`,
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    logger.register(name, email);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        status: user.status,
      },
    });
  } catch (error) {
    logger.error("Registration error", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info("Login attempt received", `Email: ${email}`);

    // Validate input
    if (!email || !password) {
      logger.loginFailed(email || "N/A", "Missing email or password");
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      logger.loginFailed(email, "No user found with this email");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.loginFailed(email, "Incorrect password");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update user status
    user.status = "online";
    user.lastSeen = new Date();
    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    logger.login(user.name, user.email);

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        status: user.status,
      },
    });
  } catch (error) {
    logger.error("Login error", error.message);
    res.status(500).json({ error: "Server error during login" });
  }
});

module.exports = router;
