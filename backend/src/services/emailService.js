
// Handles delivery of Lendly verification emails.

const nodemailer = require("nodemailer");

async function sendVerificationEmail(email, code) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
  } = process.env;

  // Use the configured SMTP service when all settings are available.
  const smtpConfigured = Boolean(
    SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS
  );

  if (!smtpConfigured) {
    // Never silently bypass email delivery in production.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured.");
    }

    // Local development fallback for the project demo.
    console.log("------------------------------------");
    console.log("LENDLY DEVELOPMENT EMAIL");
    console.log("Recipient:", email);
    console.log("Verification code:", code);
    console.log("This code expires in 10 minutes.");
    console.log("------------------------------------");

    return { delivered: false, developmentMode: true };
  }

  const port = Number(SMTP_PORT);

  // Create an SMTP transport using private environment settings.
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // Send plain text and HTML versions of the verification email.
  await transporter.sendMail({
    from: EMAIL_FROM || SMTP_USER,
    to: email,
    subject: "Verify your Lendly account",
    text:
      `Your Lendly verification code is ${code}. ` +
      "It expires in 10 minutes. Do not share this code.",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#17374f">Welcome to Lendly</h2>
        <p>Use this code to verify your college email:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
        <p>This code expires in 10 minutes.</p>
        <p>Do not share your verification code with anyone.</p>
      </div>
    `,
  });

  return { delivered: true, developmentMode: false };
}

module.exports = { sendVerificationEmail };
