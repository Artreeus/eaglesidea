const mongoose = require('mongoose');

const MispDomainResultSchema = new mongoose.Schema({
    domain: {
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

module.exports = mongoose.model('MispDomainResult', MispDomainResultSchema);