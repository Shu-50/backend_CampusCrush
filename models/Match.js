const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    user1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    user2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'unmatched', 'blocked'],
        default: 'active'
    },
    matchedAt: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    lastMessage: {
        content: String,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Index for faster queries
matchSchema.index({ user1: 1, user2: 1 });
matchSchema.index({ user1: 1 });
matchSchema.index({ user2: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ matchedAt: -1 });

module.exports = mongoose.model('Match', matchSchema);