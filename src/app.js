const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const readline = require("readline");

// --- Main Application Dependencies ---
const connectDB = require("./config/database");
const IpAddress = require("./models/IpAddress");
const MispScanResult = require("./models/MispScanResult");

// --- Service Classes ---
const IpFetcher = require("./services/ipFetcher");
const IpAnalyzer = require("./services/ipAnalyzer");
const MispBulkScanner = require("./services/mispBulkScanner");
const Scheduler = require("./utils/scheduler");

/**
 * The main class for the IP Monitoring Application.
 * It initializes the server, sets up routes, manages scheduled jobs,
 * provides a command-line interface, and handles the application lifecycle.
 */
class IpMonitoringApp {
  constructor() {
    this.expressApp = express();
    // *** ADD THIS: Middleware to parse JSON bodies ***
    this.expressApp.use(express.json()); // --- Instantiate all services ---
    this.ipFetcher = new IpFetcher();
    this.ipAnalyzer = new IpAnalyzer();
    this.mispBulkScanner = new MispBulkScanner();
    this.scheduler = new Scheduler(this.ipFetcher, this.ipAnalyzer);
  }

  async initialize() {
    try {
      console.log("🚀 Initializing IP Monitoring Application..."); // Connect to the database first
      await connectDB(); // Setup the web server and its routes
      this.setupExpress(); // Display initial statistics on startup
      await this.showInitialStats(); // Start the daily cron job for fetching IPs
      this.scheduler.start(); // Setup the interactive command-line interface
      this.setupCLI(); // Setup handlers for graceful shutdown
      this.setupGracefulShutdown();
      console.log("✅ Application initialized successfully!");
      console.log("📋 Available commands:");
      console.log('   - "r" + Enter to run daily IP fetch job manually');
      console.log('   - "s" + Enter to show scheduler status');
      console.log('   - "d" + Enter to show database stats');
      console.log('   - "q" + Enter to quit');
    } catch (error) {
      console.error("❌ Failed to initialize application:", error.message);
      process.exit(1);
    }
  }
  /**
   * Configures and starts the Express web server and its routes.
   */

  setupExpress() {
    this.expressApp.set("view engine", "ejs");
    this.expressApp.set("views", path.join(__dirname, "views")); // --- PAGE ROUTES --- // Route to render the original IP list with infinite scroll.

    this.expressApp.get("/", async (req, res) => {
      try {
        const initialLimit = 50;
        const initialIps = await IpAddress.find({})
          .sort({ lastSeen: -1 })
          .limit(initialLimit);
        const totalIps = await IpAddress.countDocuments();
        res.render("ip-list", { ips: initialIps, totalIps: totalIps });
      } catch (error) {
        console.error("Error fetching initial IPs for web view:", error);
        res.status(500).send("Error fetching IP addresses from the database.");
      }
    }); // Route to render the new MISP dashboard.

    this.expressApp.get("/misp-dashboard", (req, res) => {
      res.render("misp-dashboard");
    });

    // *** MODIFIED: This route now serves the main view for the results page ***
    this.expressApp.get("/misp-results", async (req, res) => {
      // This route just renders the page structure.
      // The data will be fetched by the browser via the API.
      res.render("misp-results");
    }); // --- API ROUTES --- // API endpoint for fetching paginated data for the original ip-list page.

    this.expressApp.get("/api/ips", async (req, res) => {
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
        res.status(500).json({ message: "Error fetching data" });
      }
    }); // API endpoints for controlling the bulk scanner.

    this.expressApp.post("/api/misp-scan/start", (req, res) => {
      this.mispBulkScanner.startScan();
      res.status(202).json({ message: "Scan start request received." });
    });

    this.expressApp.post("/api/misp-scan/pause", (req, res) => {
      this.mispBulkScanner.pauseScan();
      res.status(202).json({ message: "Scan pause request received." });
    });

    this.expressApp.post("/api/misp-scan/reset", async (req, res) => {
      await this.mispBulkScanner.resetScan();
      res.status(200).json({ message: "Scan data has been reset." });
    }); // API endpoint for getting the scanner's live status.

    this.expressApp.get("/api/misp-scan/status", (req, res) => {
      const state = this.mispBulkScanner.getState();
      res.json(state);
    });

    // *** MODIFIED: API endpoint for fetching paginated & searchable scan results ***
    this.expressApp.get("/api/misp-results", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25; // Default limit
        const searchTerm = req.query.searchTerm || "";

        const query = {};
        // If a search term is provided, create a regex for a case-insensitive search
        if (searchTerm) {
          query.ip = { $regex: searchTerm, $options: "i" };
        }

        const skip = (page - 1) * limit;

        const results = await MispScanResult.find(query)
          .sort({ "response.response.Attribute.0.last_seen": -1, ip: -1 }) // Sort by last_seen if available
          .skip(skip)
          .limit(limit)
          .lean();

        const totalResults = await MispScanResult.countDocuments(query);

        res.json({
          results,
          total: totalResults, // Send total count for pagination
          currentPage: page,
          totalPages: Math.ceil(totalResults / limit),
        });
      } catch (error) {
        console.error("❌ Error fetching MISP results:", error);
        res.status(500).json({ message: "Error fetching results." });
      }
    }); // POST /api/misp-results/upload

    this.expressApp.post("/api/misp-results/upload", async (req, res) => {
      try {
        const results = req.body.results; // Expecting an array of results

        if (!results || !Array.isArray(results)) {
          return res
            .status(400)
            .json({
              message: 'Invalid data format. "results" array is required.',
            });
        } // Use bulkWrite for efficient upserting

        const operations = results.map((r) => ({
          updateOne: {
            filter: { ip: r.ip },
            update: { $set: { ...r, scannedAt: new Date() } },
            upsert: true,
          },
        }));

        if (operations.length > 0) {
          await MispScanResult.bulkWrite(operations);
        }

        res
          .status(200)
          .json({
            message: `Successfully saved ${operations.length} results.`,
          });
      } catch (err) {
        console.error("❌ Error saving results:", err.message);
        res.status(500).json({ message: "Error saving results" });
      }
    });

    // This route remains for viewing individual details if needed
    this.expressApp.get("/misp-results/:ip", async (req, res) => {
      const result = await MispScanResult.findOne({ ip: req.params.ip }).lean();
      if (!result) return res.status(404).send("Not found");
      res.render("misp-details", { result });
    });

    const PORT = process.env.PORT || 3000;
    this.expressApp.listen(PORT, () => {
      console.log(`\n🌐 Web server running at http://localhost:${PORT}`);
      console.log(`   - Main IP List: http://localhost:${PORT}/`);
      console.log(
        `   - MISP Dashboard: http://localhost:${PORT}/misp-dashboard`
      );
      console.log(`   - MISP Results: http://localhost:${PORT}/misp-results`);
    });
  }
  /**
   * Displays initial database statistics in the console on startup.
   */

  async showInitialStats() {
    try {
      const totalCount = await IpAddress.countDocuments();
      const activeCount = await IpAddress.countDocuments({ isActive: true });
      console.log("\n" + "📊".repeat(15));
      console.log("📊 CURRENT DATABASE STATISTICS");
      console.log("📊".repeat(15));
      console.log(
        `🗄️  Total unique IP addresses in database: ${totalCount.toLocaleString()}`
      );
      console.log(`✅ Active IP addresses: ${activeCount.toLocaleString()}`);
      if (totalCount > 0) {
        const latestIps = await IpAddress.find()
          .sort({ lastSeen: -1 })
          .limit(5)
          .select("ip lastSeen firstSeen");
        console.log("\n🕐 Latest 5 IP activities:");
        latestIps.forEach((ip, index) => {
          const daysSinceFirst = Math.floor(
            (new Date() - ip.firstSeen) / (1000 * 60 * 60 * 24)
          );
          console.log(
            `   ${index + 1}. ${
              ip.ip
            } - Added: ${ip.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`
          );
        });
      }
      console.log("📊".repeat(15) + "\n");
    } catch (error) {
      console.error("❌ Error fetching initial stats:", error.message);
    }
  }
  /**
   * Sets up the command-line interface for user interaction.
   */

  setupCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("line", async (input) => {
      const command = input.trim().toLowerCase();
      switch (command) {
        case "r":
          console.log("\n🔧 Running daily IP fetch job manually...");
          await this.scheduler.runNow();
          break;
        case "s":
          const status = this.scheduler.getStatus();
          console.log("\n🗓️  Scheduler Status:");
          console.log(`   Running: ${status.isRunning ? "🟢 Yes" : "🔴 No"}`);
          console.log(`   Current Time: ${status.currentTime}`);
          console.log(`   Next Run: ${status.nextRun}`);
          break;
        case "d":
          await this.showInitialStats();
          break;
        case "q":
          console.log("👋 Shutting down application...");
          process.exit(0);
          break;
        default:
          console.log("❓ Unknown command. Available commands: r, s, d, q");
      }
    });
  }
  /**
   * Sets up handlers for graceful shutdown on termination signals (e.g., Ctrl+C).
   */

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`); // Ensure any running background jobs are requested to stop.
      this.mispBulkScanner.pauseScan();
      try {
        await mongoose.connection.close();
        console.log("✅ Database connection closed");
        console.log("👋 Application shut down successfully");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error.message);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("uncaughtException", (error) => {
      console.error("💥 Uncaught Exception:", error.message);
      console.error(error.stack);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
      process.exit(1);
    });
  }
}

// --- Application Entry Point ---
const app = new IpMonitoringApp();
app.initialize();
