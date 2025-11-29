const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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



// Get notifications
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, type = null, unreadOnly = false } = req.query;
        const userId = req.user.userId;

        console.log('📬 Getting notifications for user:', userId);

        // Build query
        let query = { recipient: userId };
        if (type) query.type = type;
        if (unreadOnly === 'true') query.isRead = false;

        // Get real notifications from database
        let notifications = await Notification.find(query)
            .populate('sender', 'name photos')
            .sort({ createdAt: -1 })
            .limit(parseInt(page) * 20);

        // Format notifications for frontend
        const formattedNotifications = notifications.map(notif => ({
            id: notif._id,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            avatar: notif.sender && notif.sender.photos && notif.sender.photos[0]
                ? notif.sender.photos[0].url
                : (notif.sender ? `https://via.placeholder.com/40x40/7B2CBF/FFFFFF?text=${notif.sender.name.charAt(0)}` : null),
            timestamp: formatTimestamp(notif.createdAt),
            isRead: notif.isRead,
            icon: getNotificationIcon(notif.type),
            iconColor: getNotificationColor(notif.type),
            data: notif.data
        }));

        // Return only real notifications from database

        const unreadCount = formattedNotifications.filter(n => !n.isRead).length;

        res.json({
            success: true,
            data: {
                notifications: formattedNotifications,
                totalCount: formattedNotifications.length,
                unreadCount
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper functions
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

function getNotificationIcon(type) {
    switch (type) {
        case 'match': return 'heart';
        case 'like': return 'heart-outline';
        case 'message': return 'chatbubble';
        case 'confession': return 'trending-up';
        case 'comment': return 'chatbubble-outline';
        default: return 'notifications';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'match': return '#FF6B6B';
        case 'like': return '#FF6B6B';
        case 'message': return '#4ECDC4';
        case 'confession': return '#45B7D1';
        case 'comment': return '#96CEB4';
        default: return '#999999';
    }
}

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        console.log('✅ Marking notification as read:', id);

        // Update the notification in the database
        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: userId },
            { isRead: true, readAt: new Date() },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark notification as read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark all notifications as read
router.put('/mark-all-read', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        console.log('✅ Marking all notifications as read for user:', userId);

        // Update all unread notifications for the user
        const result = await Notification.updateMany(
            { recipient: userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        console.log(`✅ Marked ${result.modifiedCount} notifications as read`);

        res.json({
            success: true,
            message: `${result.modifiedCount} notifications marked as read`
        });
    } catch (error) {
        console.error('Mark all notifications as read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get unread notification count
router.get('/unread-count', auth, async (req, res) => {
    try {
        // Get real unread count from database
        const unreadCount = await Notification.countDocuments({
            recipient: req.user.userId,
            isRead: false
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