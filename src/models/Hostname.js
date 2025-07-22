const mongoose = require('mongoose');

const HostnameSchema = new mongoose.Schema({
  hostname: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

module.exports = mongoose.model('Hostname', HostnameSchema);
