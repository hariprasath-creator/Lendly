
// Authentication controller for registration, email verification and login.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const User = require("../models/User");
const VerificationCode = require("../models/VerificationCode");

const {
  normalizeCollegeEmail,
  isCollegeEmail,
  getStudentDetails,
} = require("../utils/collegeEmail");

const { sendVerificationEmail } = require("../services/emailService");

// HMAC protects the short verification code if the database is exposed.
function hashVerificationCode(email, code) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${email}:${code}`)
    .digest("hex");
}

// Compare hashes without leaking the comparison through timing.
function hashesMatch(actualHex, expectedHex) {
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
}

// Return only public account information.
function publicUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    branch: user.branch,
    joiningYear: user.joiningYear,
  };
}

// Validate registration input on the server.
const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string()
    .min(8)
    .max(128)
    .regex(/[a-z]/, "Password needs a lowercase letter.")
    .regex(/[A-Z]/, "Password needs an uppercase letter.")
    .regex(/[0-9]/, "Password needs a number.")
    .regex(/[^A-Za-z0-9]/, "Password needs a special character."),
});

// Validate email-verification input.
const verificationSchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code."),
});

// Validate login input.
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

// POST /api/auth/register
async function register(req, res) {
  let createdUserId = null;
  let email = null;

  try {
    const input = registrationSchema.parse(req.body);

    email = normalizeCollegeEmail(input.email);

    if (!isCollegeEmail(email)) {
      return res.status(400).json({
        message:
          "Use the format name.YYbranch@kongu.edu for your college email.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Authentication is not configured on the server.",
      });
    }

    const existingUser = await User.findOne({ email }).select("_id");

    if (existingUser) {
      return res.status(409).json({
        message:
          "An account already exists for this email. Try signing in or verifying your email.",
      });
    }

    // Never store the submitted password in the database.
    const passwordHash = await bcrypt.hash(input.password, 12);
    const studentDetails = getStudentDetails(email);

    const user = await User.create({
      fullName: input.fullName,
      email,
      passwordHash,
      isEmailVerified: false,
      // Never accept role: "admin" from a registration request.
      role: "student",
      branch: studentDetails.branch,
      joiningYear: studentDetails.joiningYear,
    });

    createdUserId = user._id;

    // Generate a cryptographically random six-digit verification code.
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashVerificationCode(email, code);

    await VerificationCode.deleteMany({
      email,
      purpose: "verify-email",
    });

    await VerificationCode.create({
      email,
      purpose: "verify-email",
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    });

    let delivery;

    try {
      delivery = await sendVerificationEmail(email, code);
    } catch (emailError) {
      // Do not leave an unusable half-registered account.
      await VerificationCode.deleteMany({ email });
      await User.deleteOne({ _id: user._id });
      console.error("Verification email delivery failed.");
      return res.status(503).json({
        message:
          "The verification email could not be sent. Please try again later.",
      });
    }

    return res.status(201).json({
      message: delivery.developmentMode
        ? "Account created. Check the backend terminal for the development verification code."
        : "Account created. Check your college email for the verification code.",
      requiresEmailVerification: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Please check the registration details.",
        errors: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account already exists for this email.",
      });
    }

    console.error("Registration failed:", error.message);
    return res.status(500).json({
      message: "Registration could not be completed.",
    });
  }
}

// POST /api/auth/verify-email
async function verifyEmail(req, res) {
  try {
    const input = verificationSchema.parse(req.body);
    const email = normalizeCollegeEmail(input.email);

    if (!isCollegeEmail(email)) {
      return res.status(400).json({
        message: "Enter a valid college email address.",
      });
    }

    const record = await VerificationCode.findOne({
      email,
      purpose: "verify-email",
      expiresAt: { $gt: new Date() },
    }).select("+codeHash");

    if (!record) {
      return res.status(400).json({
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    if (record.attempts >= 5) {
      await VerificationCode.deleteOne({ _id: record._id });
      return res.status(429).json({
        message: "Too many attempts. Please register again or request a new code.",
      });
    }

    const submittedHash = hashVerificationCode(email, input.code);

    if (!hashesMatch(submittedHash, record.codeHash)) {
      record.attempts += 1;
      await record.save();

      return res.status(400).json({
        message: "Incorrect verification code.",
        attemptsRemaining: Math.max(0, 5 - record.attempts),
      });
    }

    const user = await User.findOneAndUpdate(
      { email, isEmailVerified: false },
      { $set: { isEmailVerified: true } },
      { new: true }
    );

    if (!user) {
      const existing = await User.findOne({ email });

      if (!existing || !existing.isEmailVerified) {
        return res.status(400).json({
          message: "This account could not be verified.",
        });
      }
    }

    await VerificationCode.deleteMany({ email });

    return res.status(200).json({
      message: "Email verified successfully. You can now sign in.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Enter your college email and six-digit verification code.",
      });
    }

    console.error("Email verification failed:", error.message);
    return res.status(500).json({
      message: "Email verification could not be completed.",
    });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const input = loginSchema.parse(req.body);
    const email = normalizeCollegeEmail(input.email);

    if (!isCollegeEmail(email)) {
      return res.status(400).json({
        message: "Enter your valid college email address.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Authentication is not configured on the server.",
      });
    }

    // Password hash is excluded by default in the User model.
    const user = await User.findOne({ email }).select("+passwordHash");

    // Use the same error for unknown emails and incorrect passwords.
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "This account is currently unavailable.",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Verify your college email before signing in.",
        requiresEmailVerification: true,
      });
    }

    // The client receives a signed token that expires after eight hours.
    const token = jwt.sign(
      { sub: String(user._id) },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      message: "Signed in successfully.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Enter a valid college email and password.",
      });
    }

    console.error("Login failed:", error.message);
    return res.status(500).json({
      message: "Sign-in could not be completed.",
    });
  }
}

// GET /api/auth/me — requires a valid bearer token.
function getMe(req, res) {
  return res.status(200).json({
    user: publicUser(req.user),
  });
}

module.exports = {
  register,
  verifyEmail,
  login,
  getMe,
};
