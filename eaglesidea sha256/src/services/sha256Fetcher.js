const axios = require('axios');
require('dotenv').config();

class Sha256Fetcher {
  constructor() {
    this.url = process.env.SHA256_FETCH_URL;
  }

  async fetchSha256Hashes() {
    try {
      console.log(`\n🔍 Fetching SHA256 hashes from: ${this.url}`);
      console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);

      // Fetching SHA256 hashes with increased timeout
      const response = await axios.get(this.url, {
        timeout: 60000, // 60 seconds timeout
        headers: {
          'User-Agent': 'SHA256-Monitor-Bot/1.0'
        }
      });

      // Log response size and inspect first few items
      console.log(`Response data length: ${response.data.length}`);
      console.log('First 5 entries in data:', response.data.split('\n').slice(0, 5));

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Process fetched SHA256 hashes
      const sha256Hashes = response.data
        .split('\n')
        .map(hash => hash.trim())
        .filter(hash => hash && this.isValidSha256(hash));

      console.log(`✅ Successfully fetched ${sha256Hashes.length} SHA256 hashes`);
      return sha256Hashes;

    } catch (error) {
      console.error('❌ Error fetching SHA256 hashes:', error.message);
      throw error;
    }
  }

  isValidSha256(hash) {
    // Basic validation of SHA256 hashes (regex for SHA256)
    const sha256Regex = /^[a-f0-9]{64}$/;
    return sha256Regex.test(hash);
  }
}

module.exports = Sha256Fetcher;
