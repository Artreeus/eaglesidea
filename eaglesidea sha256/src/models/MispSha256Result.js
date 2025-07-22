const mongoose = require('mongoose');

const MispSha256ResultSchema = new mongoose.Schema({
    hash: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    response: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    scannedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('MispSha256Result', MispSha256ResultSchema);