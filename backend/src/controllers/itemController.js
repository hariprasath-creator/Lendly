
// Lendly item APIs: browse, search, create, edit and remove listings.

const mongoose = require("mongoose");
const { z } = require("zod");
const Item = require("../models/Item");
const BorrowRequest = require("../models/BorrowRequest");

const categories = [
  "books",
  "calculators",
  "electronics",
  "lab-equipment",
  "sports",
  "stationery",
  "other",
];

const itemInput = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(1500),
  category: z.enum(categories),
  itemCondition: z.enum(["new", "good", "fair", "needs-repair"]).optional(),
  feePerDay: z.coerce.number().min(0).max(100000),
  imageUrl: z.union([z.string().url().max(2048), z.literal("")]).optional(),
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/items — public item search and category filtering.
async function getItems(req, res) {
  try {
    const filter = { status: "available" };

    if (categories.includes(req.query.category)) {
      filter.category = req.query.category;
    }

    const search = String(req.query.search || "").trim().slice(0, 100);

    if (search) {
      const safeSearch = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { title: safeSearch },
        { description: safeSearch },
      ];
    }

    const items = await Item.find(filter)
      .populate("owner", "fullName branch")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ items });
  } catch (error) {
    console.error("Browse items failed:", error.message);
    res.status(500).json({ message: "Could not load items." });
  }
}

// GET /api/items/:id — show one listing.
async function getItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item ID." });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      status: { $ne: "removed" },
    }).populate("owner", "fullName branch");

    if (!item) {
      return res.status(404).json({ message: "Item not found." });
    }

    res.json({ item });
  } catch (error) {
    console.error("Get item failed:", error.message);
    res.status(500).json({ message: "Could not load this item." });
  }
}

// POST /api/items — verified students can create listings.
async function createItem(req, res) {
  try {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        message: "Verify your college email before listing an item.",
      });
    }

    const parsed = itemInput.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Please check the item details.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const item = await Item.create({
      ...parsed.data,
      itemCondition: parsed.data.itemCondition || "good",
      imageUrl: parsed.data.imageUrl || "",
      owner: req.user._id,
    });

    res.status(201).json({
      message: "Item listed successfully.",
      item,
    });
  } catch (error) {
    console.error("Create item failed:", error.message);
    res.status(500).json({ message: "Could not create the listing." });
  }
}

// PATCH /api/items/:id — only the item owner can edit their listing.
async function updateItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item ID." });
    }

    const item = await Item.findById(req.params.id);

    if (!item || item.status === "removed") {
      return res.status(404).json({ message: "Item not found." });
    }

    if (String(item.owner) !== String(req.user._id)) {
      return res.status(403).json({
        message: "Only the owner can edit this listing.",
      });
    }

    const updateSchema = itemInput.partial().extend({
      status: z.enum(["available", "paused"]).optional(),
    });

    const parsed = updateSchema.safeParse(req.body);

    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
      return res.status(400).json({
        message: "Provide valid fields to update.",
      });
    }

    Object.assign(item, parsed.data);
    await item.save();

    res.json({ message: "Listing updated.", item });
  } catch (error) {
    console.error("Update item failed:", error.message);
    res.status(500).json({ message: "Could not update the listing." });
  }
}

// DELETE /api/items/:id — soft-delete, preserving borrowing history.
async function removeItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid item ID." });
    }

    const item = await Item.findById(req.params.id);

    if (!item || item.status === "removed") {
      return res.status(404).json({ message: "Item not found." });
    }

    if (String(item.owner) !== String(req.user._id)) {
      return res.status(403).json({
        message: "Only the owner can remove this listing.",
      });
    }

    const activeRequest = await BorrowRequest.exists({
      item: item._id,
      status: { $in: ["approved", "borrowed"] },
    });

    if (activeRequest) {
      return res.status(409).json({
        message: "Return the item before removing this listing.",
      });
    }

    item.status = "removed";
    await item.save();

    res.json({ message: "Listing removed." });
  } catch (error) {
    console.error("Remove item failed:", error.message);
    res.status(500).json({ message: "Could not remove the listing." });
  }
}

// GET /api/items/mine — return the signed-in student's listings.
async function getMyItems(req, res) {
  try {
    const items = await Item.find({
      owner: req.user._id,
      status: { $ne: "removed" },
    }).sort({ createdAt: -1 });

    res.json({ items });
  } catch (error) {
    console.error("My listings failed:", error.message);
    res.status(500).json({ message: "Could not load your listings." });
  }
}

module.exports = {
  getItems,
  getItem,
  createItem,
  updateItem,
  removeItem,
  getMyItems,
};
