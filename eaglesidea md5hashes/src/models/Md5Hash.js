const mongoose = require('mongoose');

const md5HashSchema = new mongoose.Schema({
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
md5HashSchema.index({ hash: 1 });
md5HashSchema.index({ lastSeen: -1 });

const Md5Hash = mongoose.model('Md5Hash', md5HashSchema);

module.exports = Md5Hash;
