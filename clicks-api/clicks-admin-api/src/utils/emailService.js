const { EmailClient } = require("@azure/communication-email");

const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
const senderAddress = process.env.AZURE_EMAIL_FROM;

if (!connectionString || !senderAddress) {
  console.warn("Azure Communication Services email configuration is missing");
}

const emailClient = connectionString ? new EmailClient(connectionString) : null;

/**
 * Send password reset email with OTP code
 * @param {string} recipientEmail - The recipient's email address
 * @param {string} recipientName - The recipient's name
 * @param {string} resetToken - The reset token/OTP code
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail(recipientEmail, recipientName, resetToken) {
  if (!emailClient) {
    throw new Error("Email service is not configured");
  }

  const emailMessage = {
    senderAddress: senderAddress,
    content: {
      subject: "Password Reset Request - Clicks Admin",
      plainText: `Hello ${recipientName},\n\nYou have requested to reset your password. Your password reset code is:\n\n${resetToken}\n\nThis code will expire in 15 minutes.\n\nIf you did not request this password reset, please ignore this email.\n\nBest regards,\nClicks Support Team`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1a73e8; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .code-box { background-color: #ffffff; border: 2px solid #1a73e8; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .code { font-size: 32px; font-weight: bold; color: #1a73e8; letter-spacing: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { color: #e74c3c; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Clicks Admin Portal</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello ${recipientName},</p>
              <p>You have requested to reset your password. Use the code below to reset your password:</p>
              <div class="code-box">
                <div class="code">${resetToken}</div>
              </div>
              <p><strong>This code will expire in 15 minutes.</strong></p>
              <p class="warning">If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Clicks Roadside Assistance. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    recipients: {
      to: [{ address: recipientEmail }]
    }
  };

  try {
    const poller = await emailClient.beginSend(emailMessage);
    const result = await poller.pollUntilDone();
    console.log(`Email sent successfully. Message ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send password reset email");
  }
}

/**
 * Send password reset confirmation email
 * @param {string} recipientEmail - The recipient's email address
 * @param {string} recipientName - The recipient's name
 * @returns {Promise<void>}
 */
async function sendPasswordResetConfirmationEmail(recipientEmail, recipientName) {
  if (!emailClient) {
    throw new Error("Email service is not configured");
  }

  const emailMessage = {
    senderAddress: senderAddress,
    content: {
      subject: "Password Reset Successful - Clicks Admin",
      plainText: `Hello ${recipientName},\n\nYour password has been successfully reset.\n\nIf you did not perform this action, please contact support immediately.\n\nBest regards,\nClicks Support Team`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #27ae60; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { color: #e74c3c; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Clicks Admin Portal</h1>
            </div>
            <div class="content">
              <h2>Password Reset Successful</h2>
              <p>Hello ${recipientName},</p>
              <p>Your password has been successfully reset. You can now log in with your new password.</p>
              <p class="warning">If you did not perform this action, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Clicks Roadside Assistance. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    },
    recipients: {
      to: [{ address: recipientEmail }]
    }
  };

  try {
    const poller = await emailClient.beginSend(emailMessage);
    const result = await poller.pollUntilDone();
    console.log(`Confirmation email sent successfully. Message ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    throw new Error("Failed to send password reset confirmation email");
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail
};
