const mongoose = require('mongoose');

const hostnameSchema = new mongoose.Schema({
  hostname: {
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
hostnameSchema.index({ hostname: 1 });
hostnameSchema.index({ lastSeen: -1 });

const Hostname = mongoose.model('Hostname', hostnameSchema);

module.exports = Hostname;
