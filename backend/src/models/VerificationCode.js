// Lendly email verification code model.
// Stores a hashed verification code with an expiry time.

const mongoose = require("mongoose");

const verificationCodeSchema = new mongoose.Schema(
  {
    // College email address being verified.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Purpose of this verification record.
    purpose: {
      type: String,
      enum: ["verify-email"],
      default: "verify-email",
      required: true,
    },

    // Store the HMAC hash, never the original code.
    codeHash: {
      type: String,
      required: true,
      select: false,
    },

    // MongoDB can automatically remove expired records.
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },

    // Limit incorrect verification attempts.
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
  },
  {
    timestamps: true,
  }
);

// Allow only one active record per email and purpose.
verificationCodeSchema.index(
  { email: 1, purpose: 1 },
  { unique: true }
);

// Export the model for the authentication controller.
module.exports = mongoose.model(
  "VerificationCode",
  verificationCodeSchema
);