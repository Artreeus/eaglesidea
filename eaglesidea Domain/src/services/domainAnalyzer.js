const Domain = require("../models/Domain");

class DomainAnalyzer {
  constructor() {
    this.stats = {
      totalFetched: 0,
      totalInDb: 0,
      sameDomains: 0, // Domains that already exist in the database
      newDomains: 0, // New unique domains to be added
      duplicateHits: 0, // Duplicate domains found in fetched data
    };
  }

  async analyzeAndStore(fetchedDomains) {
    console.log("\n📊 Starting domain analysis...");

    try {
      this.stats.totalFetched = fetchedDomains.length;

      // Remove duplicates from fetched domains first
      const uniqueFetchedDomains = [...new Set(fetchedDomains)];
      const duplicatesInFetch = fetchedDomains.length - uniqueFetchedDomains.length;

      this.stats.duplicateHits = duplicatesInFetch; // Duplicates found in fetched data

      console.log(
        `🔍 Removed ${duplicatesInFetch} duplicate domains from fetched data`
      );

      // Get all existing domains from the database
      const existingDomainsData = await Domain.find({}, "domain");
      const existingDomainsSet = new Set();

      existingDomainsData.forEach((doc) => {
        existingDomainsSet.add(doc.domain);
      });

      this.stats.totalInDb = existingDomainsData.length;

      const newDomains = [];
      const sameDomains = [];

      // Categorize unique domains
      for (const domain of uniqueFetchedDomains) {
        if (existingDomainsSet.has(domain)) {
          sameDomains.push(domain);
        } else {
          newDomains.push(domain);
        }
      }

      this.stats.sameDomains = sameDomains.length;
      this.stats.newDomains = newDomains.length;

      // Only insert new domains (no updates for existing ones)
      let upsertedCount = 0;
      if (newDomains.length > 0) {
        upsertedCount = await this.insertNewDomains(newDomains);
      }

      // Calculate duplicates by difference
      const duplicateDomains = this.stats.totalFetched - upsertedCount - duplicatesInFetch;
      console.log(`🚫 Duplicates in fetched data: ${duplicateDomains}`);

      // Display statistics
      this.displayStats();
      return this.stats;
    } catch (error) {
      console.error("❌ Error during domain analysis:", error.message);
      throw error;
    }
  }

  async insertNewDomains(newDomains) {
    try {
      // Remove any potential duplicates within the newDomains array itself
      const uniqueNewDomains = [...new Set(newDomains)];

      if (uniqueNewDomains.length !== newDomains.length) {
        console.log(
          `🔍 Removed ${
            newDomains.length - uniqueNewDomains.length
          } duplicates within new domains`
        );
      }

      const bulkOps = uniqueNewDomains.map((domain) => ({
        updateOne: {
          filter: { domain: domain }, // Check if this domain already exists
          update: {
            $set: {
              domain: domain,
              firstSeen: new Date(),
              lastSeen: new Date(),
              isActive: true,
            },
          },
          upsert: true, // Create the document if it doesn't exist
        },
      }));

      const result = await Domain.bulkWrite(bulkOps);
      console.log(
        `✅ Successfully upserted ${result.upsertedCount} new unique domains`
      );

      return result.upsertedCount; // Return the number of upserted domains
    } catch (error) {
      console.error("❌ Error upserting new domains:", error.message);
      throw error;
    }
  }

  displayStats() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 DOMAIN ANALYSIS STATISTICS");
    console.log("=".repeat(60));
    console.log(`📥 Total Domains Fetched: ${this.stats.totalFetched}`);
    console.log(`🗄️  Total Domains in Database (before): ${this.stats.totalInDb}`);
    console.log(
      `🔄 Total Same Domains (already exist in DB): ${this.stats.sameDomains}`
    );
    console.log(`🆕 New Unique Domains: ${this.stats.newDomains}`);
    console.log(
      `📊 Duplicate Domains in Fetched Data: ${this.stats.duplicateHits}`
    );
    console.log("=".repeat(60));

    // Additional insights
    const uniqueFetchedCount = this.stats.sameDomains + this.stats.newDomains;
    const duplicateInFetchPercentage = this.stats.totalFetched > 0
      ? ((this.stats.duplicateHits / this.stats.totalFetched) * 100).toFixed(2)
      : 0;
    const existingInDbPercentage = uniqueFetchedCount > 0
      ? ((this.stats.sameDomains / uniqueFetchedCount) * 100).toFixed(2)
      : 0;
    const newPercentage = uniqueFetchedCount > 0
      ? ((this.stats.newDomains / uniqueFetchedCount) * 100).toFixed(2)
      : 0;

    console.log(`🔁 Duplicate Rate in Fetched Data: ${duplicateInFetchPercentage}%`);
    console.log(`📋 Already in Database Rate: ${existingInDbPercentage}%`);
    console.log(`🆕 New Domain Rate: ${newPercentage}%`);
    console.log(`✅ Total Unique Domains Processed: ${uniqueFetchedCount}`);
    console.log("=".repeat(60));

    if (this.stats.newDomains > 0) {
      console.log(`✨ Added ${this.stats.newDomains} new domains to database`);
    } else {
      console.log(`ℹ️  No new domains found - all domains already exist in database`);
    }

    if (this.stats.duplicateHits > 0) {
      console.log(`🚫 Skipped ${this.stats.duplicateHits} duplicate domains from fetched data`);
    }

    if (this.stats.sameDomains > 0) {
      console.log(`🔄 Found ${this.stats.sameDomains} domains that already exist in database`);
    }
    console.log("=".repeat(60));
  }

  async getLatestDomains(limit = 10) {
    try {
      const latestDomains = await Domain.find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .select("domain firstSeen lastSeen");

      console.log(`\n🕐 Latest ${limit} Domain Activities:`);
      console.log("-".repeat(70));
      latestDomains.forEach((doc, index) => {
        const daysSinceFirst = Math.floor(
          (new Date() - doc.firstSeen) / (1000 * 60 * 60 * 24)
        );
        console.log(
          `${index + 1}. ${doc.domain} - First: ${doc.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`
        );
      });

      return latestDomains;
    } catch (error) {
      console.error("❌ Error fetching latest domains:", error.message);
    }
  }
}

module.exports = DomainAnalyzer;
