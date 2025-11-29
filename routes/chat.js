const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Match = require('../models/Match');
const Message = require('../models/Message');

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

// Get messages for a match
router.get('/matches/:matchId/messages', auth, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const userId = req.user.userId;

        console.log('📨 Getting messages for match:', matchId, 'user:', userId);

        // Verify user is part of this match
        const match = await Match.findOne({
            _id: matchId,
            $or: [
                { user1: userId },
                { user2: userId }
            ]
        }).populate('user1 user2', 'name photos');

        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        // Get messages for this match
        const messages = await Message.find({ match: matchId })
            .populate('sender', 'name photos')
            .sort({ createdAt: 1 })
            .limit(parseInt(limit) * parseInt(page));

        // Format messages for frontend
        const formattedMessages = messages.map(msg => ({
            id: msg._id,
            content: msg.content,
            senderId: msg.sender._id.toString() === userId ? 'me' : msg.sender._id.toString(),
            senderName: msg.sender._id.toString() === userId ? 'You' : msg.sender.name,
            timestamp: msg.createdAt,
            type: msg.type || 'text',
            isRead: msg.readBy.includes(userId),
            mediaUrl: msg.mediaUrl
        }));

        // Mark messages as read
        await Message.updateMany(
            {
                match: matchId,
                sender: { $ne: userId },
                readBy: { $ne: userId }
            },
            { $addToSet: { readBy: userId } }
        );

        res.json({
            success: true,
            data: {
                messages: formattedMessages,
                match: {
                    id: match._id,
                    name: match.user1._id.toString() === userId ? match.user2.name : match.user1.name,
                    avatar: match.user1._id.toString() === userId
                        ? (match.user2.photos?.[0]?.url || `https://via.placeholder.com/50x50/7B2CBF/FFFFFF?text=${match.user2.name.charAt(0)}`)
                        : (match.user1.photos?.[0]?.url || `https://via.placeholder.com/50x50/7B2CBF/FFFFFF?text=${match.user1.name.charAt(0)}`),
                    isOnline: true // TODO: Implement real online status
                }
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Send a message
router.post('/matches/:matchId/messages', auth, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { content, type = 'text', replyTo = null } = req.body;
        const userId = req.user.userId;

        console.log('💬 Sending message to match:', matchId, 'from user:', userId);

        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Verify user is part of this match
        const match = await Match.findOne({
            _id: matchId,
            $or: [
                { user1: userId },
                { user2: userId }
            ]
        }).populate('user1 user2', 'name');

        if (!match) {
            return res.status(404).json({
                success: false,
                message: 'Match not found'
            });
        }

        // Create the message
        const message = new Message({
            match: matchId,
            sender: userId,
            content: content.trim(),
            type,
            replyTo,
            readBy: [userId] // Sender has read their own message
        });

        await message.save();
        await message.populate('sender', 'name photos');

        // Update match with last message info
        await Match.findByIdAndUpdate(matchId, {
            lastMessage: {
                content: content.trim(),
                sender: userId,
                timestamp: message.createdAt
            },
            lastActivity: new Date()
        });

        // Format message for response
        const formattedMessage = {
            id: message._id,
            content: message.content,
            senderId: 'me',
            senderName: 'You',
            timestamp: message.createdAt,
            type: message.type,
            isRead: true,
            mediaUrl: message.mediaUrl
        };

        // TODO: Send push notification to other user
        const otherUser = match.user1._id.toString() === userId ? match.user2 : match.user1;
        console.log('📱 Should send notification to:', otherUser.name);

        res.json({
            success: true,
            data: {
                message: formattedMessage
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark message as read
router.put('/messages/:messageId/read', auth, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.userId;

        console.log('✅ Marking message as read:', messageId);

        const message = await Message.findByIdAndUpdate(
            messageId,
            { $addToSet: { readBy: userId } },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        res.json({
            success: true,
            message: 'Message marked as read'
        });
    } catch (error) {
        console.error('Mark message as read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete message
router.delete('/messages/:messageId', auth, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.userId;

        console.log('🗑️ Deleting message:', messageId);

        const message = await Message.findOne({ _id: messageId, sender: userId });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found or not authorized'
            });
        }

        await Message.findByIdAndDelete(messageId);

        res.json({
            success: true,
            message: 'Message deleted'
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get unread message count
router.get('/unread-count', auth, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get all matches for this user
        const matches = await Match.find({
            $or: [
                { user1: userId },
                { user2: userId }
            ]
        });

        const matchIds = matches.map(match => match._id);

        // Count unread messages
        const unreadCount = await Message.countDocuments({
            match: { $in: matchIds },
            sender: { $ne: userId },
            readBy: { $ne: userId }
        });

        res.json({
            success: true,
            data: { unreadCount }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;