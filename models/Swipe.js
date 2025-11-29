const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({
    swiper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    swiped: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        enum: ['like', 'pass', 'superlike'],
        required: true
    },
    swipedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate swipes
swipeSchema.index({ swiper: 1, swiped: 1 }, { unique: true });
swipeSchema.index({ swiped: 1, action: 1 });

module.exports = mongoose.model('Swipe', swipeSchema);