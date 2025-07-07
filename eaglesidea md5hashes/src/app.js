const express = require('express');
const path = require('path');
const connectDB = require('./config/database');
const Md5Fetcher = require('./services/md5Fetcher');
const Md5Analyzer = require('./services/md5Analyzer');
const Scheduler = require('./utils/scheduler');
const Md5Hash = require('./models/Md5Hash');

class Md5MonitoringApp {
  constructor() {
    this.app = express();
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
        const totalHashes = await Md5Hash.countDocuments();
        const totalPages = Math.ceil(totalHashes / limit);

        // Fetch only one page of data from the database
        const md5hashes = await Md5Hash.find()
          .sort({ lastSeen: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        // Render the view with the current page of data and pagination info
        res.render('md5hashes', {
          md5hashes,
          currentPage: page,
          totalPages,
          totalHashes,
          limit
        });
      } catch (error) {
        console.error('❌ Error fetching MD5 hashes for web view:', error.message);
        res.status(500).send('Error fetching MD5 hash data.');
      }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Md5Hash.countDocuments();
      const activeCount = await Md5Hash.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique MD5 hashes in database: ${totalCount}`);
      console.log(`✅ Active hashes: ${activeCount}`);

      if (totalCount > 0) {
        const latestHashes = await Md5Hash.find()
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

const app = new Md5MonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});
