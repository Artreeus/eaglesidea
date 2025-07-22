const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const readline = require('readline');
const connectDB = require('./config/database');
const Md5Fetcher = require('./services/md5Fetcher');
const Md5Analyzer = require('./services/md5Analyzer');
const Scheduler = require('./utils/scheduler');
const Md5Hash = require('./models/Md5Hash');
const MispMd5Result = require('./models/MispMd5Result'); // Import the new model

class Md5MonitoringApp {
  constructor() {
    this.app = express();
    // Add middleware for handling API requests
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    this.md5Fetcher = new Md5Fetcher();
    this.md5Analyzer = new Md5Analyzer();
    this.scheduler = new Scheduler(this.md5Fetcher, this.md5Analyzer);
    this.port = 3000;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing MD5 Hash Monitoring Application...');
      await connectDB();

      this.app.set('view engine', 'ejs');
      this.app.set('views', path.join(__dirname, 'views'));

      this.setupRoutes();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupGracefulShutdown();

      this.app.listen(this.port, () => {
        console.log(`✅ Application initialized successfully!`);
        console.log(`🌐 MD5 Hash web interface available at http://localhost:${this.port}`);
        console.log(`🔎 MISP MD5 Scanner available at http://localhost:${this.port}/misp-md5-scanner`);
        console.log('📋 Available commands: r (run job manually), s (status), d (stats), q (quit)');
      });

      this.setupCLI();
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  setupRoutes() {
    // Original route for listing MD5 hashes with pagination
    this.app.get('/', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        const totalHashes = await Md5Hash.countDocuments();
        const totalPages = Math.ceil(totalHashes / limit);
        const md5hashes = await Md5Hash.find().sort({ lastSeen: -1 }).skip(skip).limit(limit).lean();
        res.render('md5hashes', { md5hashes, currentPage: page, totalPages, totalHashes, limit });
      } catch (error) {
        console.error('❌ Error fetching MD5 hashes for web view:', error.message);
        res.status(500).send('Error fetching MD5 hash data.');
      }
    });

    // --- NEW: Route to render the MISP MD5 scanner page ---
    this.app.get('/misp-md5-scanner', (req, res) => {
        res.render('misp-md5-scanner');
    });

    // --- NEW: API endpoint for handling manual MD5 scan requests ---
    this.app.post('/api/misp-scan/md5/manual', (req, res) => {
        const { hashes } = req.body;
        if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
            return res.status(400).json({ message: "Please provide an array of MD5 hashes." });
        }

        console.log(`🔬 Received manual scan for ${hashes.length} MD5 hashes.`);
        const pythonProcess = spawn('python', ['misp_md5_scanner.py', ...hashes]);

        pythonProcess.stderr.on('data', (data) => console.error(`[Python ERROR]: ${data}`));

        pythonProcess.on('close', (code) => {
            if (code !== 0) return res.status(500).json({ message: "Python script failed." });
            
            setTimeout(async () => {
                try {
                    const results = await MispMd5Result.find({ hash: { $in: hashes } }).lean();
                    res.json(results);
                } catch (dbError) {
                    res.status(500).json({ message: "Failed to fetch results from DB.", error: dbError.message });
                }
            }, 3000);
        });
    });

    // --- NEW: API endpoint for the Python script to upload MD5 results ---
    this.app.post('/api/misp-results/md5/upload', async (req, res) => {
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

            if (operations.length > 0) await MispMd5Result.bulkWrite(operations);
            
            console.log(`💾 Saved ${operations.length} MISP MD5 scan results.`);
            res.status(200).json({ message: `Successfully saved ${operations.length} results.` });
        } catch (err) {
            console.error("❌ Error saving MISP MD5 results:", err.message);
            res.status(500).json({ message: "Error saving results to the database." });
        }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Md5Hash.countDocuments();
      const activeCount = await Md5Hash.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique MD5 hashes in database: ${totalCount}`);
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

const app = new Md5MonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});