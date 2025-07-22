const express = require('express');
const path = require('path');
const connectDB = require('./config/database');
const HostnameFetcher = require('./services/hostnameFetcher');
const HostnameAnalyzer = require('./services/hostnameAnalyzer');
const Scheduler = require('./utils/scheduler');
const Hostname = require('./models/Hostname');

class HostnameMonitoringApp {
  constructor() {
    this.app = express(); // Create an Express app
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
      // **FIX**: Correctly set the path to the 'views' directory inside 'src'
      this.app.set('views', path.join(__dirname, 'views'));


      this.setupRoutes();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupGracefulShutdown();

      this.app.listen(this.port, () => {
        console.log(`✅ Application initialized successfully!`);
        console.log(`🌐 Hostname web interface available at http://localhost:${this.port}`);
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
        // Fetch all hostnames from the database, sorted by lastSeen
        const hostnames = await Hostname.find().sort({ lastSeen: -1 }).lean();
        // Render a view named 'hostnames.ejs'
        res.render('hostnames', { hostnames });
      } catch (error) {
        console.error('❌ Error fetching hostnames for web view:', error.message);
        res.status(500).send('Error fetching hostname data.');
      }
    });
  }

  async showInitialStats() {
    try {
      const totalCount = await Hostname.countDocuments();
      const activeCount = await Hostname.countDocuments({ isActive: true });
      console.log(`🗄️  Total unique hostnames in database: ${totalCount}`);
      console.log(`✅ Active hostnames: ${activeCount}`);

      if (totalCount > 0) {
        const latestHostnames = await Hostname.find()
          .sort({ lastSeen: -1 })
          .limit(5)
          .select('hostname lastSeen firstSeen');
        latestHostnames.forEach((hostname, index) => {
          const daysSinceFirst = Math.floor((new Date() - hostname.firstSeen) / (1000 * 60 * 60 * 24));
          console.log(`   ${index + 1}. ${hostname.hostname} - Added: ${hostname.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`);
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

const app = new HostnameMonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});
