const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Simple auth middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Like/Unlike a photo
router.post('/like', auth, async (req, res) => {
    try {
        const { photoUrl, isLike } = req.body;
        const currentUserId = req.user.id;

        if (!photoUrl) {
            return res.status(400).json({
                success: false,
                message: 'Photo URL is required'
            });
        }

        // Find the user who owns this photo
        const photoOwner = await User.findOne({ 'photos.url': photoUrl });

        if (!photoOwner) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }

        // Find the specific photo
        const photo = photoOwner.photos.find(p => p.url === photoUrl);

        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }

        // Initialize likes array if it doesn't exist
        if (!photo.likes) {
            photo.likes = [];
        }
        if (photo.likeCount === undefined) {
            photo.likeCount = 0;
        }

        // Clean up any null/undefined values first
        photo.likes = photo.likes.filter(userId => userId != null);

        // Check if user already liked this photo (simple array of user IDs)
        const wasLiked = photo.likes.some(userId => userId.toString() === currentUserId);

        console.log(`🔍 Debug: User ${currentUserId}, wasLiked: ${wasLiked}, current likes: [${photo.likes.join(', ')}], count: ${photo.likeCount}`);

        // Simple toggle logic
        if (wasLiked) {
            // User already liked it, so unlike it
            photo.likes = photo.likes.filter(userId => userId && userId.toString() !== currentUserId);
            photo.likeCount = Math.max(0, photo.likeCount - 1);
            console.log(`➖ Toggled OFF: Removed like from user ${currentUserId} (${photo.likeCount} total)`);
        } else {
            // User hasn't liked it, so like it
            photo.likes.push(currentUserId);
            photo.likeCount = photo.likeCount + 1;
            console.log(`➕ Toggled ON: Added like from user ${currentUserId} (${photo.likeCount} total)`);
        }

        // Save the updated user document
        await photoOwner.save();

        // Check the actual final state after the operation
        const actuallyLiked = photo.likes.includes(currentUserId);

        console.log(`${actuallyLiked ? '❤️' : '💔'} User ${currentUserId} ${actuallyLiked ? 'liked' : 'unliked'} photo of ${photoOwner.name} (${photo.likeCount} total likes)`);

        res.json({
            success: true,
            data: {
                likeCount: photo.likeCount,
                isLiked: actuallyLiked
            }
        });

    } catch (error) {
        console.error('❌ Error in photo like:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;