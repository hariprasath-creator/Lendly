
// Lendly borrowing request and return workflow.

const mongoose = require("mongoose");
const { z } = require("zod");

const Item = require("../models/Item");
const BorrowRequest = require("../models/BorrowRequest");

const dateInput = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// Calculate whole calendar-day differences using UTC.
function getRentalDays(startDate, endDate) {
  const start = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate()
  );

  const end = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  );

  return Math.ceil((end - start) / 86400000);
}

// POST /api/borrow/:itemId — request an item.
async function createRequest(req, res) {
  try {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        message: "Verify your college email before borrowing.",
      });
    }

    if (!mongoose.isValidObjectId(req.params.itemId)) {
      return res.status(400).json({ message: "Invalid item ID." });
    }

    const parsed = dateInput.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Enter valid borrowing start and end dates.",
      });
    }

    const { startDate, endDate } = parsed.data;
    const days = getRentalDays(startDate, endDate);

    if (endDate <= startDate || days < 1 || days > 30) {
      return res.status(400).json({
        message: "Choose a valid period of 1 to 30 days.",
      });
    }

    if (startDate < new Date(new Date().setHours(0, 0, 0, 0))) {
      return res.status(400).json({
        message: "The start date cannot be in the past.",
      });
    }

    const item = await Item.findById(req.params.itemId);

    if (!item || item.status !== "available") {
      return res.status(404).json({
        message: "This item is not currently available.",
      });
    }

    if (String(item.owner) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot borrow your own item.",
      });
    }

    // Prevent duplicate active requests for the same date range.
    const conflict = await BorrowRequest.exists({
      item: item._id,
      status: { $in: ["approved", "borrowed"] },
      startDate: { $lt: endDate },
      endDate: { $gt: startDate },
    });

    if (conflict) {
      return res.status(409).json({
        message: "Those dates conflict with another approved request.",
      });
    }

    // Compute the total on the server; ignore any fee from the browser.
    const totalFee = Number((item.feePerDay * days).toFixed(2));

    const request = await BorrowRequest.create({
      item: item._id,
      borrower: req.user._id,
      owner: item.owner,
      startDate,
      endDate,
      feePerDay: item.feePerDay,
      totalFee,
      status: "pending",
    });

    res.status(201).json({
      message: "Borrowing request sent to the owner.",
      request,
    });
  } catch (error) {
    console.error("Create borrow request failed:", error.message);
    res.status(500).json({
      message: "Could not create the borrowing request.",
    });
  }
}

// GET /api/borrow/mine — current student's outgoing requests.
async function getMyRequests(req, res) {
  try {
    const requests = await BorrowRequest.find({
      borrower: req.user._id,
    })
      .populate("item", "title category imageUrl feePerDay status")
      .populate("owner", "fullName email")
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error("My borrowings failed:", error.message);
    res.status(500).json({ message: "Could not load your requests." });
  }
}

// GET /api/borrow/incoming — requests for items owned by this student.
async function getIncomingRequests(req, res) {
  try {
    const requests = await BorrowRequest.find({
      owner: req.user._id,
    })
      .populate("item", "title category imageUrl feePerDay")
      .populate("borrower", "fullName email branch")
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error("Incoming requests failed:", error.message);
    res.status(500).json({ message: "Could not load incoming requests." });
  }
}

// PATCH /api/borrow/:id/decision — owner approves or rejects a request.
async function decideRequest(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid request ID." });
    }

    const input = z.object({
      decision: z.enum(["approve", "reject"]),
      ownerNote: z.string().trim().max(300).optional(),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({
        message: "Decision must be approve or reject.",
      });
    }

    const request = await BorrowRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (String(request.owner) !== String(req.user._id)) {
      return res.status(403).json({
        message: "Only the item owner can decide this request.",
      });
    }

    if (request.status !== "pending") {
      return res.status(409).json({
        message: "This request has already been processed.",
      });
    }

    if (input.data.decision === "reject") {
      request.status = "rejected";
      request.ownerNote = input.data.ownerNote || "";
      await request.save();

      return res.json({ message: "Request rejected.", request });
    }

    // Check for a conflicting approved/borrowed booking before approval.
    const conflict = await BorrowRequest.exists({
      _id: { $ne: request._id },
      item: request.item,
      status: { $in: ["approved", "borrowed"] },
      startDate: { $lt: request.endDate },
      endDate: { $gt: request.startDate },
    });

    if (conflict) {
      return res.status(409).json({
        message: "Those dates are already booked.",
      });
    }

    const item = await Item.findById(request.item);

    if (!item || item.status === "removed") {
      return res.status(409).json({
        message: "This item is no longer available.",
      });
    }

    request.status = "approved";
    request.approvedAt = new Date();
    request.ownerNote = input.data.ownerNote || "";
    await request.save();

    // Keep the single-item MVP simple: pause the listing while approved.
    item.status = "paused";
    await item.save();

    // Other pending requests must not be left looking like active bookings.
    await BorrowRequest.updateMany(
      {
        _id: { $ne: request._id },
        item: item._id,
        status: "pending",
        startDate: { $lt: request.endDate },
        endDate: { $gt: request.startDate },
      },
      {
        $set: {
          status: "rejected",
          ownerNote: "Another request was approved for these dates.",
        },
      }
    );

    res.json({ message: "Request approved.", request });
  } catch (error) {
    console.error("Decide borrow request failed:", error.message);
    res.status(500).json({ message: "Could not process the request." });
  }
}

// PATCH /api/borrow/:id/checkout — owner records that the item was handed over.
async function markBorrowed(req, res) {
  try {
    const request = await BorrowRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (String(request.owner) !== String(req.user._id)) {
      return res.status(403).json({
        message: "Only the item owner can mark this item as handed over.",
      });
    }

    if (request.status !== "approved") {
      return res.status(409).json({
        message: "Only an approved request can be checked out.",
      });
    }

    request.status = "borrowed";
    await request.save();

    res.json({ message: "Item marked as borrowed.", request });
  } catch (error) {
    console.error("Checkout failed:", error.message);
    res.status(500).json({ message: "Could not update the request." });
  }
}

// PATCH /api/borrow/:id/return — owner confirms the item's return.
async function markReturned(req, res) {
  try {
    const request = await BorrowRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (String(request.owner) !== String(req.user._id)) {
      return res.status(403).json({
        message: "Only the item owner can confirm its return.",
      });
    }

    if (!["borrowed", "approved"].includes(request.status)) {
      return res.status(409).json({
        message: "This request cannot be marked as returned.",
      });
    }

    request.status = "returned";
    request.returnedAt = new Date();
    await request.save();

    // Make the listing available again unless it was removed.
    await Item.updateOne(
      { _id: request.item, status: "paused" },
      { $set: { status: "available" } }
    );

    res.json({ message: "Item return recorded.", request });
  } catch (error) {
    console.error("Return failed:", error.message);
    res.status(500).json({ message: "Could not confirm the return." });
  }
}

module.exports = {
  createRequest,
  getMyRequests,
  getIncomingRequests,
  decideRequest,
  markBorrowed,
  markReturned,
};
