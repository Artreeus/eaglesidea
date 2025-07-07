const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline');
const connectDB = require('./config/database');
const IpFetcher = require('./services/ipFetcher');
const IpAnalyzer = require('./services/ipAnalyzer');
const Scheduler = require('./utils/scheduler');
const IpAddress = require('./models/IpAddress');

class IpMonitoringApp {
  constructor() {
    this.expressApp = express(); // Express app instance
    this.ipFetcher = new IpFetcher();
    this.ipAnalyzer = new IpAnalyzer();
    this.scheduler = new Scheduler(this.ipFetcher, this.ipAnalyzer);
  }

  async initialize() {
    try {
      console.log('🚀 Initializing IP Monitoring Application...');
      
      await connectDB();
      this.setupExpress();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupGracefulShutdown();
      
      console.log('✅ Application initialized successfully!');
      console.log('📋 Available commands:');
      console.log('   - Press "r" + Enter to run job manually');
      console.log('   - Press "s" + Enter to show scheduler status');
      console.log('   - Press "d" + Enter to show database stats');
      console.log('   - Press "q" + Enter to quit');
      
      this.setupCLI();
      
    } catch (error) {
      console.error('❌ Failed to initialize application:', error.message);
      process.exit(1);
    }
  }

  /**
   * Configures and starts the Express web server.
   */
  setupExpress() {
    this.expressApp.set('view engine', 'ejs');
    this.expressApp.set('views', path.join(__dirname, 'views'));

    // Route to render the initial HTML page with the first batch of IPs
    this.expressApp.get('/', async (req, res) => {
      try {
        const initialLimit = 50; // Load first 50 IPs initially
        
        // Fetch the first batch of IPs
        const initialIps = await IpAddress.find({}).sort({ lastSeen: -1 }).limit(initialLimit);
        
        // *** FIX: Get the total count of documents in the collection ***
        const totalIps = await IpAddress.countDocuments();
        
        // Render the template, now passing the totalIps variable
        res.render('ip-list', { 
            ips: initialIps,
            totalIps: totalIps // The variable is now correctly passed
        });
      } catch (error) {
        console.error('Error fetching initial IPs for web view:', error);
        res.status(500).send("Error fetching IP addresses from the database.");
      }
    });

    // API endpoint for fetching paginated data
    this.expressApp.get('/api/ips', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const skip = (page - 1) * limit;

            const ips = await IpAddress.find({})
                .sort({ lastSeen: -1 })
                .skip(skip)
                .limit(limit);

            res.json(ips);
        } catch (error) {
            console.error('Error fetching paginated IPs:', error);
            res.status(500).json({ message: "Error fetching data" });
        }
    });

    const PORT = process.env.PORT || 3000;
    this.expressApp.listen(PORT, () => {
      console.log(`🌐 Web server running at http://localhost:${PORT}`);
    });
  }

  /**
   * Displays initial database statistics in the console.
   */
  async showInitialStats() {
    try {
      const totalCount = await IpAddress.countDocuments();
      const activeCount = await IpAddress.countDocuments({ isActive: true });
      
      console.log('\n' + '📊'.repeat(15));
      console.log('📊 CURRENT DATABASE STATISTICS');
      console.log('📊'.repeat(15));
      console.log(`🗄️  Total unique IP addresses in database: ${totalCount}`);
      console.log(`✅ Active IP addresses: ${activeCount}`);
      
      if (totalCount > 0) {
        const latestIps = await IpAddress.find()
          .sort({ lastSeen: -1 })
          .limit(5)
          .select('ip lastSeen firstSeen');
        
        console.log('\n🕐 Latest 5 IP activities:');
        latestIps.forEach((ip, index) => {
          const daysSinceFirst = Math.floor((new Date() - ip.firstSeen) / (1000 * 60 * 60 * 24));
          console.log(`   ${index + 1}. ${ip.ip} - Added: ${ip.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`);
        });
      }
      
      console.log('📊'.repeat(15));
      
    } catch (error) {
      console.error('❌ Error fetching initial stats:', error.message);
    }
  }

  /**
   * Sets up the command-line interface for user interaction.
   */
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
          await this.scheduler.runNow();
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

  /**
   * Sets up handlers for graceful shutdown on termination signals.
   */
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

// --- Application Entry Point ---
const app = new IpMonitoringApp();
app.initialize().catch((error) => {
  console.error('💥 Fatal error during initialization:', error.message);
  process.exit(1);
});
