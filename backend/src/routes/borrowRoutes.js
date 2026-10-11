
// Routes for requesting, approving and returning items.

const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const {
  createRequest,
  getMyRequests,
  getIncomingRequests,
  decideRequest,
  markBorrowed,
  markReturned,
} = require("../controllers/borrowController");

const router = express.Router();

// Require sign-in for every borrowing operation.
router.use(protect);

router.get("/mine", getMyRequests);
router.get("/incoming", getIncomingRequests);
router.post("/:itemId", createRequest);
router.patch("/:id/decision", decideRequest);
router.patch("/:id/checkout", markBorrowed);
router.patch("/:id/return", markReturned);

module.exports = router;
