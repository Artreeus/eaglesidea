const axios = require('axios');
require('dotenv').config();

class DomainFetcher {
  constructor() {
    this.url = process.env.DOMAIN_FETCH_URL;
  }

  async fetchDomains() {
    try {
      console.log(`\n🔍 Fetching domains from: ${this.url}`);
      console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);

      const response = await axios.get(this.url, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'Domain-Monitor-Bot/1.0'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Split the response data by lines and filter out empty lines
      const domains = response.data
        .split('\n')
        .map(domain => domain.trim())
        .filter(domain => domain && this.isValidDomain(domain));

      console.log(`✅ Successfully fetched ${domains.length} domains`);
      return domains;

    } catch (error) {
      console.error('❌ Error fetching domains:', error.message);
      throw error;
    }
  }

  isValidDomain(domain) {
    // Basic domain validation (regex for domain)
    const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,6}$/;
    return domainRegex.test(domain);
  }
}

module.exports = DomainFetcher;


