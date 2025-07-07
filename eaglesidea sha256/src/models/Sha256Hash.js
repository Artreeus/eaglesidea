const mongoose = require('mongoose');

const sha256HashSchema = new mongoose.Schema({
  hash: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstSeen: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better performance
sha256HashSchema.index({ hash: 1 });
sha256HashSchema.index({ lastSeen: -1 });

const Sha256Hash = mongoose.model('Sha256Hash', sha256HashSchema);

module.exports = Sha256Hash;
