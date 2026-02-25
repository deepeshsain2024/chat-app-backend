// module.exports = (socket, next) => {
//   //   const token = socket.handshake.auth?.token;

//   // Example validation
//   //   if (!token) {
//   //     return next(new Error("Unauthorized"));
//   //   }

//   // You can decode JWT here
//   socket.user = { id: "" }; // attach user info

//   next();
// };

// middleware.js
module.exports = (socket, next) => {
  try {
    // Get userId from handshake auth
    const userId = socket.handshake.auth.userId;

    if (!userId) {
      return next(new Error("Authentication error: userId required"));
    }

    // Validate userId format (add your validation logic)
    if (typeof userId !== "string" || userId.length < 1) {
      return next(new Error("Authentication error: Invalid userId"));
    }

    // Attach userId to socket object
    socket.userId = userId;

    // Log connection attempt
    console.log(`Authenticating user ${userId} with socket ${socket.id}`);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    next(new Error("Authentication error"));
  }
};
