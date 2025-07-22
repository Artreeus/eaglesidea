const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline');
const { spawn } = require('child_process'); // Make sure this is included

// --- Main Application Dependencies ---
const connectDB = require('./config/database');
const Domain = require('./models/Domain');
const MispDomainResult = require('./models/MispDomainResult'); // Import the new model

// --- Service Classes ---
const DomainFetcher = require('./services/domainFetcher');
const DomainAnalyzer = require('./services/domainAnalyzer');
const Scheduler = require('./utils/scheduler');

/**
 * The main class for the Domain Monitoring Application.
 */
class DomainMonitoringApp {
  constructor() {
    this.app = express(); // Create an Express app

    // --- MIDDLEWARE ---
    // Add middleware to parse JSON and URL-encoded bodies for API requests
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    this.domainFetcher = new DomainFetcher();
    this.domainAnalyzer = new DomainAnalyzer();
    this.scheduler = new Scheduler(this.domainFetcher, this.domainAnalyzer);
    this.port = process.env.PORT || 3000;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Domain Monitoring Application...');
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
        console.log(`🌐 Web interface available at http://localhost:${this.port}`);
        console.log(`🔎 MISP Domain Scanner available at http://localhost:${this.port}/misp-domain-scanner`);
        console.log('📋 Available commands: r (run job manually), s (status), d (stats), q (quit)');
      });

      this.setupCLI();
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  setupRoutes() {
    // --- ORIGINAL ROUTE for the main domain list ---
    this.app.get('/', async (req, res) => {
      try {
        const domains = await Domain.find().sort({ lastSeen: -1 }).lean();
        res.render('index', { domains });
      } catch (error) {
        console.error('❌ Error fetching domains for web view:', error.message);
        res.status(500).send('Error fetching domain data.');
      }
    });

    // --- NEW: ROUTE to render the MISP domain scanner page ---
    this.app.get('/misp-domain-scanner', (req, res) => {
        res.render('misp-domain-scanner');
    });

    // --- NEW: API ENDPOINT for manual domain scans from the web UI ---
    this.app.post('/api/misp-scan/domain/manual', (req, res) => {
        const { domains } = req.body;
        if (!domains || !Array.isArray(domains) || domains.length === 0) {
            return res.status(400).json({ message: "Please provide a non-empty array of domains." });
        }

        console.log(`🔬 Received manual scan request for ${domains.length} domains.`);
        const pythonProcess = spawn('python', ['misp_domain_scanner.py', ...domains]);
        let errorData = "";

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`[Domain Scan Python ERROR]: ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({ message: "Python script for domains failed.", error: errorData });
            }
            setTimeout(async () => {
                try {
                    const results = await MispDomainResult.find({ domain: { $in: domains } }).lean();
                    res.json(results);
                } catch (dbError) {
                    res.status(500).json({ message: "Scan completed, but failed to fetch results from DB.", error: dbError.message });
                }
            }, 3000);
        });
    });

    // --- NEW: API ENDPOINT for the Python script to upload results to ---
    this.app.post('/api/misp-results/domain/upload', async (req, res) => {
        try {
            const { results } = req.body;
            if (!results || !Array.isArray(results)) {
                return res.status(400).json({ message: 'Invalid data format. "results" array required.' });
            }
            const operations = results.map(r => ({
                updateOne: {
                    filter: { domain: r.domain },
                    update: { $set: { ...r, scannedAt: new Date() } },
                    upsert: true,
                },
            }));
            if (operations.length > 0) {
                await MispDomainResult.bulkWrite(operations);
            }
            console.log(`💾 Successfully saved ${operations.length} MISP domain scan results.`);
            res.status(200).json({ message: `Successfully saved ${operations.length} results.` });
        } catch (err) {
            console.error("❌ Error saving MISP domain results:", err.message);
            res.status(500).json({ message: "Error saving results to the database." });
        }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Domain.countDocuments();
      const activeCount = await Domain.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique domains in database: ${totalCount}`);
      console.log(`✅ Active domains: ${activeCount}`);

      if (totalCount > 0) {
        const latestDomains = await Domain.find()
          .sort({ lastSeen: -1 })
          .limit(5)
          .select('domain lastSeen firstSeen');
        latestDomains.forEach((domain, index) => {
          const daysSinceFirst = Math.floor((new Date() - domain.firstSeen) / (1000 * 60 * 60 * 24));
          console.log(`   ${index + 1}. ${domain.domain} - Added: ${domain.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`);
        });
      }

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
          console.log('\n📊 Scheduler Status:');
          console.log(`   Running: ${status.isRunning ? '🟢 Yes' : '🔴 No'}`);
          console.log(`   Current Time: ${status.currentTime}`);
          console.log(`   Next Run: ${status.nextRun}`);
          break;

        case 'd':
          await this.showInitialStats();
          break;

        case 'q':
          console.log('👋 Shutting down application...');
          process.exit(0);
          break;

        default:
          console.log('❓ Unknown command. Available commands: r, s, d, q');
      }
    });
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      try {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
        console.log('👋 Application shut down successfully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

// --- Application Start ---
const app = new DomainMonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});