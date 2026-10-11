
// ============================================
// LENDLY - EXPRESS BACKEND SERVER
// Connects the frontend, authentication APIs,
// item APIs, borrowing APIs and MongoDB.
// ============================================

// Load private environment variables from backend/.env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

// Database connection
const connectDB = require("./config/db");

// API route modules
const authRoutes = require("./routes/authRoutes");
const itemRoutes = require("./routes/itemRoutes");
const borrowRoutes = require("./routes/borrowRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Add standard HTTP security headers.
app.use(helmet());

// Allow requests from the React frontend.
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

// Parse incoming JSON request bodies.
// Restrict payload size to reduce abuse.
app.use(express.json({ limit: "10kb" }));

// General rate limit for API requests.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
// Ensure MongoDB is connected before handling API requests.
let dbConnectionPromise = null;

async function ensureDatabase(req, res, next) {
  try {
    if (mongoose.connection.readyState !== 1) {
      if (!dbConnectionPromise) {
        dbConnectionPromise = connectDB().catch((error) => {
          dbConnectionPromise = null;
          throw error;
        });
      }

      await dbConnectionPromise;
    }

    next();
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(503).json({
      message: "Database connection unavailable",
    });
  }
}

app.use("/api", ensureDatabase);

// HEALTH CHECK
// --------------------------------------------
// HEALTH CHECK
// GET /api/health
// --------------------------------------------
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Lendly API is running!",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// --------------------------------------------
// AUTHENTICATION ROUTES
// POST /api/auth/register
// POST /api/auth/verify-email
// POST /api/auth/login
// GET  /api/auth/me
// --------------------------------------------
app.use("/api/auth", authRoutes);

// --------------------------------------------
// ITEM ROUTES
// GET    /api/items
// GET    /api/items/mine
// GET    /api/items/:id
// POST   /api/items
// PATCH  /api/items/:id
// DELETE /api/items/:id
// --------------------------------------------
app.use("/api/items", itemRoutes);

// --------------------------------------------
// BORROWING ROUTES
// GET   /api/borrow/mine
// GET   /api/borrow/incoming
// POST  /api/borrow/:itemId
// PATCH /api/borrow/:id/decision
// PATCH /api/borrow/:id/checkout
// PATCH /api/borrow/:id/return
// --------------------------------------------
app.use("/api/borrow", borrowRoutes);

// --------------------------------------------
// UNKNOWN ROUTES
// Return JSON when no route matches.
// --------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// --------------------------------------------
// GLOBAL ERROR HANDLER
// Do not expose internal details to clients.
// --------------------------------------------
app.use((err, req, res, next) => {
  console.error("Request error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message: "Internal server error",
  });
});

// --------------------------------------------
// START SERVER AFTER DATABASE CONNECTS
// --------------------------------------------
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log("Lendly database connected successfully.");
      console.log(
        `Lendly API running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Database connection failed. Check backend/.env and Atlas settings."
    );
    console.error("Error type:", error.name || "Unknown");
    console.error("Database error details:", error.message);
    process.exit(1);
  }
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  startServer();
}