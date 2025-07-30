const mongoose = require("mongoose");

const MispScanResultSchema = new mongoose.Schema({
  // The value of the indicator (e.g., '8.8.8.8', 'google.com', a hash, etc.)
  indicator: {
    type: String,
    required: true,
  },
  // The type of indicator (e.g., 'ip', 'domain', 'md5', 'sha256')
  type: {
    type: String,
    required: true,
  },
  // The full, raw JSON response from the MISP server for this indicator
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  // The timestamp when this indicator was last scanned by our system
  scannedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create a unique index on the 'indicator' field. This prevents duplicate
// entries for the same IP, hash, or domain, and makes lookups faster.
// If an entry exists, it will be updated (upserted) instead of duplicated.
MispScanResultSchema.index({ indicator: 1 }, { unique: true });

module.exports = mongoose.model("MispScanResult", MispScanResultSchema);
