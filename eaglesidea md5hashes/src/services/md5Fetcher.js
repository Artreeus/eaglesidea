const axios = require('axios');
require('dotenv').config();

class Md5Fetcher {
  constructor() {
    this.url = process.env.MD5_FETCH_URL;
  }

  async fetchMd5Hashes() {
    try {
      console.log(`\n🔍 Fetching MD5 hashes from: ${this.url}`);
      console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);

      // Fetching MD5 hashes with increased timeout
      const response = await axios.get(this.url, {
        timeout: 60000, // 60 seconds timeout
        headers: {
          'User-Agent': 'MD5-Monitor-Bot/1.0'
        }
      });

      // Log response size and inspect first few items
      console.log(`Response data length: ${response.data.length}`);
      console.log('First 5 entries in data:', response.data.split('\n').slice(0, 5));

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Process fetched MD5 hashes
      const md5Hashes = response.data
        .split('\n')
        .map(hash => hash.trim())
        .filter(hash => hash && this.isValidMd5(hash));

      console.log(`✅ Successfully fetched ${md5Hashes.length} MD5 hashes`);
      return md5Hashes;

    } catch (error) {
      console.error('❌ Error fetching MD5 hashes:', error.message);
      throw error;
    }
  }

  isValidMd5(hash) {
    // Basic validation of MD5 hashes (regex for MD5)
    const md5Regex = /^[a-f0-9]{32}$/;
    return md5Regex.test(hash);
  }
}

module.exports = Md5Fetcher;
