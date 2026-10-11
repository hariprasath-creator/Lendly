// Lendly student account model.
// Stores student details and a secure password hash.

const mongoose = require("mongoose");

// Required Kongu college email format:
// name.YYbranch@kongu.edu
const COLLEGE_EMAIL_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*\.\d{2}[A-Za-z]{2,}@kongu\.edu$/;

const userSchema = new mongoose.Schema(
  {
    // Student's full name.
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    // College email must be unique.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      validate: {
        validator: (value) =>
          COLLEGE_EMAIL_PATTERN.test(value),
        message: "Use name.YYbranch@kongu.edu format.",
      },
    },

    // Store the bcrypt hash, never the plain-text password.
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // New accounts must verify their email.
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // Never allow a student to assign themselves admin access.
    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student",
    },

    // Academic branch extracted from the college email.
    branch: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
    },

    // Joining year extracted from the college email.
    joiningYear: {
      type: Number,
      min: 2000,
      max: 2100,
    },

    // Administrators can disable accounts.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    // Automatically save creation and update timestamps.
    timestamps: true,
  }
);

// Export the model for authentication and other backend modules.
module.exports = mongoose.model("User", userSchema);