
// Lendly authentication routes.
// Connects registration, email verification, login and profile APIs.

const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  register,
  verifyEmail,
  login,
  getMe,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Limit repeated authentication attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Temporary diagnostic endpoint to confirm this router is mounted.
router.get("/status", (req, res) => {
  res.json({
    status: "ok",
    message: "Lendly authentication routes are working!",
  });
});

// Register a new student.
router.post("/register", authLimiter, register);

// Verify the student's college email.
router.post("/verify-email", authLimiter, verifyEmail);

// Sign in an existing verified student.
router.post("/login", authLimiter, login);

// Get the currently signed-in student's profile.
router.get("/me", protect, getMe);

module.exports = router;
