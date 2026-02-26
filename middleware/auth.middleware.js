const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const logger = require("../logger");

// Socket.IO Authentication Middleware
// Runs before every connection is accepted — verifies the JWT token
module.exports = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      logger.socketAuthFail("No token provided in socket handshake");
      return next(new Error("Authentication error"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      logger.socketAuthFail(`User ID ${decoded.userId} not found in database`);
      return next(new Error("User not found"));
    }

    socket.user = user;
    logger.socketAuth(user.name);
    next();
  } catch (error) {
    logger.socketAuthFail(error.message);
    next(new Error("Authentication error"));
  }
};
