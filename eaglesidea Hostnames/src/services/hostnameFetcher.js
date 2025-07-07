const axios = require('axios');
require('dotenv').config();

class HostnameFetcher {
  constructor() {
    this.url = process.env.HOSTNAME_FETCH_URL;
  }

  async fetchHostnames() {
    try {
      console.log(`\n🔍 Fetching hostnames from: ${this.url}`);
      console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);

      const response = await axios.get(this.url, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'Hostname-Monitor-Bot/1.0'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Split the response data by lines and filter out empty lines
      const hostnames = response.data
        .split('\n')
        .map(hostname => hostname.trim())
        .filter(hostname => hostname && this.isValidHostname(hostname));

      console.log(`✅ Successfully fetched ${hostnames.length} hostnames`);
      return hostnames;

    } catch (error) {
      console.error('❌ Error fetching hostnames:', error.message);
      throw error;
    }
  }

  isValidHostname(hostname) {
    // Basic hostname validation (regex for hostname)
    const hostnameRegex = /^(?!-)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/;
    return hostnameRegex.test(hostname);
  }
}

module.exports = HostnameFetcher;
