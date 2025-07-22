const mongoose = require('mongoose');

const MispHostnameResultSchema = new mongoose.Schema({
    hostname: {
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

module.exports = mongoose.model('MispHostnameResult', MispHostnameResultSchema);