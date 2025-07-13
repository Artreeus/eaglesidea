const axios = require('axios');
const https = require('https');
require('dotenv').config();

/**
 * A service class to interact with a MISP (Malware Information Sharing Platform) instance.
 * It is responsible for sending IP addresses to the MISP API to check for matches.
 */
class MispScanner {
  constructor() {
    this.mispUrl = process.env.MISP_URL;
    this.apiKey = process.env.MISP_API_KEY;
    this.headers = {
      'Authorization': this.apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    // This is necessary for environments with self-signed SSL certificates on the MISP instance.
    // In a production environment with a valid certificate, this can be removed.
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  /**
   * Scans a list of IP addresses against the MISP instance.
   * @param {string[]} ipList - An array of IP addresses to scan.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of result objects.
   */
  async scanIps(ipList) {
    if (!this.mispUrl || !this.apiKey) {
      console.error('❌ MISP_URL or MISP_API_KEY is not configured in .env file.');
      throw new Error('MISP configuration is missing.');
    }

    const results = [];

    // Process each IP address in the list.
    for (const ip of ipList) {
      const payload = {
        returnFormat: "json",
        type: ["ip-src", "ip-dst", "ip-src|ip-dst"],
        value: ip,
      };

      try {
        const response = await axios.post(
          `${this.mispUrl}/attributes/restSearch`,
          payload,
          {
            headers: this.headers,
            httpsAgent: this.httpsAgent,
          }
        );

        // Check if the response contains any matching attributes.
        if (response.status === 200 && response.data.response?.Attribute?.length > 0) {
          const attributes = response.data.response.Attribute;
          results.push({
            ip: ip,
            found: true,
            status: 'Malicious',
            details: attributes.map(attr => ({
              eventId: attr.event_id,
              type: attr.type,
              category: attr.category,
            })),
          });
        } else {
          results.push({ ip: ip, found: false, status: 'Clean' });
        }
      } catch (error) {
        console.error(`❌ Error querying MISP for IP ${ip}: ${error.message}`);
        results.push({ ip: ip, found: false, status: 'Error', error: error.message });
      }
    }
    return results;
  }
}

module.exports = MispScanner;
