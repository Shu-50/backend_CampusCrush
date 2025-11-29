const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail', // You can use other services like SendGrid, Mailgun, etc.
        auth: {
            user: process.env.EMAIL_USER, // Your email
            pass: process.env.EMAIL_PASSWORD // Your email password or app password
        }
    });
};

// Send verification email
const sendVerificationEmail = async (email, name, verificationToken) => {
    try {
        const transporter = createTransporter();

        const verificationUrl = `${process.env.APP_URL || 'http://localhost:5001'}/api/auth/verify-email/${verificationToken}`;

        const mailOptions = {
            from: `"Campus Crush" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '💕 Verify Your Campus Crush Account',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .container {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            border-radius: 20px;
                            padding: 40px;
                            text-align: center;
                        }
                        .content {
                            background: white;
                            border-radius: 15px;
                            padding: 30px;
                            margin-top: 20px;
                        }
                        .emoji {
                            font-size: 60px;
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: white;
                            margin: 0;
                            font-size: 28px;
                        }
                        .button {
                            display: inline-block;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 15px 40px;
                            text-decoration: none;
                            border-radius: 25px;
                            font-weight: 600;
                            margin: 20px 0;
                            font-size: 16px;
                        }
                        .footer {
                            color: white;
                            margin-top: 20px;
                            font-size: 14px;
                        }
                        .code {
                            background: #f5f5f5;
                            padding: 15px;
                            border-radius: 10px;
                            font-size: 24px;
                            font-weight: bold;
                            letter-spacing: 3px;
                            margin: 20px 0;
                            color: #667eea;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">💕</div>
                        <h1>Welcome to Campus Crush!</h1>
                        <div class="content">
                            <h2>Hi ${name}! 👋</h2>
                            <p>Thanks for signing up! We're excited to have you join our community.</p>
                            <p>Please verify your email address by clicking the button below:</p>
                            <a href="${verificationUrl}" class="button">Verify Email Address</a>
                            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                                Or copy and paste this link in your browser:<br>
                                <span style="color: #667eea; word-break: break-all;">${verificationUrl}</span>
                            </p>
                            <p style="color: #999; font-size: 12px; margin-top: 30px;">
                                This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                            </p>
                        </div>
                        <div class="footer">
                            <p>Campus Crush - Find Your Perfect Match 💕</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Verification email sent to:', email);
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending verification email:', error);
        return { success: false, error: error.message };
    }
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetToken) => {
    try {
        const transporter = createTransporter();

        const resetUrl = `${process.env.APP_URL || 'http://localhost:5001'}/api/auth/reset-password/${resetToken}`;

        const mailOptions = {
            from: `"Campus Crush" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🔐 Reset Your Campus Crush Password',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .container {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            border-radius: 20px;
                            padding: 40px;
                            text-align: center;
                        }
                        .content {
                            background: white;
                            border-radius: 15px;
                            padding: 30px;
                            margin-top: 20px;
                        }
                        .emoji {
                            font-size: 60px;
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: white;
                            margin: 0;
                            font-size: 28px;
                        }
                        .button {
                            display: inline-block;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 15px 40px;
                            text-decoration: none;
                            border-radius: 25px;
                            font-weight: 600;
                            margin: 20px 0;
                            font-size: 16px;
                        }
                        .footer {
                            color: white;
                            margin-top: 20px;
                            font-size: 14px;
                        }
                        .warning {
                            background: #fff3cd;
                            border-left: 4px solid #ffc107;
                            padding: 15px;
                            margin: 20px 0;
                            border-radius: 5px;
                            text-align: left;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">🔐</div>
                        <h1>Password Reset Request</h1>
                        <div class="content">
                            <h2>Hi ${name}! 👋</h2>
                            <p>We received a request to reset your password for your Campus Crush account.</p>
                            <p>Click the button below to reset your password:</p>
                            <a href="${resetUrl}" class="button">Reset Password</a>
                            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                                Or copy and paste this link in your browser:<br>
                                <span style="color: #667eea; word-break: break-all;">${resetUrl}</span>
                            </p>
                            <div class="warning">
                                <strong>⚠️ Security Notice:</strong><br>
                                This link will expire in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                            </div>
                        </div>
                        <div class="footer">
                            <p>Campus Crush - Find Your Perfect Match 💕</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ Password reset email sent to:', email);
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending password reset email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail
};
