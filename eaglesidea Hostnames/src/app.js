const express = require('express');
const path = require('path');
const { spawn } = require('child_process'); // Added for running scripts
const mongoose = require('mongoose');
const readline = require('readline');
const connectDB = require('./config/database');
const HostnameFetcher = require('./services/hostnameFetcher');
const HostnameAnalyzer = require('./services/hostnameAnalyzer');
const Scheduler = require('./utils/scheduler');
const Hostname = require('./models/Hostname');
const MispHostnameResult = require('./models/MispHostnameResult'); // Import the new model

class HostnameMonitoringApp {
  constructor() {
    this.app = express(); // Create an Express app

    // Add middleware to handle JSON and URL-encoded data
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    this.hostnameFetcher = new HostnameFetcher();
    this.hostnameAnalyzer = new HostnameAnalyzer();
    this.scheduler = new Scheduler(this.hostnameFetcher, this.hostnameAnalyzer);
    this.port = 3000;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Hostname Monitoring Application...');
      await connectDB();

      // Setup view engine
      this.app.set('view engine', 'ejs');
      this.app.set('views', path.join(__dirname, 'views'));

      this.setupRoutes();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupGracefulShutdown();

      this.app.listen(this.port, () => {
        console.log(`✅ Application initialized successfully!`);
        console.log(`🌐 Hostname web interface available at http://localhost:${this.port}`);
        console.log(`🔎 MISP Hostname Scanner available at http://localhost:${this.port}/misp-hostname-scanner`);
        console.log('📋 Available commands: r (run job manually), s (status), d (stats), q (quit)');
      });

      this.setupCLI();
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  setupRoutes() {
    // Original route for listing hostnames
    this.app.get('/', async (req, res) => {
      try {
        const hostnames = await Hostname.find().sort({ lastSeen: -1 }).lean();
        res.render('hostnames', { hostnames });
      } catch (error) {
        console.error('❌ Error fetching hostnames for web view:', error.message);
        res.status(500).send('Error fetching hostname data.');
      }
    });

    // --- NEW: Route to render the MISP scanner page ---
    this.app.get('/misp-hostname-scanner', (req, res) => {
        res.render('misp-hostname-scanner');
    });

    // --- NEW: API endpoint for handling manual scan requests ---
    this.app.post('/api/misp-scan/hostname/manual', (req, res) => {
        const { hostnames } = req.body;
        if (!hostnames || !Array.isArray(hostnames) || hostnames.length === 0) {
            return res.status(400).json({ message: "Please provide an array of hostnames." });
        }

        console.log(`🔬 Received manual scan for ${hostnames.length} hostnames.`);
        const pythonProcess = spawn('python', ['misp_hostname_scanner.py', ...hostnames]);

        pythonProcess.stderr.on('data', (data) => console.error(`[Python ERROR]: ${data}`));

        pythonProcess.on('close', (code) => {
            if (code !== 0) return res.status(500).json({ message: "Python script failed." });
            
            setTimeout(async () => {
                try {
                    const results = await MispHostnameResult.find({ hostname: { $in: hostnames } }).lean();
                    res.json(results);
                } catch (dbError) {
                    res.status(500).json({ message: "Failed to fetch results from DB.", error: dbError.message });
                }
            }, 3000);
        });
    });

    // --- NEW: API endpoint for the Python script to upload results ---
    this.app.post('/api/misp-results/hostname/upload', async (req, res) => {
        try {
            const { results } = req.body;
            if (!results) return res.status(400).json({ message: '"results" array is required.' });

            const operations = results.map(r => ({
                updateOne: {
                    filter: { hostname: r.hostname },
                    update: { $set: { ...r, scannedAt: new Date() } },
                    upsert: true,
                },
            }));

            if (operations.length > 0) await MispHostnameResult.bulkWrite(operations);
            
            console.log(`💾 Saved ${operations.length} MISP hostname scan results.`);
            res.status(200).json({ message: `Successfully saved ${operations.length} results.` });
        } catch (err) {
            console.error("❌ Error saving MISP hostname results:", err.message);
            res.status(500).json({ message: "Error saving results to the database." });
        }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Hostname.countDocuments();
      const activeCount = await Hostname.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique hostnames in database: ${totalCount}`);
      console.log(`✅ Active hostnames: ${activeCount}`);
    } catch (error) {
      console.error('❌ Error fetching initial stats:', error.message);
    }
  }

  setupCLI() {
    const readline = require('readline');
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

const app = new HostnameMonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});