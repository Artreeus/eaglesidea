const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  domain: {
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
domainSchema.index({ domain: 1 });
domainSchema.index({ lastSeen: -1 });

const Domain = mongoose.model('Domain', domainSchema);

module.exports = Domain;
