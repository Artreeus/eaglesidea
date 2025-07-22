const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const readline = require("readline");
const { spawn } = require("child_process"); // Needed to run external scripts

// --- Main Application Dependencies ---
const connectDB = require("./config/database");
const IpAddress = require("./models/IpAddress");
const MispScanResult = require("./models/MispScanResult"); // For storing scan results

// --- Service Classes ---
const IpFetcher = require("./services/ipFetcher");
const IpAnalyzer = require("./services/ipAnalyzer");
const Scheduler = require("./utils/scheduler");

/**
 * The main class for the IP Monitoring Application.
 */
class IpMonitoringApp {
  constructor() {
    this.expressApp = express();
    this.expressApp.use(express.json({ limit: "10mb" })); // Increase payload limit for manual scans
    this.expressApp.use(express.urlencoded({ extended: true })); // To parse form data
    this.ipFetcher = new IpFetcher();
    this.ipAnalyzer = new IpAnalyzer();
    this.scheduler = new Scheduler(this.ipFetcher, this.ipAnalyzer);
  }

  async initialize() {
    try {
      console.log("🚀 Initializing IP Monitoring Application...");
      await connectDB();
      this.setupExpress();
      await this.showInitialStats();
      this.scheduler.start();
      this.setupCLI();
      this.setupGracefulShutdown();
      console.log("✅ Application initialized successfully!");
      console.log("📋 Available commands:");
      console.log('  - "r" + Enter to run daily IP fetch job manually');
      console.log('  - "s" + Enter to show scheduler status');
      console.log('  - "d" + Enter to show database stats');
      console.log('  - "scan" + Enter to start MISP scan for new IPs');
      console.log('  - "q" + Enter to quit');
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
    this.expressApp.set("views", path.join(__dirname, "views"));

    // --- PAGE ROUTES ---
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
    });

    // This route now just renders the shell page. Data is fetched via API.
    this.expressApp.get("/misp-results", (req, res) => {
      res.render("misp-results");
    });

    // --- API ROUTES ---
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
    });

    // UPDATED: API endpoint for paginated MISP results with search
    this.expressApp.get("/api/misp-results", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const searchTerm = req.query.searchTerm || "";
        const skip = (page - 1) * limit;

        const query = {};
        if (searchTerm) {
          // Use regex for a case-insensitive, partial match on the IP address
          query.ip = { $regex: searchTerm, $options: "i" };
        }

        const results = await MispScanResult.find(query)
          .sort({ scannedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

        const totalResults = await MispScanResult.countDocuments(query);

        res.json({
          results,
          totalPages: Math.ceil(totalResults / limit),
          currentPage: page,
        });
      } catch (error) {
        console.error("Error fetching paginated MISP results:", error);
        res.status(500).json({ message: "Error fetching results." });
      }
    });

    this.expressApp.post("/api/misp-scan/manual", (req, res) => {
      const { ips } = req.body;
      if (!ips || !Array.isArray(ips) || ips.length === 0) {
        return res
          .status(400)
          .json({ message: "Please provide a non-empty array of IPs." });
      }

      console.log(`🔬 Received manual scan request for ${ips.length} IPs.`);

      const pythonProcess = spawn("python", ["misp_scanner.py", ...ips]);
      let errorData = "";

      pythonProcess.stderr.on("data", (data) => {
        errorData += data.toString();
        console.error(`[Manual Scan Python ERROR]: ${data.toString().trim()}`);
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          return res
            .status(500)
            .json({ message: "Python script failed.", error: errorData });
        }
        // Give the DB a moment to process the upload from the script
        setTimeout(async () => {
          try {
            const results = await MispScanResult.find({
              ip: { $in: ips },
            }).lean();
            res.json(results);
          } catch (dbError) {
            res
              .status(500)
              .json({
                message: "Scan completed, but failed to fetch results from DB.",
                error: dbError.message,
              });
          }
        }, 3000);
      });
    });

    this.expressApp.post("/api/misp-scan/start", async (req, res) => {
      console.log("Received request to start MISP scan...");
      this.startMispScan()
        .then((message) => res.status(202).json({ message }))
        .catch((error) => {
          console.error("❌ Error during MISP scan initiation:", error);
          res.status(500).json({ message: "Failed to start MISP scan." });
        });
    });

    this.expressApp.post("/api/misp-results/upload", async (req, res) => {
      try {
        const results = req.body.results;
        if (!results || !Array.isArray(results)) {
          return res
            .status(400)
            .json({
              message: 'Invalid data format. "results" array is required.',
            });
        }
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
        console.log(
          `💾 Successfully saved ${operations.length} MISP scan results to the database.`
        );
        res
          .status(200)
          .json({
            message: `Successfully saved ${operations.length} results.`,
          });
      } catch (err) {
        console.error("❌ Error saving MISP results:", err.message);
        res
          .status(500)
          .json({ message: "Error saving results to the database." });
      }
    });

    const PORT = process.env.PORT || 3000;
    this.expressApp.listen(PORT, () => {
      console.log(`\n🌐 Web server running at http://localhost:${PORT}`);
      console.log(`   - Main IP List: http://localhost:${PORT}/`);
      console.log(`   - MISP Results: http://localhost:${PORT}/misp-results`);
    });
  }

  async startMispScan() {
    const scannedDocs = await MispScanResult.find({}).select("ip -_id").lean();
    const scannedIps = new Set(scannedDocs.map((doc) => doc.ip));
    const allDocs = await IpAddress.find({}).select("ip -_id").lean();
    const allIps = allDocs.map((doc) => doc.ip);
    const ipsToScan = allIps.filter((ip) => !scannedIps.has(ip));

    if (ipsToScan.length === 0) {
      const message = "✅ No new IPs to scan. Everything is up-to-date.";
      console.log(message);
      return message;
    }

    const batchSize = 200;
    const totalBatches = Math.ceil(ipsToScan.length / batchSize);
    const message = `🔎 Found ${ipsToScan.length} new IPs to scan. Starting Python script in ${totalBatches} batches...`;
    console.log(message);

    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * batchSize;
      const batchEnd = batchStart + batchSize;
      const batch = ipsToScan.slice(batchStart, batchEnd);
      console.log(
        `📦 Processing batch ${i + 1}/${totalBatches} with ${
          batch.length
        } IPs...`
      );
      const pythonProcess = spawn("python", ["misp_scanner.py", ...batch]);
      pythonProcess.stdout.on("data", (data) =>
        console.log(`[Python Batch ${i + 1}]: ${data.toString().trim()}`)
      );
      pythonProcess.stderr.on("data", (data) =>
        console.error(
          `[Python Batch ${i + 1} ERROR]: ${data.toString().trim()}`
        )
      );
      pythonProcess.on("close", (code) =>
        console.log(
          `Python script for batch ${i + 1} finished with code ${code}.`
        )
      );
      if (i < totalBatches - 1) {
        console.log(`...waiting 5 seconds before next batch...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    return `Scan initiated for ${ipsToScan.length} new IPs in ${totalBatches} batches.`;
  }

  async showInitialStats() {
    try {
      const totalCount = await IpAddress.countDocuments();
      const activeCount = await IpAddress.countDocuments({ isActive: true });
      const scannedCount = await MispScanResult.countDocuments();
      console.log("\n" + "📊".repeat(15));
      console.log("📊 CURRENT DATABASE STATISTICS");
      console.log("📊".repeat(15));
      console.log(
        `🗄️  Total unique IP addresses: ${totalCount.toLocaleString()}`
      );
      console.log(`✅ Active IP addresses: ${activeCount.toLocaleString()}`);
      console.log(`🛡️  IPs scanned in MISP: ${scannedCount.toLocaleString()}`);
      console.log("📊".repeat(15) + "\n");
    } catch (error) {
      console.error("❌ Error fetching initial stats:", error.message);
    }
  }

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
          console.log("\n🗓️  Scheduler Status:");
          console.log(`   Running: ${status.isRunning ? "🟢 Yes" : "🔴 No"}`);
          console.log(`   Current Time: ${status.currentTime}`);
          console.log(`   Next Run: ${status.nextRun}`);
          break;
        case "d":
          await this.showInitialStats();
          break;
        case "scan":
          console.log("\n🛡️  Initiating MISP scan from CLI...");
          this.startMispScan().catch((err) =>
            console.error("❌ Error during CLI scan initiation:", err)
          );
          break;
        case "q":
          console.log("👋 Shutting down application...");
          process.exit(0);
          break;
        default:
          console.log(
            "❓ Unknown command. Available commands: r, s, d, scan, q"
          );
      }
    });
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
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
      console.error("💥 Uncaught Exception:", error.message, error.stack);
      if (error.code !== "ENAMETOOLONG") process.exit(1);
    });
    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
      if (reason.code !== "ENAMETOOLONG") process.exit(1);
    });
  }
}

const app = new IpMonitoringApp();
app.initialize();
