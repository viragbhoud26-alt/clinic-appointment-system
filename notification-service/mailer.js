const nodemailer = require('nodemailer');

// Gmail SMTP transporter. Credentials come from environment variables only —
// never hardcoded. SMTP_PASS must be a Gmail "App Password", not the account
// password (Gmail SMTP rejects normal account passwords when 2-Step
// Verification is enabled).
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER and SMTP_PASS must be set as environment variables');
  }
  return transporter.sendMail({
    from: `"XYZ Clinic" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { sendMail };
