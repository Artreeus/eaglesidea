// models/MispScanResult.js
const mongoose = require("mongoose");

const MispScanResultSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true, // Ensures each IP is stored only once
    index: true,
  },
  response: {
    type: mongoose.Schema.Types.Mixed, // To store the raw JSON response from MISP
    required: true,
  },
  scannedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("MispScanResult", MispScanResultSchema);