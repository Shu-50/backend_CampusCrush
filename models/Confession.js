const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['heart', 'laugh', 'fire', 'sad'],
        required: true
    }
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 500
    },
    isAnonymous: {
        type: Boolean,
        default: true
    },
    upvotes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    replies: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: {
            type: String,
            required: true,
            maxlength: 500
        },
        isAnonymous: {
            type: Boolean,
            default: true
        },
        upvotes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

const confessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: 1000
    },
    category: {
        type: String,
        enum: ['crush', 'academic', 'funny', 'support', 'general'],
        default: 'general'
    },
    isAnonymous: {
        type: Boolean,
        default: true
    },
    upvotes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    reactions: [reactionSchema],
    comments: [commentSchema],
    isApproved: {
        type: Boolean,
        default: false
    },
    isReported: {
        type: Boolean,
        default: false
    },
    reportCount: {
        type: Number,
        default: 0
    },
    college: {
        type: String,
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for upvote count
confessionSchema.virtual('upvoteCount').get(function () {
    return this.upvotes ? this.upvotes.length : 0;
});

// Virtual for comment count
confessionSchema.virtual('commentCount').get(function () {
    return this.comments ? this.comments.length : 0;
});

// Virtual for reaction counts
confessionSchema.virtual('reactionCounts').get(function () {
    const counts = { heart: 0, laugh: 0, fire: 0, sad: 0 };
    if (this.reactions && Array.isArray(this.reactions)) {
        this.reactions.forEach(reaction => {
            if (reaction.type && counts.hasOwnProperty(reaction.type)) {
                counts[reaction.type]++;
            }
        });
    }
    return counts;
});

// Index for better query performance
confessionSchema.index({ college: 1, createdAt: -1 });
confessionSchema.index({ category: 1, createdAt: -1 });
confessionSchema.index({ isApproved: 1, createdAt: -1 });

// Pre-save middleware to set college from user and ensure arrays exist
confessionSchema.pre('save', async function (next) {
    if (this.isNew && !this.college) {
        try {
            const User = mongoose.model('User');
            const user = await User.findById(this.userId);
            if (user && user.college) {
                this.college = user.college;
            }
        } catch (error) {
            console.error('Error setting college for confession:', error);
        }
    }

    // Ensure reactions and comments are arrays
    if (!Array.isArray(this.reactions)) {
        this.reactions = [];
    }
    if (!Array.isArray(this.comments)) {
        this.comments = [];
    }
    if (!Array.isArray(this.upvotes)) {
        this.upvotes = [];
    }

    next();
});

// Method to add upvote
confessionSchema.methods.addUpvote = function (userId) {
    if (!this.upvotes.includes(userId)) {
        this.upvotes.push(userId);
        return this.save();
    }
    return Promise.resolve(this);
};

// Method to remove upvote
confessionSchema.methods.removeUpvote = function (userId) {
    this.upvotes = this.upvotes.filter(id => !id.equals(userId));
    return this.save();
};

// Method to add reaction
confessionSchema.methods.addReaction = function (userId, type) {
    // Remove existing reaction from this user
    this.reactions = this.reactions.filter(reaction => !reaction.userId.equals(userId));
    // Add new reaction
    this.reactions.push({ userId, type });
    return this.save();
};

// Method to remove reaction
confessionSchema.methods.removeReaction = function (userId) {
    this.reactions = this.reactions.filter(reaction => !reaction.userId.equals(userId));
    return this.save();
};

// Method to add comment
confessionSchema.methods.addComment = function (commentData) {
    this.comments.push(commentData);
    return this.save();
};

// Method to add reply to comment
confessionSchema.methods.addReply = function (commentId, replyData) {
    const comment = this.comments.id(commentId);
    if (comment) {
        comment.replies.push(replyData);
        return this.save();
    }
    throw new Error('Comment not found');
};

// Static method to get confessions by college
confessionSchema.statics.getByCollege = function (college, options = {}) {
    const {
        category,
        limit = 20,
        skip = 0,
        sortBy = 'createdAt',
        sortOrder = -1
    } = options;

    const query = {
        college,
        isApproved: true,
        isReported: false
    };

    if (category && category !== 'all') {
        query.category = category;
    }

    return this.find(query)
        .populate('userId', 'name avatar')
        .populate('comments.userId', 'name avatar')
        .populate('reactions.userId', 'name')
        .sort({ [sortBy]: sortOrder })
        .limit(limit)
        .skip(skip);
};

// Static method to get trending confessions
confessionSchema.statics.getTrending = function (college, timeframe = 24) {
    const timeAgo = new Date(Date.now() - timeframe * 60 * 60 * 1000);

    return this.aggregate([
        {
            $match: {
                college,
                isApproved: true,
                isReported: false,
                createdAt: { $gte: timeAgo }
            }
        },
        {
            $addFields: {
                score: {
                    $add: [
                        { $size: '$upvotes' },
                        { $multiply: [{ $size: '$reactions' }, 0.5] },
                        { $multiply: [{ $size: '$comments' }, 2] }
                    ]
                }
            }
        },
        { $sort: { score: -1, createdAt: -1 } },
        { $limit: 10 }
    ]);
};

module.exports = mongoose.model('Confession', confessionSchema);