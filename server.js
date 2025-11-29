const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(async () => {
        console.log('✅ MongoDB connected');

        // Clean up any existing users with invalid enum values
        try {
            const User = require('./models/User');

            // Fix users with invalid year values
            await User.updateMany(
                { year: { $nin: ['1st', '2nd', '3rd', 'Final', null] } },
                { $set: { year: null } }
            );

            // Fix users with invalid gender values
            await User.updateMany(
                { gender: { $nin: ['Male', 'Female', 'Non-binary', 'Other', null] } },
                { $set: { gender: null } }
            );

            // Clean up old Match collection structure
            const Match = require('./models/Match');

            // Drop old indexes that might conflict
            try {
                await Match.collection.dropIndex('users_1');
                console.log('✅ Dropped old users index');
            } catch (indexError) {
                // Index might not exist, that's okay
                console.log('ℹ️ Old users index not found (expected)');
            }

            // Remove any matches with old structure
            await Match.deleteMany({ users: { $exists: true } });
            console.log('✅ Cleaned up old match structure');

            // Remove duplicate matches (keep only the first one for each pair)
            const duplicateMatches = await Match.aggregate([
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $lt: ['$user1', '$user2'] },
                                { user1: '$user1', user2: '$user2' },
                                { user1: '$user2', user2: '$user1' }
                            ]
                        },
                        matches: { $push: '$_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: { count: { $gt: 1 } }
                }
            ]);

            for (const duplicate of duplicateMatches) {
                // Keep the first match, delete the rest
                const matchesToDelete = duplicate.matches.slice(1);
                await Match.deleteMany({ _id: { $in: matchesToDelete } });
                console.log(`✅ Removed ${matchesToDelete.length} duplicate matches`);
            }

            // Clean reset of all photo likes due to data corruption
            try {
                console.log('🧹 Resetting all photo likes to clean state...');

                // Use MongoDB updateMany to directly reset all photo likes
                const result = await User.updateMany(
                    { 'photos.0': { $exists: true } },
                    {
                        $set: {
                            'photos.$[].likes': [],
                            'photos.$[].likeCount': 0
                        }
                    }
                );

                console.log(`✅ Reset photo likes for ${result.modifiedCount} users`);
            } catch (likesResetError) {
                console.log('⚠️ Photo likes reset failed:', likesResetError.message);
            }

            // Clean up confession reactions to ensure they are arrays
            try {
                console.log('🧹 Fixing confession reactions arrays...');
                const Confession = require('./models/Confession');

                // Fix confessions where reactions is not an array
                const confessionResult = await Confession.updateMany(
                    {
                        $or: [
                            { reactions: { $exists: false } },
                            { reactions: { $not: { $type: "array" } } }
                        ]
                    },
                    { $set: { reactions: [] } }
                );

                // Fix confessions where comments is not an array
                const commentResult = await Confession.updateMany(
                    {
                        $or: [
                            { comments: { $exists: false } },
                            { comments: { $not: { $type: "array" } } }
                        ]
                    },
                    { $set: { comments: [] } }
                );

                // Fix confessions where userId is missing (delete them as they're invalid)
                const invalidConfessions = await Confession.deleteMany({
                    $or: [
                        { userId: { $exists: false } },
                        { userId: null },
                        { userId: undefined }
                    ]
                });

                console.log(`✅ Fixed reactions for ${confessionResult.modifiedCount} confessions`);
                console.log(`✅ Fixed comments for ${commentResult.modifiedCount} confessions`);
                console.log(`✅ Removed ${invalidConfessions.deletedCount} invalid confessions`);
            } catch (confessionCleanupError) {
                console.log('⚠️ Confession cleanup failed:', confessionCleanupError.message);
            }

            console.log('✅ Database cleanup completed');
        } catch (cleanupError) {
            console.log('⚠️ Database cleanup failed:', cleanupError.message);
        }
    })
    .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/confessions', require('./routes/confessions'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Campus Crush API is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Server error'
    });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
    console.log(`📱 Android: http://10.0.2.2:${PORT}/api/health`);
    console.log(`🔗 Network: http://0.0.0.0:${PORT}/api/health`);
});

module.exports = app;