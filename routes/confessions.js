const express = require('express');
const jwt = require('jsonwebtoken');
const Confession = require('../models/Confession');
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

// Get confessions for user's college
router.get('/', auth, async (req, res) => {
    try {
        const { category = 'all', page = 1, limit = 20 } = req.query;

        // Get current user to find their college
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Build query
        const query = {
            college: currentUser.college,
            isReported: false
        };

        if (category !== 'all') {
            query.category = category;
        }

        // Get confessions with pagination
        const confessions = await Confession.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        // Format confessions for frontend
        const formattedConfessions = confessions.map(confession => {
            // Calculate reaction counts
            const reactionCounts = { heart: 0, laugh: 0, fire: 0, sad: 0 };
            if (confession.reactions && Array.isArray(confession.reactions)) {
                confession.reactions.forEach(reaction => {
                    if (reaction.type && reactionCounts.hasOwnProperty(reaction.type)) {
                        reactionCounts[reaction.type]++;
                    }
                });
            }

            return {
                id: confession._id,
                content: confession.content,
                category: confession.category,
                reactions: reactionCounts,
                commentCount: confession.comments ? confession.comments.length : 0,
                timeAgo: getTimeAgo(confession.createdAt),
                isAnonymous: confession.isAnonymous,
                // Check user's reactions
                userReactions: {
                    heart: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'heart') || false,
                    laugh: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'laugh') || false,
                    fire: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'fire') || false,
                    sad: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'sad') || false
                }
            };
        });

        console.log(`📖 Found ${formattedConfessions.length} confessions for ${currentUser.college}`);

        res.json({
            success: true,
            data: {
                confessions: formattedConfessions,
                hasMore: confessions.length === parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching confessions:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create new confession
router.post('/', auth, async (req, res) => {
    try {
        const { content, category = 'general' } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        if (content.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'Content too short (min 3 characters)' });
        }

        if (content.length > 1000) {
            return res.status(400).json({ success: false, message: 'Content too long (max 1000 characters)' });
        }

        // Validate category
        const validCategories = ['crush', 'academic', 'funny', 'support', 'general'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ success: false, message: 'Invalid category' });
        }

        // Get current user
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create confession
        const confession = new Confession({
            userId: req.user.userId,
            content: content.trim(),
            category,
            college: currentUser.college,
            isAnonymous: true,
            reactions: [],
            comments: [],
            upvotes: []
        });

        await confession.save();

        console.log(`✍️ New confession created by user ${req.user.userId} in ${currentUser.college}`);

        res.status(201).json({
            success: true,
            data: {
                confession: {
                    id: confession._id,
                    content: confession.content,
                    category: confession.category,
                    reactions: { heart: 0, laugh: 0, fire: 0, sad: 0 },
                    commentCount: 0,
                    timeAgo: 'now',
                    isAnonymous: true,
                    userReactions: { heart: false, laugh: false, fire: false, sad: false }
                }
            }
        });

    } catch (error) {
        console.error('❌ Error creating confession:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// React to confession
router.post('/:id/react', auth, async (req, res) => {
    try {
        const confessionId = req.params.id;
        const userId = req.user.userId;
        const { type } = req.body;

        if (!['heart', 'laugh', 'fire', 'sad'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid reaction type' });
        }

        const confession = await Confession.findById(confessionId);
        if (!confession) {
            return res.status(404).json({ success: false, message: 'Confession not found' });
        }

        // Initialize reactions array if it doesn't exist
        if (!confession.reactions || !Array.isArray(confession.reactions)) {
            confession.reactions = [];
        }

        // Check if user already reacted with this type
        const existingReactionIndex = confession.reactions.findIndex(
            reaction => reaction.userId.toString() === userId && reaction.type === type
        );

        if (existingReactionIndex !== -1) {
            // Remove reaction
            confession.reactions.splice(existingReactionIndex, 1);
        } else {
            // Remove any other reaction from this user first
            confession.reactions = confession.reactions.filter(
                reaction => reaction.userId.toString() !== userId
            );
            // Add new reaction
            confession.reactions.push({ userId, type });
        }

        await confession.save();

        // Calculate new reaction counts
        const reactionCounts = { heart: 0, laugh: 0, fire: 0, sad: 0 };
        if (confession.reactions && Array.isArray(confession.reactions)) {
            confession.reactions.forEach(reaction => {
                if (reaction.type && reactionCounts.hasOwnProperty(reaction.type)) {
                    reactionCounts[reaction.type]++;
                }
            });
        }

        res.json({
            success: true,
            data: {
                reactionCounts,
                userReacted: existingReactionIndex === -1
            }
        });

    } catch (error) {
        console.error('❌ Error reacting to confession:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add comment to confession
router.post('/:id/comments', auth, async (req, res) => {
    try {
        const confessionId = req.params.id;
        const userId = req.user.userId;
        const { content } = req.body;

        console.log(`💬 Adding comment to confession ${confessionId} by user ${userId}`);

        // Validate confession ID format
        if (!confessionId || !confessionId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid confession ID format' });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Comment content is required' });
        }

        if (content.length > 500) {
            return res.status(400).json({ success: false, message: 'Comment too long (max 500 characters)' });
        }

        const confession = await Confession.findById(confessionId);
        if (!confession) {
            return res.status(404).json({ success: false, message: 'Confession not found' });
        }

        // Get current user to verify college access
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if user has access (same college)
        if (confession.college !== currentUser.college) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Ensure comments array exists
        if (!Array.isArray(confession.comments)) {
            confession.comments = [];
        }

        // Add comment using findByIdAndUpdate to avoid full document validation
        const newComment = {
            userId,
            content: content.trim(),
            isAnonymous: true,
            upvotes: [],
            replies: []
        };

        const updatedConfession = await Confession.findByIdAndUpdate(
            confessionId,
            { $push: { comments: newComment } },
            { new: true, runValidators: false } // Skip validation to avoid userId issues
        );

        if (!updatedConfession) {
            return res.status(404).json({ success: false, message: 'Failed to update confession' });
        }

        console.log(`💬 Comment added successfully to confession ${confessionId}`);

        // Format the new comment for response
        const addedComment = updatedConfession.comments[updatedConfession.comments.length - 1];
        const formattedComment = {
            id: addedComment._id,
            content: addedComment.content,
            author: 'Anonymous',
            timeAgo: 'now',
            upvotes: 0,
            replies: []
        };

        console.log(`💬 New comment added to confession ${confessionId} by user ${userId}`);

        res.status(201).json({
            success: true,
            data: {
                comment: formattedComment,
                totalComments: updatedConfession.comments.length
            }
        });

    } catch (error) {
        console.error('❌ Error adding comment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add reply to comment
router.post('/:id/comments/:commentId/replies', auth, async (req, res) => {
    try {
        const { id: confessionId, commentId } = req.params;
        const userId = req.user.userId;
        const { content } = req.body;

        console.log(`💬 Adding reply to comment ${commentId} in confession ${confessionId} by user ${userId}`);

        // Validate IDs format
        if (!confessionId || !confessionId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid confession ID format' });
        }

        if (!commentId || !commentId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ success: false, message: 'Invalid comment ID format' });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Reply content is required' });
        }

        if (content.length > 500) {
            return res.status(400).json({ success: false, message: 'Reply too long (max 500 characters)' });
        }

        const confession = await Confession.findById(confessionId);
        if (!confession) {
            return res.status(404).json({ success: false, message: 'Confession not found' });
        }

        const comment = confession.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        // Get current user to verify college access
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if user has access (same college)
        if (confession.college !== currentUser.college) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Add reply using MongoDB update operation
        const newReply = {
            userId,
            content: content.trim(),
            isAnonymous: true,
            upvotes: [],
            createdAt: new Date()
        };

        const updatedConfession = await Confession.findOneAndUpdate(
            { _id: confessionId, 'comments._id': commentId },
            { $push: { 'comments.$.replies': newReply } },
            { new: true, runValidators: false }
        );

        if (!updatedConfession) {
            return res.status(404).json({ success: false, message: 'Failed to update comment' });
        }

        console.log(`💬 Reply added successfully to comment ${commentId}`);

        // Format the new reply for response
        const updatedComment = updatedConfession.comments.id(commentId);
        const addedReply = updatedComment.replies[updatedComment.replies.length - 1];
        const formattedReply = {
            id: addedReply._id,
            content: addedReply.content,
            author: 'Anonymous',
            timeAgo: 'now',
            upvotes: 0
        };

        console.log(`💬 New reply added to comment ${commentId} by user ${userId}`);

        res.status(201).json({
            success: true,
            data: {
                reply: formattedReply
            }
        });

    } catch (error) {
        console.error('❌ Error adding reply:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get single confession by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const confessionId = req.params.id;
        console.log('📖 Loading confession:', confessionId);

        // Get current user to verify college access
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Find confession
        const confession = await Confession.findById(confessionId).lean();
        if (!confession) {
            return res.status(404).json({ success: false, message: 'Confession not found' });
        }

        // Check if user has access (same college)
        if (confession.college !== currentUser.college) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Calculate reaction counts
        const reactionCounts = { heart: 0, laugh: 0, fire: 0, sad: 0 };
        if (confession.reactions && Array.isArray(confession.reactions)) {
            confession.reactions.forEach(reaction => {
                if (reaction.type && reactionCounts.hasOwnProperty(reaction.type)) {
                    reactionCounts[reaction.type]++;
                }
            });
        }

        // Format comments
        const formattedComments = confession.comments?.map(comment => ({
            id: comment._id,
            content: comment.content,
            author: 'Anonymous',
            timeAgo: getTimeAgo(comment.createdAt),
            upvotes: comment.upvotes ? comment.upvotes.length : 0,
            replies: comment.replies?.map(reply => ({
                id: reply._id,
                content: reply.content,
                author: 'Anonymous',
                timeAgo: getTimeAgo(reply.createdAt),
                upvotes: reply.upvotes ? reply.upvotes.length : 0
            })) || []
        })) || [];

        // Format confession for frontend
        const formattedConfession = {
            id: confession._id,
            content: confession.content,
            category: confession.category,
            reactions: reactionCounts,
            timeAgo: getTimeAgo(confession.createdAt),
            isAnonymous: confession.isAnonymous,
            comments: formattedComments,
            // Check user's reactions
            userReactions: {
                heart: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'heart') || false,
                laugh: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'laugh') || false,
                fire: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'fire') || false,
                sad: confession.reactions?.some(r => r.userId.toString() === req.user.userId && r.type === 'sad') || false
            }
        };

        console.log(`✅ Loaded confession: ${confession.category} - ${confession.content.substring(0, 50)}...`);

        res.json({
            success: true,
            data: {
                confession: formattedConfession
            }
        });

    } catch (error) {
        console.error('❌ Error fetching confession:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function to calculate time ago
function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
    return `${Math.floor(diffInSeconds / 604800)}w`;
}

module.exports = router;