const express = require('express');
const path = require('path');
const connectDB = require('./config/database');
const Sha256Fetcher = require('./services/sha256Fetcher');
const Sha256Analyzer = require('./services/sha256Analyzer');
const Scheduler = require('./utils/scheduler');
const Sha256Hash = require('./models/Sha256Hash');

class Sha256MonitoringApp {
  constructor() {
    this.app = express(); // Create an Express app
    this.sha256Fetcher = new Sha256Fetcher();
    this.sha256Analyzer = new Sha256Analyzer();
    this.scheduler = new Scheduler(this.sha256Fetcher, this.sha256Analyzer);
    this.port = 3000; // Use a new port like 3003
  }

  async initialize() {
    try {
      console.log('🚀 Initializing SHA256 Hash Monitoring Application...');
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
        console.log(`🌐 SHA256 Hash web interface available at http://localhost:${this.port}`);
        console.log('📋 Available commands: r (run job manually), s (status), d (stats), q (quit)');
      });

      this.setupCLI();
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  setupRoutes() {
    this.app.get('/', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100; // Show 100 records per page
        const skip = (page - 1) * limit;

        // Get total number of documents for pagination calculation
        const totalHashes = await Sha256Hash.countDocuments();
        const totalPages = Math.ceil(totalHashes / limit);

        // Fetch only one page of data from the database
        const sha256hashes = await Sha256Hash.find()
          .sort({ lastSeen: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        // Render the view with the current page of data and pagination info
        res.render('sha256hashes', {
          sha256hashes,
          currentPage: page,
          totalPages,
          totalHashes,
          limit
        });
      } catch (error) {
        console.error('❌ Error fetching SHA256 hashes for web view:', error.message);
        res.status(500).send('Error fetching SHA256 hash data.');
      }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Sha256Hash.countDocuments();
      const activeCount = await Sha256Hash.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique SHA256 hashes in database: ${totalCount}`);
      console.log(`✅ Active hashes: ${activeCount}`);

      if (totalCount > 0) {
        const latestHashes = await Sha256Hash.find()
          .sort({ lastSeen: -1 })
          .limit(5)
          .select('hash lastSeen firstSeen');
        latestHashes.forEach((hash, index) => {
          const daysSinceFirst = Math.floor((new Date() - hash.firstSeen) / (1000 * 60 * 60 * 24));
          console.log(`   ${index + 1}. ${hash.hash} - Added: ${hash.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`);
        });
      }

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
        const mongoose = require('mongoose');
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

const app = new Sha256MonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});
