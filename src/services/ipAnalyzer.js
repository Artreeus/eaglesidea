const IpAddress = require("../models/IpAddress");

class IpAnalyzer {
  constructor() {
    this.stats = {
      totalFetched: 0,
      totalInDb: 0,
      sameIps: 0,
      newIps: 0,
      duplicateHits: 0,
    };
  }

  async analyzeAndStore(fetchedIps) {
    console.log("\n📊 Starting IP analysis...");

    try {
      // Track the total number of fetched IPs
      this.stats.totalFetched = fetchedIps.length;

      // Remove duplicates from fetched IPs
      const uniqueFetchedIps = [...new Set(fetchedIps)];
      const duplicatesInFetch = fetchedIps.length - uniqueFetchedIps.length;
      console.log(`🔍 Removed ${duplicatesInFetch} duplicate IPs from fetched data`);

      // Get all existing IPs from database
      const existingIpsData = await IpAddress.find({}, "ip");
      const existingIpsSet = new Set(existingIpsData.map(doc => doc.ip));
      this.stats.totalInDb = existingIpsData.length;

      // Categorize unique IPs
      const newIps = uniqueFetchedIps.filter(ip => !existingIpsSet.has(ip));
      const sameIps = uniqueFetchedIps.filter(ip => existingIpsSet.has(ip));

      this.stats.sameIps = sameIps.length;
      this.stats.newIps = newIps.length;
      this.stats.duplicateHits = duplicatesInFetch;

      // Only insert new IPs (upsert them into the database)
      let upsertedCount = 0;
      if (newIps.length > 0) {
        upsertedCount = await this.insertNewIps(newIps);
      }

      // Calculate duplicates by difference
      const duplicateIps = this.stats.totalFetched - upsertedCount - duplicatesInFetch;
      console.log(`🚫 Duplicates in fetched data: ${duplicateIps}`);

      // Display statistics
      this.displayStats();
      return this.stats;
    } catch (error) {
      console.error("❌ Error during IP analysis:", error.message);
      throw error;
    }
  }

  async insertNewIps(newIps) {
    try {
      // Remove duplicates within newIps
      const uniqueNewIps = [...new Set(newIps)];
      if (uniqueNewIps.length !== newIps.length) {
        console.log(`🔍 Removed ${newIps.length - uniqueNewIps.length} duplicates within new IPs`);
      }

      // Bulk insert of new unique IPs
      const bulkOps = uniqueNewIps.map(ip => ({
        updateOne: {
          filter: { ip }, // Check if this IP already exists
          update: {
            $set: {
              ip,
              firstSeen: new Date(),
              lastSeen: new Date(),
              isActive: true,
            },
          },
          upsert: true, // Create the document if it doesn't exist
        },
      }));

      // Execute bulk operation
      const result = await IpAddress.bulkWrite(bulkOps);
      console.log(`✅ Successfully upserted ${result.upsertedCount} new unique IP addresses`);
      
      return result.upsertedCount; // Return the count of upserted IPs
    } catch (error) {
      console.error("❌ Error upserting new IPs:", error.message);
      throw error;
    }
  }

  displayStats() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 IP ANALYSIS STATISTICS");
    console.log("=".repeat(60));
    console.log(`📥 Total IPs Fetched: ${this.stats.totalFetched}`);
    console.log(`🗄️  Total IPs in Database (before): ${this.stats.totalInDb}`);
    console.log(`🔄 Total Same IPs (already exist in DB): ${this.stats.sameIps}`);
    console.log(`🆕 New Unique IPs: ${this.stats.newIps}`);
    console.log(`📊 Duplicate IPs in Fetched Data: ${this.stats.duplicateHits}`);
    console.log("=".repeat(60));

    const uniqueFetchedCount = this.stats.sameIps + this.stats.newIps;

    // Additional insights
    const duplicateInFetchPercentage = this.stats.totalFetched > 0
      ? ((this.stats.duplicateHits / this.stats.totalFetched) * 100).toFixed(2)
      : 0;
    const existingInDbPercentage = uniqueFetchedCount > 0
      ? ((this.stats.sameIps / uniqueFetchedCount) * 100).toFixed(2)
      : 0;
    const newPercentage = uniqueFetchedCount > 0
      ? ((this.stats.newIps / uniqueFetchedCount) * 100).toFixed(2)
      : 0;

    console.log(`🔁 Duplicate Rate in Fetched Data: ${duplicateInFetchPercentage}%`);
    console.log(`📋 Already in Database Rate: ${existingInDbPercentage}%`);
    console.log(`🆕 New IP Rate: ${newPercentage}%`);
    console.log(`✅ Total Unique IPs Processed: ${uniqueFetchedCount}`);
    console.log("=".repeat(60));

    if (this.stats.newIps > 0) {
      console.log(`✨ Added ${this.stats.newIps} new IP addresses to database`);
    } else {
      console.log(`ℹ️  No new IP addresses found - all IPs already exist in database`);
    }

    if (this.stats.duplicateHits > 0) {
      console.log(`🚫 Skipped ${this.stats.duplicateHits} duplicate IPs from fetched data`);
    }

    if (this.stats.sameIps > 0) {
      console.log(`🔄 Found ${this.stats.sameIps} IPs that already exist in database`);
    }
    console.log("=".repeat(60));
  }

  async getLatestIps(limit = 10) {
    try {
      const latestIps = await IpAddress.find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .select("ip firstSeen lastSeen");

      console.log(`\n🕐 Latest ${limit} IP Addresses:`);
      console.log("-".repeat(70));
      latestIps.forEach((doc, index) => {
        const daysSinceFirst = Math.floor((new Date() - doc.firstSeen) / (1000 * 60 * 60 * 24));
        console.log(`${index + 1}. ${doc.ip} - First: ${doc.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`);
      });

      return latestIps;
    } catch (error) {
      console.error("❌ Error fetching latest IPs:", error.message);
    }
  }
}

module.exports = IpAnalyzer;
