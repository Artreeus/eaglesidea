const Hostname = require("../models/Hostname");

class HostnameAnalyzer {
  constructor() {
    this.stats = {
      totalFetched: 0,
      totalInDb: 0,
      sameHostnames: 0, // Hostnames that already exist in database
      newHostnames: 0, // New unique hostnames to be added
      duplicateHits: 0, // Duplicate hostnames found in fetched data
    };
  }

  async analyzeAndStore(fetchedHostnames) {
    console.log("\n📊 Starting hostname analysis...");

    try {
      this.stats.totalFetched = fetchedHostnames.length;

      // Remove duplicates from fetched hostnames first
      const uniqueFetchedHostnames = [...new Set(fetchedHostnames)];
      const duplicatesInFetch = fetchedHostnames.length - uniqueFetchedHostnames.length;

      this.stats.duplicateHits = duplicatesInFetch; // Duplicates found in fetched data

      console.log(
        `🔍 Removed ${duplicatesInFetch} duplicate hostnames from fetched data`
      );

      // Get all existing hostnames from the database
      const existingHostnamesData = await Hostname.find({}, "hostname");
      const existingHostnamesSet = new Set();

      existingHostnamesData.forEach((doc) => {
        existingHostnamesSet.add(doc.hostname);
      });

      this.stats.totalInDb = existingHostnamesData.length;

      const newHostnames = [];
      const sameHostnames = [];

      // Categorize unique hostnames
      for (const hostname of uniqueFetchedHostnames) {
        if (existingHostnamesSet.has(hostname)) {
          sameHostnames.push(hostname);
        } else {
          newHostnames.push(hostname);
        }
      }

      this.stats.sameHostnames = sameHostnames.length;
      this.stats.newHostnames = newHostnames.length;

      // Only insert new hostnames (no updates for existing ones)
      let upsertedCount = 0;
      if (newHostnames.length > 0) {
        upsertedCount = await this.insertNewHostnames(newHostnames);
      }

      // Calculate duplicates by difference
      const duplicateHostnames = this.stats.totalFetched - upsertedCount - duplicatesInFetch;
      console.log(`🚫 Duplicates in fetched data: ${duplicateHostnames}`);

      // Display statistics
      this.displayStats();
      return this.stats;
    } catch (error) {
      console.error("❌ Error during hostname analysis:", error.message);
      throw error;
    }
  }

  async insertNewHostnames(newHostnames) {
    try {
      // Remove any potential duplicates within the newHostnames array itself
      const uniqueNewHostnames = [...new Set(newHostnames)];

      if (uniqueNewHostnames.length !== newHostnames.length) {
        console.log(
          `🔍 Removed ${
            newHostnames.length - uniqueNewHostnames.length
          } duplicates within new hostnames`
        );
      }

      const bulkOps = uniqueNewHostnames.map((hostname) => ({
        updateOne: {
          filter: { hostname: hostname }, // Check if this hostname already exists
          update: {
            $set: {
              hostname: hostname,
              firstSeen: new Date(),
              lastSeen: new Date(),
              isActive: true,
            },
          },
          upsert: true, // Create the document if it doesn't exist
        },
      }));

      const result = await Hostname.bulkWrite(bulkOps);
      console.log(
        `✅ Successfully upserted ${result.upsertedCount} new unique hostnames`
      );

      return result.upsertedCount; // Return the number of upserted hostnames
    } catch (error) {
      console.error("❌ Error upserting new hostnames:", error.message);
      throw error;
    }
  }

  displayStats() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 HOSTNAME ANALYSIS STATISTICS");
    console.log("=".repeat(60));
    console.log(`📥 Total Hostnames Fetched: ${this.stats.totalFetched}`);
    console.log(`🗄️  Total Hostnames in Database (before): ${this.stats.totalInDb}`);
    console.log(
      `🔄 Total Same Hostnames (already exist in DB): ${this.stats.sameHostnames}`
    );
    console.log(`🆕 New Unique Hostnames: ${this.stats.newHostnames}`);
    console.log(
      `📊 Duplicate Hostnames in Fetched Data: ${this.stats.duplicateHits}`
    );
    console.log("=".repeat(60));

    // Additional insights
    const uniqueFetchedCount = this.stats.sameHostnames + this.stats.newHostnames;
    const duplicateInFetchPercentage = this.stats.totalFetched > 0
      ? ((this.stats.duplicateHits / this.stats.totalFetched) * 100).toFixed(2)
      : 0;
    const existingInDbPercentage = uniqueFetchedCount > 0
      ? ((this.stats.sameHostnames / uniqueFetchedCount) * 100).toFixed(2)
      : 0;
    const newPercentage = uniqueFetchedCount > 0
      ? ((this.stats.newHostnames / uniqueFetchedCount) * 100).toFixed(2)
      : 0;

    console.log(`🔁 Duplicate Rate in Fetched Data: ${duplicateInFetchPercentage}%`);
    console.log(`📋 Already in Database Rate: ${existingInDbPercentage}%`);
    console.log(`🆕 New Hostname Rate: ${newPercentage}%`);
    console.log(`✅ Total Unique Hostnames Processed: ${uniqueFetchedCount}`);
    console.log("=".repeat(60));

    if (this.stats.newHostnames > 0) {
      console.log(`✨ Added ${this.stats.newHostnames} new hostnames to database`);
    } else {
      console.log(`ℹ️  No new hostnames found - all hostnames already exist in database`);
    }

    if (this.stats.duplicateHits > 0) {
      console.log(`🚫 Skipped ${this.stats.duplicateHits} duplicate hostnames from fetched data`);
    }

    if (this.stats.sameHostnames > 0) {
      console.log(`🔄 Found ${this.stats.sameHostnames} hostnames that already exist in database`);
    }
    console.log("=".repeat(60));
  }

  async getLatestHostnames(limit = 10) {
    try {
      const latestHostnames = await Hostname.find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .select("hostname firstSeen lastSeen");

      console.log(`\n🕐 Latest ${limit} Hostname Activities:`);
      console.log("-".repeat(70));
      latestHostnames.forEach((doc, index) => {
        const daysSinceFirst = Math.floor(
          (new Date() - doc.firstSeen) / (1000 * 60 * 60 * 24)
        );
        console.log(
          `${index + 1}. ${doc.hostname} - First: ${doc.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`
        );
      });

      return latestHostnames;
    } catch (error) {
      console.error("❌ Error fetching latest hostnames:", error.message);
    }
  }
}

module.exports = HostnameAnalyzer;
