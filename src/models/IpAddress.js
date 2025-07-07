const mongoose = require('mongoose');

const ipAddressSchema = new mongoose.Schema({
  ip: {
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
ipAddressSchema.index({ ip: 1 });
ipAddressSchema.index({ lastSeen: -1 });

const IpAddress = mongoose.model('IpAddress', ipAddressSchema);

module.exports = IpAddress;