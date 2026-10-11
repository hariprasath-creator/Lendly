// Lendly item model.
// Stores campus items that students offer for borrowing.

const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    // Name of the item.
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    // Details about the item and borrowing terms.
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1500,
    },

    // Only the categories supported by Lendly are accepted.
    category: {
      type: String,
      required: true,
      enum: [
        "books",
        "calculators",
        "electronics",
        "lab-equipment",
        "sports",
        "stationery",
        "other",
      ],
    },

    // The physical condition of the item.
    itemCondition: {
      type: String,
      enum: ["new", "good", "fair", "needs-repair"],
      default: "good",
    },

    // Reference to the student who owns the item.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Owner's borrowing fee per day. Zero means free.
    feePerDay: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100000,
    },

    // Optional image URL for the listing.
    imageUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2048,
    },

    // Current listing availability.
    status: {
      type: String,
      enum: ["available", "paused", "removed"],
      default: "available",
      index: true,
    },
  },
  {
    // Automatically record when the item was created or updated.
    timestamps: true,
  }
);

// Speed up browsing by category and availability.
itemSchema.index({
  category: 1,
  status: 1,
  createdAt: -1,
});

// Export the Item model for controllers and routes.
module.exports = mongoose.model("Item", itemSchema);