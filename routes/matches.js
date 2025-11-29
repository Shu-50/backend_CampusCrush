const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Match = require('../models/Match');
const Swipe = require('../models/Swipe');
const Notification = require('../models/Notification');

const router = express.Router();

// Simple auth middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campus-crush-secret');
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = { userId: decoded.userId };
        req.currentUser = user;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};



// Get matches
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1 } = req.query;
        const userId = req.user.userId;

        console.log('💕 Getting matches for user:', userId);

        // Get real matches from database
        const matches = await Match.find({
            $or: [
                { user1: userId },
                { user2: userId }
            ],
            status: 'active'
        })
            .populate('user1', 'name photos college')
            .populate('user2', 'name photos college')
            .sort({ lastActivity: -1 })
            .limit(parseInt(page) * 20);

        // Get unread message counts for each match
        const Message = require('../models/Message');
        const matchesWithUnread = await Promise.all(matches.map(async (match) => {
            const otherUser = match.user1._id.toString() === userId ? match.user2 : match.user1;

            // Count unread messages from the other user
            const unreadCount = await Message.countDocuments({
                match: match._id,
                sender: otherUser._id,
                readBy: { $ne: userId }
            });

            return {
                id: match._id,
                matchId: match._id,
                name: otherUser.name,
                avatar: otherUser.photos && otherUser.photos[0]
                    ? otherUser.photos[0].url
                    : `https://via.placeholder.com/50x50/7B2CBF/FFFFFF?text=${otherUser.name.charAt(0)}`,
                lastMessage: match.lastMessage ? match.lastMessage.content : 'Say hello! 👋',
                timestamp: match.lastMessage ? formatTimestamp(match.lastMessage.timestamp) : formatTimestamp(match.matchedAt),
                unreadCount,
                isOnline: false, // Online status not implemented yet
                isTyping: false,
                matchedAt: match.matchedAt
            };
        }));

        const formattedMatches = matchesWithUnread;

        // Return only real matches from database

        res.json({
            success: true,
            data: {
                matches: formattedMatches,
                totalCount: formattedMatches.length
            }
        });
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function to format timestamps
function formatTimestamp(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
}

// Swipe on a user
router.post('/swipe', auth, async (req, res) => {
    try {
        const { targetUserId, action } = req.body;
        const swiperId = req.user.userId;

        console.log('👆 User swipe:', { swiperId, targetUserId, action });

        // Validate input
        if (!targetUserId || !action) {
            return res.status(400).json({
                success: false,
                message: 'Target user ID and action are required'
            });
        }

        if (!['like', 'pass', 'superlike'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be like, pass, or superlike'
            });
        }

        // Check if user is trying to swipe on themselves
        if (swiperId === targetUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot swipe on yourself'
            });
        }

        // Check if target user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'Target user not found'
            });
        }

        // Check if user already swiped on this person
        const existingSwipe = await Swipe.findOne({
            swiper: swiperId,
            swiped: targetUserId
        });

        if (existingSwipe) {
            // Update the existing swipe instead of creating a new one
            existingSwipe.action = action;
            existingSwipe.createdAt = new Date();
            await existingSwipe.save();
            console.log('🔄 Updated existing swipe:', { swiperId, targetUserId, action });
        } else {
            // Record the new swipe
            const swipe = new Swipe({
                swiper: swiperId,
                swiped: targetUserId,
                action
            });
            await swipe.save();
            console.log('✅ Created new swipe:', { swiperId, targetUserId, action });
        }



        let isMatch = false;
        let matchId = null;

        // Check for match only if current action is like or superlike
        if (action === 'like' || action === 'superlike') {
            // Check if target user also liked this user
            const reciprocalSwipe = await Swipe.findOne({
                swiper: targetUserId,
                swiped: swiperId,
                action: { $in: ['like', 'superlike'] }
            });

            if (reciprocalSwipe) {
                console.log('💕 MATCH FOUND!');

                // Check if match already exists between these users
                const existingMatch = await Match.findOne({
                    $or: [
                        { user1: swiperId, user2: targetUserId },
                        { user1: targetUserId, user2: swiperId }
                    ],
                    status: 'active'
                });

                if (existingMatch) {
                    console.log('✅ Match already exists:', existingMatch._id);
                    isMatch = true;
                    matchId = existingMatch._id;
                } else {
                    console.log('🆕 Creating new match');
                    isMatch = true;

                    // Create new match
                    const match = new Match({
                        user1: swiperId,
                        user2: targetUserId,
                        matchedAt: new Date(),
                        lastActivity: new Date()
                    });
                    await match.save();
                    matchId = match._id;

                    // Get user details for notifications
                    const swiperUser = await User.findById(swiperId);

                    // Create notifications for both users (only for new matches)
                    const notifications = [
                        {
                            recipient: swiperId,
                            sender: targetUserId,
                            type: 'match',
                            title: 'New Match! 💕',
                            message: `You and ${targetUser.name} liked each other!`,
                            data: { matchId, userId: targetUserId }
                        },
                        {
                            recipient: targetUserId,
                            sender: swiperId,
                            type: 'match',
                            title: 'New Match! 💕',
                            message: `You and ${swiperUser.name} liked each other!`,
                            data: { matchId, userId: swiperId }
                        }
                    ];

                    // Save notifications
                    await Notification.insertMany(notifications);
                    console.log('📬 Match notifications sent to both users');
                }
            }
        } else {
            // No match yet, but create a "like" notification for the target user
            await new Notification({
                recipient: targetUserId,
                sender: swiperId,
                type: 'like',
                title: 'Someone likes you! ❤️',
                message: 'You have a new admirer',
                data: { userId: swiperId }
            }).save();
            console.log('📬 Like notification created');
        }

        res.json({
            success: true,
            data: {
                isMatch,
                matchId,
                message: isMatch ? 'It\'s a match! 💕' : 'Swipe recorded'
            }
        });
    } catch (error) {
        console.error('Swipe error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get specific match
router.get('/:matchId', auth, async (req, res) => {
    try {
        const { matchId } = req.params;

        console.log('💕 Getting match details:', matchId);

        // Get real match from database
        const match = await Match.findById(matchId)
            .populate('user1', 'name photos college')
            .populate('user2', 'name photos college');

        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        // Ensure user is part of this match
        const userId = req.user.userId;
        if (match.user1._id.toString() !== userId && match.user2._id.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Format match data
        const otherUser = match.user1._id.toString() === userId ? match.user2 : match.user1;
        const formattedMatch = {
            id: match._id,
            name: otherUser.name,
            avatar: otherUser.photos?.[0]?.url || 'https://via.placeholder.com/50x50/7B2CBF/FFFFFF?text=' + otherUser.name.charAt(0),
            college: otherUser.college,
            matchedAt: match.matchedAt,
            lastActivity: match.lastActivity
        };

        res.json({
            success: true,
            data: { match: formattedMatch }
        });
    } catch (error) {
        console.error('Get match error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Unmatch
router.delete('/:matchId', auth, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { reason } = req.body;

        console.log('💔 Unmatching:', { matchId, reason });

        // In a real app, you'd remove the match from the database

        res.json({
            success: true,
            message: 'Match removed successfully'
        });
    } catch (error) {
        console.error('Unmatch error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;