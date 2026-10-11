// Lendly borrowing request model.
// Tracks requests, fees, approval and item returns.

const mongoose = require("mongoose");

const borrowRequestSchema = new mongoose.Schema(
  {
    // The item being requested.
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },

    // The student asking to borrow the item.
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The student who owns the item.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Requested pickup and return dates.
    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return (
            value instanceof Date &&
            !Number.isNaN(value.getTime()) &&
            this.startDate instanceof Date &&
            value > this.startDate
          );
        },
        message: "The end date must be after the start date.",
      },
    },

    // Keep the agreed daily fee for this request.
    feePerDay: {
      type: Number,
      required: true,
      min: 0,
    },

    // The backend calculates and validates this value.
    totalFee: {
      type: Number,
      required: true,
      min: 0,
    },

    // The lifecycle of the borrowing request.
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "borrowed",
        "returned",
      ],
      default: "pending",
      index: true,
    },

    // Optional note from the item owner.
    ownerNote: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    // Timestamps for approval and return.
    approvedAt: {
      type: Date,
      default: null,
    },

    returnedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Help retrieve a student's requests by status and date.
borrowRequestSchema.index({
  borrower: 1,
  status: 1,
  createdAt: -1,
});

// Help item owners retrieve incoming requests.
borrowRequestSchema.index({
  owner: 1,
  status: 1,
  createdAt: -1,
});

// Export the BorrowRequest model.
module.exports = mongoose.model(
  "BorrowRequest",
  borrowRequestSchema
);
