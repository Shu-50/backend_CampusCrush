const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Upload multiple files
const uploadFields = upload.fields([
    { name: 'selfiePhoto', maxCount: 1 },
    { name: 'collegeIdPhoto', maxCount: 1 }
]);

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'campus-crush-secret', { expiresIn: '7d' });
};

// Register
router.post('/register', uploadFields, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Basic validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (!req.files || !req.files.selfiePhoto || !req.files.collegeIdPhoto) {
            return res.status(400).json({
                success: false,
                message: 'Both selfie and college ID photos are required'
            });
        }

        if (!email.includes('@')) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        // Upload selfie photo to Cloudinary
        let selfieData = null;
        try {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    {
                        resource_type: 'image',
                        folder: 'campus-crush/verification/selfies',
                        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.files.selfiePhoto[0].buffer);
            });

            selfieData = {
                url: result.secure_url,
                publicId: result.public_id,
                uploadedAt: new Date()
            };
        } catch (uploadError) {
            console.error('Selfie upload error:', uploadError);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload selfie'
            });
        }

        // Upload college ID photo to Cloudinary
        let collegeIdData = null;
        try {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    {
                        resource_type: 'image',
                        folder: 'campus-crush/verification/college-ids',
                        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.files.collegeIdPhoto[0].buffer);
            });

            collegeIdData = {
                url: result.secure_url,
                publicId: result.public_id,
                uploadedAt: new Date()
            };
        } catch (uploadError) {
            console.error('College ID upload error:', uploadError);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload college ID'
            });
        }

        // Extract college from email domain
        const emailDomain = email.split('@')[1];
        const collegeName = emailDomain.split('.')[0].toUpperCase();

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create user
        const user = new User({
            name: name.trim(),
            email: email.toLowerCase(),
            password,
            college: collegeName,
            isVerified: false,
            verificationToken,
            verificationTokenExpires,
            verificationPhotos: {
                selfie: selfieData,
                collegeId: collegeIdData
            }
        });

        await user.save();

        // Send verification email
        const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken);

        if (!emailResult.success) {
            console.error('Failed to send verification email:', emailResult.error);
            // Continue with registration even if email fails
        }

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Registration successful! Please check your email to verify your account.',
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    college: user.college,
                    isVerified: user.isVerified
                }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password required'
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    college: user.college
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    try {
        // In a stateless JWT system, logout is handled client-side
        // by removing the token. Server doesn't need to do anything.
        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campus-crush-secret');
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    college: user.college,
                    photos: user.photos || [],
                    bio: user.bio || '',
                    age: user.age || null,
                    year: user.year || null,
                    branch: user.branch || null,
                    gender: user.gender || null,
                    interests: user.interests || [],
                    lookingFor: user.lookingFor || 'Not sure',
                    preference: user.preference || null
                }
            }
        });

    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 20px;
                            text-align: center;
                            max-width: 500px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        }
                        .emoji { font-size: 80px; margin-bottom: 20px; }
                        h1 { color: #333; margin-bottom: 15px; }
                        p { color: #666; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">❌</div>
                        <h1>Invalid or Expired Link</h1>
                        <p>This verification link is invalid or has expired. Please request a new verification email.</p>
                    </div>
                </body>
                </html>
            `);
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        text-align: center;
                        max-width: 500px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    }
                    .emoji { font-size: 80px; margin-bottom: 20px; }
                    h1 { color: #333; margin-bottom: 15px; }
                    p { color: #666; line-height: 1.6; }
                    .button {
                        display: inline-block;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 15px 40px;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: 600;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">✅</div>
                    <h1>Email Verified!</h1>
                    <p>Your email has been successfully verified. You can now use all features of Campus Crush!</p>
                    <p style="margin-top: 30px; color: #999; font-size: 14px;">You can close this window and return to the app.</p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).send('Server error');
    }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        user.verificationToken = verificationToken;
        user.verificationTokenExpires = verificationTokenExpires;
        await user.save();

        // Send verification email
        await sendVerificationEmail(user.email, user.name, verificationToken);

        res.json({
            success: true,
            message: 'Verification email sent successfully'
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Forgot password - send reset email
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({
                success: true,
                message: 'If an account exists with this email, you will receive password reset instructions.'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetPasswordExpires;
        await user.save();

        // Send password reset email
        await sendPasswordResetEmail(user.email, user.name, resetToken);

        res.json({
            success: true,
            message: 'If an account exists with this email, you will receive password reset instructions.'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Reset password page
router.get('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 20px;
                            text-align: center;
                            max-width: 500px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        }
                        .emoji { font-size: 80px; margin-bottom: 20px; }
                        h1 { color: #333; margin-bottom: 15px; }
                        p { color: #666; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">❌</div>
                        <h1>Invalid or Expired Link</h1>
                        <p>This password reset link is invalid or has expired. Please request a new password reset.</p>
                    </div>
                </body>
                </html>
            `);
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        max-width: 500px;
                        width: 100%;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    }
                    .emoji { font-size: 60px; text-align: center; margin-bottom: 20px; }
                    h1 { color: #333; margin-bottom: 10px; text-align: center; }
                    p { color: #666; line-height: 1.6; text-align: center; margin-bottom: 30px; }
                    .form-group { margin-bottom: 20px; }
                    label { display: block; color: #333; font-weight: 600; margin-bottom: 8px; }
                    input {
                        width: 100%;
                        padding: 15px;
                        border: 1px solid #ddd;
                        border-radius: 12px;
                        font-size: 16px;
                        box-sizing: border-box;
                    }
                    button {
                        width: 100%;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 15px;
                        border: none;
                        border-radius: 25px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    button:hover { opacity: 0.9; }
                    .message {
                        padding: 15px;
                        border-radius: 10px;
                        margin-bottom: 20px;
                        display: none;
                    }
                    .success { background: #d4edda; color: #155724; display: block; }
                    .error { background: #f8d7da; color: #721c24; display: block; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">🔐</div>
                    <h1>Reset Your Password</h1>
                    <p>Enter your new password below</p>
                    <div id="message" class="message"></div>
                    <form id="resetForm">
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="password" required minlength="6" placeholder="Enter new password">
                        </div>
                        <div class="form-group">
                            <label>Confirm Password</label>
                            <input type="password" id="confirmPassword" required minlength="6" placeholder="Confirm new password">
                        </div>
                        <button type="submit">Reset Password</button>
                    </form>
                </div>
                <script>
                    document.getElementById('resetForm').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const password = document.getElementById('password').value;
                        const confirmPassword = document.getElementById('confirmPassword').value;
                        const messageDiv = document.getElementById('message');

                        if (password !== confirmPassword) {
                            messageDiv.className = 'message error';
                            messageDiv.textContent = 'Passwords do not match';
                            return;
                        }

                        if (password.length < 6) {
                            messageDiv.className = 'message error';
                            messageDiv.textContent = 'Password must be at least 6 characters';
                            return;
                        }

                        try {
                            const response = await fetch('/api/auth/reset-password/${token}', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ password })
                            });

                            const data = await response.json();

                            if (data.success) {
                                messageDiv.className = 'message success';
                                messageDiv.textContent = 'Password reset successful! You can now close this window and login with your new password.';
                                document.getElementById('resetForm').style.display = 'none';
                            } else {
                                messageDiv.className = 'message error';
                                messageDiv.textContent = data.message || 'Failed to reset password';
                            }
                        } catch (error) {
                            messageDiv.className = 'message error';
                            messageDiv.textContent = 'An error occurred. Please try again.';
                        }
                    });
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Reset password page error:', error);
        res.status(500).send('Server error');
    }
});

// Reset password - submit new password
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+password');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;