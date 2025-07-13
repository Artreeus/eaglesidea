const IpAddress = require('../models/IpAddress');
const MispScanResult = require('../models/MispScanResult');
const MispScanner = require('./mispScanner');

// In-memory state management for the scan job.
// For a multi-server setup, this state should be moved to a shared store like Redis.
const scanState = {
  isRunning: false,
  processedCount: 0,
  totalCount: 0,
  maliciousCount: 0,
  cleanCount: 0,
  errorCount: 0,
  startTime: null,
  stopRequested: false, // A flag to gracefully pause the scan.
};

/**
 * Manages a long-running background job to scan all IPs in the database against MISP.
 */
class MispBulkScanner {
  constructor() {
    this.mispScanner = new MispScanner();
    this.initializeState();
  }

  // Initializes the state by getting counts from the database on startup.
  async initializeState() {
    scanState.totalCount = await IpAddress.countDocuments();
    scanState.processedCount = await MispScanResult.countDocuments();
    scanState.maliciousCount = await MispScanResult.countDocuments({ status: 'Malicious' });
    scanState.cleanCount = await MispScanResult.countDocuments({ status: 'Clean' });
    scanState.errorCount = await MispScanResult.countDocuments({ status: 'Error' });
  }

  getState() {
    return { ...scanState };
  }

  async startScan() {
    if (scanState.isRunning) {
      console.log('⚠️ MISP bulk scan is already running.');
      return;
    }

    console.log('🚀 Starting MISP Bulk Scan...');
    scanState.isRunning = true;
    scanState.stopRequested = false;
    scanState.startTime = Date.now();
    
    // Refresh counts before starting
    await this.initializeState();

    // The scan runs in the background, so the startScan method returns immediately.
    this.runScanProcess().catch(err => {
        console.error("Fatal error in scan process:", err);
        scanState.isRunning = false;
    });

    return scanState;
  }

  pauseScan() {
    if (!scanState.isRunning) {
      console.log('ℹ️ Scan is not running, nothing to pause.');
      return;
    }
    console.log('⏸️ Requesting to pause the MISP bulk scan...');
    scanState.stopRequested = true;
  }

  async resetScan() {
    if (scanState.isRunning) {
      console.log('❌ Cannot reset while a scan is running. Please pause it first.');
      return;
    }
    console.log('🗑️ Resetting MISP scan data...');
    await MispScanResult.deleteMany({});
    // Reset state variables to their initial values.
    Object.assign(scanState, {
      processedCount: 0,
      maliciousCount: 0,
      cleanCount: 0,
      errorCount: 0,
      startTime: null,
    });
    console.log('✅ MISP scan data has been reset.');
    return scanState;
  }

  async runScanProcess() {
    // Using a cursor is highly memory-efficient for iterating over millions of documents.
    const cursor = IpAddress.find().lean().cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        if (scanState.stopRequested) {
            console.log('🛑 Scan paused by user request.');
            scanState.isRunning = false;
            scanState.stopRequested = false;
            return; // Exit the loop and stop the process.
        }

        // Check if this IP has already been scanned to allow resuming.
        const alreadyScanned = await MispScanResult.exists({ ip: doc.ip });
        if (alreadyScanned) {
            continue; // Skip to the next IP.
        }

        try {
            const results = await this.mispScanner.scanIps([doc.ip]);
            const result = results[0];

            if (result) {
                await MispScanResult.create(result);

                // Update live statistics.
                scanState.processedCount++;
                if (result.status === 'Malicious') scanState.maliciousCount++;
                else if (result.status === 'Clean') scanState.cleanCount++;
                else scanState.errorCount++;
            }
        } catch (error) {
            console.error(`Error processing IP ${doc.ip}:`, error);
            scanState.errorCount++;
        }
    }

    console.log('🎉 MISP Bulk Scan Completed!');
    scanState.isRunning = false;
  }
}

module.exports = MispBulkScanner;
