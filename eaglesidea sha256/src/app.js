const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const readline = require('readline');
const connectDB = require('./config/database');
const Sha256Fetcher = require('./services/sha256Fetcher');
const Sha256Analyzer = require('./services/sha256Analyzer');
const Scheduler = require('./utils/scheduler');
const Sha256Hash = require('./models/Sha256Hash');
const MispSha256Result = require('./models/MispSha256Result'); // Import the new model

class Sha256MonitoringApp {
  constructor() {
    this.app = express();
    // Add middleware for handling API requests
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    this.sha256Fetcher = new Sha256Fetcher();
    this.sha256Analyzer = new Sha256Analyzer();
    this.scheduler = new Scheduler(this.sha256Fetcher, this.sha256Analyzer);
    this.port = 3000;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing SHA256 Hash Monitoring Application...');
      await connectDB();

      this.app.set('view engine', 'ejs');
      this.app.set('views', path.join(__dirname, 'views'));

      this.setupRoutes();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupGracefulShutdown();

      this.app.listen(this.port, () => {
        console.log(`✅ Application initialized successfully!`);
        console.log(`🌐 SHA256 Hash web interface available at http://localhost:${this.port}`);
        console.log(`🔎 MISP SHA256 Scanner available at http://localhost:${this.port}/misp-sha256-scanner`);
        console.log('📋 Available commands: r (run job manually), s (status), d (stats), q (quit)');
      });

      this.setupCLI();
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  setupRoutes() {
    // Original route for listing SHA256 hashes with pagination
    this.app.get('/', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        const totalHashes = await Sha256Hash.countDocuments();
        const totalPages = Math.ceil(totalHashes / limit);
        const sha256hashes = await Sha256Hash.find().sort({ lastSeen: -1 }).skip(skip).limit(limit).lean();
        res.render('sha256hashes', { sha256hashes, currentPage: page, totalPages, totalHashes, limit });
      } catch (error) {
        console.error('❌ Error fetching SHA256 hashes for web view:', error.message);
        res.status(500).send('Error fetching SHA256 hash data.');
      }
    });

    // --- NEW: Route to render the MISP SHA256 scanner page ---
    this.app.get('/misp-sha256-scanner', (req, res) => {
        res.render('misp-sha256-scanner');
    });

    // --- NEW: API endpoint for handling manual SHA256 scan requests ---
    this.app.post('/api/misp-scan/sha256/manual', (req, res) => {
        const { hashes } = req.body;
        if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
            return res.status(400).json({ message: "Please provide an array of SHA256 hashes." });
        }

        console.log(`🔬 Received manual scan for ${hashes.length} SHA256 hashes.`);
        const pythonProcess = spawn('python', ['misp_sha256_scanner.py', ...hashes]);

        pythonProcess.stderr.on('data', (data) => console.error(`[Python ERROR]: ${data}`));

        pythonProcess.on('close', (code) => {
            if (code !== 0) return res.status(500).json({ message: "Python script failed." });
            
            setTimeout(async () => {
                try {
                    const results = await MispSha256Result.find({ hash: { $in: hashes } }).lean();
                    res.json(results);
                } catch (dbError) {
                    res.status(500).json({ message: "Failed to fetch results from DB.", error: dbError.message });
                }
            }, 3000);
        });
    });

    // --- NEW: API endpoint for the Python script to upload SHA256 results ---
    this.app.post('/api/misp-results/sha256/upload', async (req, res) => {
        try {
            const { results } = req.body;
            if (!results) return res.status(400).json({ message: '"results" array is required.' });

            const operations = results.map(r => ({
                updateOne: {
                    filter: { hash: r.hash },
                    update: { $set: { ...r, scannedAt: new Date() } },
                    upsert: true,
                },
            }));

            if (operations.length > 0) await MispSha256Result.bulkWrite(operations);
            
            console.log(`💾 Saved ${operations.length} MISP SHA256 scan results.`);
            res.status(200).json({ message: `Successfully saved ${operations.length} results.` });
        } catch (err) {
            console.error("❌ Error saving MISP SHA256 results:", err.message);
            res.status(500).json({ message: "Error saving results to the database." });
        }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Sha256Hash.countDocuments();
      const activeCount = await Sha256Hash.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique SHA256 hashes in database: ${totalCount}`);
      console.log(`✅ Active hashes: ${activeCount}`);
    } catch (error) {
      console.error('❌ Error fetching initial stats:', error.message);
    }
  }

  setupCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', async (input) => {
      const command = input.trim().toLowerCase();
      switch (command) {
        case 'r':
          console.log('\n🔧 Running job manually...');
          await this.scheduler.executeJob();
          break;
        case 's':
          const status = this.scheduler.getStatus();
          console.log(`\n📊 Scheduler Status: Running: ${status.isRunning ? '🟢 Yes' : '🔴 No'}, Next Run: ${status.nextRun}`);
          break;
        case 'd':
          await this.showInitialStats();
          break;
        case 'q':
          console.log('👋 Shutting down application...');
          process.exit(0);
          break;
        default:
          console.log('❓ Unknown command.');
      }
    });
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down...`);
      try {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

const app = new Sha256MonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});