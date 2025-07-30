const express = require("express");
const axios = require("axios");
const path = require("path");
const cron = require("node-cron");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- API Configuration ---
// The endpoint for the external service to scan domains.
const API_URL = "https://app.insecureweb.com/api/dark-web/live-scan";

// --- 1. Database Connection ---
// Establishes a connection to the MongoDB database using the URI from environment variables.
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Connected successfully.");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err.message);
    // Exit the process with failure if the database connection fails.
    process.exit(1);
  }
};
connectDB();

// --- 2. Mongoose Schema & Model ---
// Defines the structure for the 'Domain' documents in the MongoDB collection.
const domainSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      default: "Unscanned", // Default status for a new domain.
    },
    lastScanned: {
      type: Date,
      default: null, // The date of the last scan.
    },
    // This is the new field to store when the domain was first added to the system.
    ingestTime: {
      type: Date,
    },
    scanResult: {
      type: mongoose.Schema.Types.Mixed, // Stores the raw result from the API scan.
      default: null,
    },
  },
  // Automatically adds `createdAt` and `updatedAt` timestamps.
  { timestamps: true }
);

const Domain = mongoose.model("Domain", domainSchema);

// --- Middleware ---
app.set("view engine", "ejs"); // Sets EJS as the template engine.
app.use(express.urlencoded({ extended: true })); // Parses URL-encoded bodies.
app.use(express.json()); // Parses JSON bodies.
app.use(express.static("public")); // Serves static files from the 'public' directory.

// --- Core Scan Function ---
// Handles the logic for calling the external API to scan a single domain.
async function scanDomain(domain) {
  try {
    // Cleans the domain name to its base form (e.g., "https://www.example.com/page" -> "example.com").
    const cleanDomain = domain
      .replace(/^(https?:\/\/)?(www\.)?/, "")
      .split("/")[0];

    const params = { field: "domain", search: cleanDomain };
    const headers = {
      "api-key": process.env.ISW_API_KEY, // API key from environment variables.
      accept: "application/json",
    };

    console.log(`Scanning domain: ${cleanDomain}`);
    const response = await axios.get(API_URL, { headers, params });
    return { success: true, data: response.data, domain: cleanDomain };
  } catch (error) {
    console.error(`API Error for ${domain}:`, error.message);
    return { success: false, error: "Failed to fetch data from API.", domain };
  }
}

// --- 3. Routes ---

// Regular expression for validating a domain name format.
const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// GET / - Renders the main dashboard page.
app.get("/", async (req, res) => {
  try {
    // Fetches all domains from the database, sorted by creation date.
    const domains = await Domain.find({}).sort({ createdAt: -1 });
    res.render("index", { domains, error: null });
  } catch (err) {
    res.render("index", {
      domains: [],
      error: "Could not fetch monitored domains.",
    });
  }
});

// POST /scan-now - An endpoint for live, on-demand scans (e.g., from a search bar).
app.post("/scan-now", async (req, res) => {
  let domain = (req.body.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0];

  if (!domainRegex.test(domain)) {
    return res.status(400).json({ success: false, error: "Invalid domain format." });
  }

  const scanResult = await scanDomain(domain);
  return res.json(scanResult);
});

// POST /add-domain - Adds a new domain to be monitored.
app.post("/add-domain", async (req, res) => {
  let domainName = (req.body.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0];

  if (!domainRegex.test(domainName)) {
    const domains = await Domain.find({});
    return res.render("index", { domains, error: "Invalid domain format." });
  }

  try {
    const existingDomain = await Domain.findOne({ name: domainName });
    if (existingDomain) {
      const domains = await Domain.find({});
      return res.render("index", {
        domains,
        error: `Domain "${domainName}" is already monitored.`,
      });
    }

    // Perform the initial scan for the new domain.
    const scanResult = await scanDomain(domainName);

    // Create a new Domain document.
    const newDomain = new Domain({
      name: domainName,
      lastScanned: new Date(),
      ingestTime: new Date(), // ** KEY CHANGE: Set the ingest time on creation. **
      status: scanResult.success
        ? scanResult.data.length > 0
          ? "Compromised"
          : "Secure"
        : "Scan Failed",
      scanResult,
    });

    await newDomain.save();
    res.redirect("/");
  } catch (err) {
    console.error("Error adding domain:", err);
    const domains = await Domain.find({});
    res.render("index", { domains, error: "Error adding domain." });
  }
});

// POST /edit-domain - Updates the name of a monitored domain.
app.post("/edit-domain", async (req, res) => {
  const { oldDomainName, newDomainName } = req.body;
  const cleanNewName = (newDomainName || "")
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .split("/")[0];

  if (!domainRegex.test(cleanNewName)) return res.redirect("/");

  try {
    // Find the old domain and update its name, resetting its status.
    await Domain.findOneAndUpdate(
      { name: oldDomainName },
      {
        name: cleanNewName,
        status: "Unscanned",
        scanResult: null,
        lastScanned: null,
      }
    );
  } catch (err) {
    console.error("Error editing domain:", err);
  }
  res.redirect("/");
});

// POST /delete-domain - Removes a domain from monitoring.
app.post("/delete-domain", async (req, res) => {
  try {
    await Domain.findOneAndDelete({ name: req.body.domain });
  } catch (err) {
    console.error("Error deleting domain:", err);
  }
  res.redirect("/");
});

// GET /details/:domainName - Renders the detailed report page for a specific domain.
app.get("/details/:domainName", async (req, res) => {
  try {
    const domainData = await Domain.findOne({ name: req.params.domainName });
    if (!domainData) {
      return res.status(404).send("Domain not found");
    }
    // The `domainData` object passed here now includes `ingestTime`.
    res.render("details", { domainData });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- 4. Scheduled Task ---
// Runs a cron job at midnight every day to re-scan all monitored domains.
cron.schedule("0 0 * * *", async () => {
  console.log("--- Running daily scheduled scan for all domains ---");
  try {
    const domainsToScan = await Domain.find({});
    if (domainsToScan.length === 0) {
        console.log("--- No domains to scan. ---");
        return;
    }

    for (const domain of domainsToScan) {
      const scanResult = await scanDomain(domain.name);
      domain.lastScanned = new Date();
      domain.status = scanResult.success
        ? scanResult.data.length > 0
          ? "Compromised"
          : "Secure"
        : "Scan Failed";
      domain.scanResult = scanResult;
      await domain.save();
    }
    console.log(`--- Daily scan complete for ${domainsToScan.length} domains. ---`);
  } catch (err) {
    console.error("Error during scheduled scan:", err);
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
