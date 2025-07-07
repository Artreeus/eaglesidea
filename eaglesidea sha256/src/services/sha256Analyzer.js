const Sha256Hash = require("../models/Sha256Hash");

class Sha256Analyzer {
  constructor() {
    this.stats = {
      totalFetched: 0,
      totalInDb: 0,
      sameHashes: 0,
      newHashes: 0,
      duplicateHits: 0,
    };
  }

  async analyzeAndStore(fetchedHashes) {
    console.log("\n📊 Starting SHA256 hash analysis...");

    try {
      this.stats.totalFetched = fetchedHashes.length;

      // Remove duplicates and count them
      const uniqueFetchedHashes = [...new Set(fetchedHashes)];
      const duplicatesInFetch = fetchedHashes.length - uniqueFetchedHashes.length;
      console.log(`🔍 Removed ${duplicatesInFetch} duplicate hashes from fetched data`);

      // Fetch existing hashes more efficiently in smaller chunks
      const existingHashesData = await this.fetchExistingHashes();
      const existingHashesSet = new Set(existingHashesData.map(doc => doc.hash));

      this.stats.totalInDb = existingHashesData.length;

      // Categorize hashes into 'same' and 'new'
      const newHashes = [];
      const sameHashes = [];
      uniqueFetchedHashes.forEach(hash => {
        if (existingHashesSet.has(hash)) {
          sameHashes.push(hash);
        } else {
          newHashes.push(hash);
        }
      });

      // Update stats
      this.stats.sameHashes = sameHashes.length;
      this.stats.newHashes = newHashes.length;
      this.stats.duplicateHits = duplicatesInFetch;

      // Only insert new hashes
      let upsertedCount = 0;
      if (newHashes.length > 0) {
        upsertedCount = await this.insertNewHashes(newHashes);
      }

      // Calculate duplicates by difference
      const duplicateHashes = this.stats.totalFetched - upsertedCount - duplicatesInFetch;
      console.log(`🚫 Duplicates in fetched data: ${duplicateHashes}`);

      // Display statistics
      this.displayStats();
      return this.stats;
    } catch (error) {
      console.error("❌ Error during SHA256 hash analysis:", error.message);
      throw error;
    }
  }

  async fetchExistingHashes() {
    // Optimized query to get only the hashes, reduces data transfer
    return Sha256Hash.find({}, "hash").lean();
  }

  async insertNewHashes(newHashes) {
    try {
      const chunkSize = 150000;
      const chunks = this.chunkArray(newHashes, chunkSize);

      let totalUpsertedCount = 0; // Track total upserted count

      for (const chunk of chunks) {
        const bulkOps = chunk.map((hash) => ({
          updateOne: {
            filter: { hash },
            update: {
              $set: {
                hash,
                firstSeen: new Date(),
                lastSeen: new Date(),
                isActive: true,
              },
            },
            upsert: true,
          },
        }));

        const result = await Sha256Hash.bulkWrite(bulkOps);
        console.log(`✅ Successfully upserted ${result.upsertedCount} new unique SHA256 hashes in this batch`);

        totalUpsertedCount += result.upsertedCount; // Add up the count from this batch
      }

      return totalUpsertedCount; // Return the total upserted count across all chunks
    } catch (error) {
      console.error("❌ Error upserting new hashes:", error.message);
      throw error;
    }
  }

  chunkArray(array, chunkSize) {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }

  displayStats() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 SHA256 HASH ANALYSIS STATISTICS");
    console.log("=".repeat(60));
    console.log(`📥 Total SHA256 Hashes Fetched: ${this.stats.totalFetched}`);
    console.log(`🗄️  Total SHA256 Hashes in Database (before): ${this.stats.totalInDb}`);
    console.log(`🔄 Total Same Hashes (already exist in DB): ${this.stats.sameHashes}`);
    console.log(`🆕 New Unique Hashes: ${this.stats.newHashes}`);
    console.log(`📊 Duplicate Hashes in Fetched Data: ${this.stats.duplicateHits}`);
    console.log("=".repeat(60));

    // Additional insights
    const uniqueFetchedCount = this.stats.sameHashes + this.stats.newHashes;
    const duplicateInFetchPercentage = this.stats.totalFetched > 0
      ? ((this.stats.duplicateHits / this.stats.totalFetched) * 100).toFixed(2)
      : 0;
    const existingInDbPercentage = uniqueFetchedCount > 0
      ? ((this.stats.sameHashes / uniqueFetchedCount) * 100).toFixed(2)
      : 0;
    const newPercentage = uniqueFetchedCount > 0
      ? ((this.stats.newHashes / uniqueFetchedCount) * 100).toFixed(2)
      : 0;

    console.log(`🔁 Duplicate Rate in Fetched Data: ${duplicateInFetchPercentage}%`);
    console.log(`📋 Already in Database Rate: ${existingInDbPercentage}%`);
    console.log(`🆕 New Hash Rate: ${newPercentage}%`);
    console.log(`✅ Total Unique Hashes Processed: ${uniqueFetchedCount}`);
    console.log("=".repeat(60));

    if (this.stats.newHashes > 0) {
      console.log(`✨ Added ${this.stats.newHashes} new SHA256 hashes to database`);
    } else {
      console.log(`ℹ️  No new SHA256 hashes found - all hashes already exist in database`);
    }

    if (this.stats.duplicateHits > 0) {
      console.log(`🚫 Skipped ${this.stats.duplicateHits} duplicate SHA256 hashes from fetched data`);
    }

    if (this.stats.sameHashes > 0) {
      console.log(`🔄 Found ${this.stats.sameHashes} SHA256 hashes that already exist in database`);
    }
    console.log("=".repeat(60));
  }

  async getLatestHashes(limit = 10) {
    try {
      const latestHashes = await Sha256Hash.find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .select("hash firstSeen lastSeen");

      console.log(`\n🕐 Latest ${limit} SHA256 Hash Activities:`);
      console.log("-".repeat(70));
      latestHashes.forEach((doc, index) => {
        const daysSinceFirst = Math.floor(
          (new Date() - doc.firstSeen) / (1000 * 60 * 60 * 24)
        );
        console.log(
          `${index + 1}. ${doc.hash} - First: ${doc.firstSeen.toLocaleDateString()} (${daysSinceFirst} days ago)`
        );
      });

      return latestHashes;
    } catch (error) {
      console.error("❌ Error fetching latest SHA256 hashes:", error.message);
    }
  }
}

module.exports = Sha256Analyzer;
