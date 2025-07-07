const Md5Hash = require("../models/Md5Hash");

class Md5Analyzer {
  constructor() {
    this.stats = {
      totalFetched: 0,
      totalInDb: 0,
      sameHashes: 0, // Hashes that already exist in the database
      newHashes: 0, // New unique hashes to be added
      duplicateHits: 0, // Duplicate hashes found in fetched data
    };
  }

  async analyzeAndStore(fetchedHashes) {
    console.log("\n📊 Starting MD5 hash analysis...");

    try {
      this.stats.totalFetched = fetchedHashes.length;

      // Remove duplicates from fetched hashes first
      const uniqueFetchedHashes = [...new Set(fetchedHashes)];
      const duplicatesInFetch = fetchedHashes.length - uniqueFetchedHashes.length;

      this.stats.duplicateHits = duplicatesInFetch; // Duplicates found in fetched data

      console.log(
        `🔍 Removed ${duplicatesInFetch} duplicate hashes from fetched data`
      );

      // Get all existing hashes from the database in a single query
      const existingHashesData = await Md5Hash.find({}, "hash").lean();
      const existingHashesSet = new Set(existingHashesData.map(doc => doc.hash));

      this.stats.totalInDb = existingHashesData.length;

      const newHashes = [];
      const sameHashes = [];

      // Categorize unique hashes
      uniqueFetchedHashes.forEach(hash => {
        if (existingHashesSet.has(hash)) {
          sameHashes.push(hash);
        } else {
          newHashes.push(hash);
        }
      });

      this.stats.sameHashes = sameHashes.length;
      this.stats.newHashes = newHashes.length;

      // Only insert new hashes (no updates for existing ones)
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
      console.error("❌ Error during MD5 hash analysis:", error.message);
      throw error;
    }
  }

  async insertNewHashes(newHashes) {
    try {
      const chunkSize = 150000; // Adjust as needed based on database performance
      const chunks = [];

      // Break the newHashes into chunks
      for (let i = 0; i < newHashes.length; i += chunkSize) {
        chunks.push(newHashes.slice(i, i + chunkSize));
      }

      let totalUpsertedCount = 0; // Track total upserted count

      // Perform bulk insert for each chunk
      for (const chunk of chunks) {
        const bulkOps = chunk.map(hash => ({
          updateOne: {
            filter: { hash: hash }, // Check if this hash already exists
            update: {
              $set: {
                hash: hash,
                firstSeen: new Date(),
                lastSeen: new Date(),
                isActive: true,
              },
            },
            upsert: true, // Create the document if it doesn't exist
          },
        }));

        const result = await Md5Hash.bulkWrite(bulkOps);
        console.log(
          `✅ Successfully upserted ${result.upsertedCount} new unique MD5 hashes in this batch`
        );

        totalUpsertedCount += result.upsertedCount; // Add up the count from this batch
      }

      return totalUpsertedCount; // Return the total upserted count across all chunks
    } catch (error) {
      console.error("❌ Error upserting new hashes:", error.message);
      throw error;
    }
  }

  displayStats() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 MD5 HASH ANALYSIS STATISTICS");
    console.log("=".repeat(60));
    console.log(`📥 Total MD5 Hashes Fetched: ${this.stats.totalFetched}`);
    console.log(`🗄️  Total MD5 Hashes in Database (before): ${this.stats.totalInDb}`);
    console.log(
      `🔄 Total Same Hashes (already exist in DB): ${this.stats.sameHashes}`
    );
    console.log(`🆕 New Unique Hashes: ${this.stats.newHashes}`);
    console.log(
      `📊 Duplicate Hashes in Fetched Data: ${this.stats.duplicateHits}`
    );
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
      console.log(`✨ Added ${this.stats.newHashes} new MD5 hashes to database`);
    } else {
      console.log(`ℹ️  No new MD5 hashes found - all hashes already exist in database`);
    }

    if (this.stats.duplicateHits > 0) {
      console.log(`🚫 Skipped ${this.stats.duplicateHits} duplicate MD5 hashes from fetched data`);
    }

    if (this.stats.sameHashes > 0) {
      console.log(`🔄 Found ${this.stats.sameHashes} MD5 hashes that already exist in database`);
    }
    console.log("=".repeat(60));
  }

  async getLatestHashes(limit = 10) {
    try {
      const latestHashes = await Md5Hash.find({})
        .sort({ lastSeen: -1 })
        .limit(limit)
        .select("hash firstSeen lastSeen")
        .lean();

      console.log(`\n🕐 Latest ${limit} MD5 Hash Activities:`);
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
      console.error("❌ Error fetching latest MD5 hashes:", error.message);
    }
  }
}

module.exports = Md5Analyzer;
