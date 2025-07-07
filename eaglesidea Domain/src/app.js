const express = require('express');
const path = require('path');
const connectDB = require('./config/database');
const DomainFetcher = require('./services/domainFetcher');
const DomainAnalyzer =require('./services/domainAnalyzer');
const Scheduler = require('./utils/scheduler');
const Domain = require('./models/Domain');

class DomainMonitoringApp {
  constructor() {
    this.app = express(); // Create an Express app
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
        // Fetch all domains from the database, sorted by lastSeen
        const domains = await Domain.find().sort({ lastSeen: -1 }).lean();
        res.render('index', { domains });
      } catch (error) {
        console.error('❌ Error fetching domains for web view:', error.message);
        res.status(500).send('Error fetching domain data.');
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

const app = new DomainMonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});