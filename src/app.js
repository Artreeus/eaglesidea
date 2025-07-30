const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const readline = require("readline");
const { spawn } = require("child_process");

// --- Main Application Dependencies ---
const connectDB = require("./config/database");
const IpAddress = require("./models/IpAddress");
const MispScanResult = require("./models/MispScanResult"); // Generic model for all indicators

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
    this.expressApp.use(express.json({ limit: "10mb" }));
    this.expressApp.use(express.urlencoded({ extended: true }));
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
      console.log("📋 Available commands: r, s, d, scan, q");
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
    this.expressApp.get("/", (req, res) => {
      // Redirect root to the main scanner page
      res.redirect("/misp-results");
    });

    this.expressApp.get("/misp-results", (req, res) => {
      res.render("misp-results");
    });

    // --- API ROUTES ---

    // This is the single, unified endpoint for manual scans.
    this.expressApp.post("/api/misp-scan/manual", (req, res) => {
      const { indicators } = req.body;
      if (
        !indicators ||
        !Array.isArray(indicators) ||
        indicators.length === 0
      ) {
        return res
          .status(400)
          .json({ message: "Please provide a non-empty array of indicators." });
      }

      console.log(
        `🔬 Spawning Python script for ${indicators.length} indicators.`
      );

      // Construct a reliable path to the script in the project's root
      const scriptPath = path.join(
        __dirname,
        "..",
        "misp_universal_scanner.py"
      );
      const pythonProcess = spawn("python", [scriptPath, ...indicators]);

      let scriptOutput = "";
      let errorOutput = "";

      // Capture all standard output from the script
      pythonProcess.stdout.on("data", (data) => {
        scriptOutput += data.toString();
      });

      // Capture all error output
      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      // Handle the script finishing its execution
      pythonProcess.on("close", async (code) => {
        // If the script exited with an error code, report it.
        if (code !== 0) {
          console.error(
            `Python script exited with code ${code}:\n${errorOutput}`
          );
          return res
            .status(500)
            .json({
              message: "The analysis script encountered an error.",
              error: errorOutput,
            });
        }

        try {
          // The entire output of the script is the JSON result array.
          const results = JSON.parse(scriptOutput);

          // Asynchronously save the results to the database for historical record.
          // We don't wait for this to finish before responding to the user for faster UI feedback.
          if (results.length > 0) {
            const operations = results.map((r) => ({
              updateOne: {
                filter: { indicator: r.indicator },
                update: { $set: { ...r, scannedAt: new Date() } },
                upsert: true,
              },
            }));
            MispScanResult.bulkWrite(operations)
              .then((opResult) =>
                console.log(
                  `💾 Successfully saved/updated ${
                    opResult.upsertedCount + opResult.modifiedCount
                  } scan results.`
                )
              )
              .catch((dbError) =>
                console.error("❌ Database save error:", dbError)
              );
          }

          // Immediately send the results back to the UI.
          res.json(results);
        } catch (e) {
          console.error("Error processing Python output:", e.message);
          res
            .status(500)
            .json({
              message: "Failed to parse the results from the analysis script.",
              error: scriptOutput,
            });
        }
      });
    });

    const PORT = process.env.PORT || 3001; // Ensure this is the correct port
    this.expressApp.listen(PORT, () => {
      console.log(`\n🌐 Web server running at http://localhost:${PORT}`);
      console.log(`   - MISP Scanner: http://localhost:${PORT}/misp-results`);
    });
  }

  // ... (The rest of your class methods: startMispScan, showInitialStats, setupCLI, setupGracefulShutdown)
  // These can remain largely the same, but ensure startMispScan also uses the universal scanner if needed.
  async startMispScan() {
    const scannedDocs = await MispScanResult.find({ type: "ip" })
      .select("indicator -_id")
      .lean();
    const scannedIps = new Set(scannedDocs.map((doc) => doc.indicator));
    const allDocs = await IpAddress.find({}).select("ip -_id").lean();
    const allIps = allDocs.map((doc) => doc.ip);
    const ipsToScan = allIps.filter((ip) => !scannedIps.has(ip));

    if (ipsToScan.length === 0) {
      const message =
        "✅ No new IPs to scan from the main list. Everything is up-to-date.";
      console.log(message);
      return message;
    }

    const batchSize = 200;
    const totalBatches = Math.ceil(ipsToScan.length / batchSize);
    const message = `🔎 Found ${ipsToScan.length} new IPs to scan. Starting Python script in ${totalBatches} batches...`;
    console.log(message);

    const scriptPath = path.join(__dirname, "..", "misp_universal_scanner.py");

    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * batchSize;
      const batchEnd = batchStart + batchSize;
      const batch = ipsToScan.slice(batchStart, batchEnd);
      console.log(
        `📦 Processing batch ${i + 1}/${totalBatches} with ${
          batch.length
        } IPs...`
      );
      // Use the universal scanner for batched jobs too
      const pythonProcess = spawn("python", [scriptPath, ...batch]);
      pythonProcess.stdout.on("data", (data) =>
        console.log(`[Python Batch ${i + 1} STDOUT]: ${data.toString().trim()}`)
      );
      pythonProcess.stderr.on("data", (data) =>
        console.error(
          `[Python Batch ${i + 1} STDERR]: ${data.toString().trim()}`
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
      console.log(
        `🛡️  Indicators scanned in MISP: ${scannedCount.toLocaleString()}`
      );
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
          console.log(`  Running: ${status.isRunning ? "🟢 Yes" : "🔴 No"}`);
          console.log(`  Current Time: ${status.currentTime}`);
          console.log(`  Next Run: ${status.nextRun}`);
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
      process.exit(1);
    });
    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
      process.exit(1);
    });
  }
}

const app = new IpMonitoringApp();
app.initialize();
