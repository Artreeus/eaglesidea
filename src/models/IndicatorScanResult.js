const mongoose = require('mongoose');

const IndicatorScanResultSchema = new mongoose.Schema({
  value: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['ip', 'domain', 'hostname', 'md5', 'sha256'],
    index: true,
  },
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  scannedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create a compound index to ensure each indicator of a specific type is unique
IndicatorScanResultSchema.index({ value: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('IndicatorScanResult', IndicatorScanResultSchema);
