const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    match: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 1000
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'file'],
        default: 'text'
    },
    mediaUrl: {
        type: String,
        default: null
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    editedAt: {
        type: Date,
        default: null
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient querying
messageSchema.index({ match: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

// Virtual for checking if message is read by specific user
messageSchema.methods.isReadBy = function (userId) {
    return this.readBy.includes(userId);
};

// Static method to mark messages as read
messageSchema.statics.markAsReadByUser = async function (matchId, userId) {
    return this.updateMany(
        {
            match: matchId,
            sender: { $ne: userId },
            readBy: { $ne: userId }
        },
        { $addToSet: { readBy: userId } }
    );
};

module.exports = mongoose.model('Message', messageSchema);