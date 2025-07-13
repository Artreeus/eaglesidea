const mongoose = require('mongoose');

/**
 * Schema for storing the results of a MISP scan for a single IP address.
 * Storing results in a separate collection is crucial for handling large-scale scans
 * without running out of memory and for providing persistent, paginated results.
 */
const mispScanResultSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true, // Ensures each IP is scanned and stored only once.
    index: true,   // Improves query performance when searching by IP.
  },
  status: {
    type: String,
    required: true,
    enum: ['Malicious', 'Clean', 'Error'], // Defines the possible outcomes of a scan.
    index: true, // Improves performance for filtering results by status (e.g., show all malicious).
  },
  found: {
    type: Boolean,
    default: false, // True if the IP was found in MISP.
  },
  details: {
    type: mongoose.Schema.Types.Mixed, // Stores the array of event details from MISP if found.
    default: null,
  },
  scannedAt: {
    type: Date,
    default: Date.now, // Timestamp for when the scan occurred.
  },
});

const MispScanResult = mongoose.model('MispScanResult', mispScanResultSchema);

module.exports = MispScanResult;
