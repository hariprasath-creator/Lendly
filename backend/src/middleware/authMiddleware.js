
// Protect private endpoints using a signed bearer token.

const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verify the token and load the current user from MongoDB.
async function protect(req, res, next) {
  try {
    const authHeader = req.get("authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please sign in to continue.",
      });
    }

    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({
        message: "Authentication is not configured.",
      });
    }

    const payload = jwt.verify(token, secret);

    const user = await User.findById(payload.sub).select(
      "_id fullName email role isEmailVerified isActive branch joiningYear"
    );

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "This account is unavailable. Please sign in again.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Your session is invalid or expired. Please sign in again.",
      });
    }

    next(error);
  }
}

// Restrict administrative endpoints to an administrator role.
// Normal registration never grants this role.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access is required.",
    });
  }

  next();
}

module.exports = { protect, requireAdmin };
