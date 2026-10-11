
// Public browsing routes and protected item-management routes.

const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  getItems,
  getItem,
  createItem,
  updateItem,
  removeItem,
  getMyItems,
} = require("../controllers/itemController");

const router = express.Router();

// Static path must be registered before /:id.
router.get("/mine", protect, getMyItems);

// Public browsing.
router.get("/", getItems);
router.get("/:id", getItem);

// Verified and authenticated students manage their listings.
router.post("/", protect, createItem);
router.patch("/:id", protect, updateItem);
router.delete("/:id", protect, removeItem);

module.exports = router;
