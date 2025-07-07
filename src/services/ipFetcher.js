const axios = require('axios');
require('dotenv').config();

class IpFetcher {
  constructor() {
    this.url = process.env.IP_FETCH_URL;
    this.chunkSize = 150000; // Number of IPs to process at once (adjust as needed)
  }

  async fetchIpAddresses() {
    let ipAddresses = [];

    try {
      console.log(`\n🔍 Fetching IP addresses from: ${this.url}`);
      console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);

      // Fetch all IPs in a single request
      const response = await axios.get(this.url, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'IP-Monitor-Bot/1.0'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Split the response data by lines (assuming each IP is in a new line)
      const allIps = response.data.split('\n').map(ip => ip.trim()).filter(ip => ip);

      console.log(`✅ Fetched ${allIps.length} IP addresses`);

      // Process the IPs in chunks
      let startIndex = 0;
      while (startIndex < allIps.length) {
        const chunk = allIps.slice(startIndex, startIndex + this.chunkSize);
        console.log(`⏳ Processing chunk ${Math.floor(startIndex / this.chunkSize) + 1}`);
        
        ipAddresses = ipAddresses.concat(this.validateAndProcessIPs(chunk));
        startIndex += this.chunkSize;

        // Add a slight delay between chunks to avoid overwhelming the system
        await this.delay(1000); // 1 second delay between chunks
      }

      console.log(`✅ Successfully processed ${ipAddresses.length} valid IP addresses`);
      return ipAddresses;

    } catch (error) {
      console.error('❌ Error fetching IP addresses:', error.message);
      throw error;
    }
  }

  validateAndProcessIPs(chunk) {
    return chunk.filter(ip => this.isValidIP(ip));
  }

  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = IpFetcher;



// const axios = require('axios');
// const readline = require('readline');
// const fs = require('fs'); // For writing to file
// require('dotenv').config();

// class IpFetcher {
//   constructor() {
//     this.url = process.env.IP_FETCH_URL;
//   }

//   async fetchIpAddresses() {
//     try {
//       console.log(`\n🔍 Fetching IP addresses from: ${this.url}`);
//       console.log(`⏰ Fetch time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })} BDT`);
      
//       const response = await axios.get(this.url, {
//         timeout: 30000, // 30 seconds timeout
//         headers: {
//           'User-Agent': 'IP-Monitor-Bot/1.0'
//         },
//         responseType: 'stream', // Stream the response data
//       });

//       if (response.status !== 200) {
//         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
//       }

//       console.log(`✅ Successfully fetched data, starting to process IPs...`);

//       // Create a readable stream using the response data (which is already a stream)
//       const rl = readline.createInterface({
//         input: response.data, // Input from the stream
//         crlfDelay: Infinity,   // Handle CRLF properly
//       });

//       // Create a write stream to the file
//       const outputStream = fs.createWriteStream('valid_ips.txt', { flags: 'a' }); // Append to a file

//       // Process each line (IP address) one by one
//       for await (const line of rl) {
//         const ip = line.trim();
//         if (this.isValidIP(ip)) {
//           outputStream.write(`${ip}\n`); // Write valid IPs directly to the file
//         }
//       }

//       console.log(`✅ Finished processing IPs and writing valid ones to valid_ips.txt`);

//     } catch (error) {
//       console.error('❌ Error fetching IP addresses:', error.message);
      
//       if (error.code === 'ECONNABORTED') {
//         console.error('⚠️  Request timed out');
//       } else if (error.response) {
//         console.error(`⚠️  Server responded with status: ${error.response.status}`);
//       } else if (error.request) {
//         console.error('⚠️  No response received from server');
//       }
      
//       throw error;
//     }
//   }

//   isValidIP(ip) {
//     // Basic IP validation (IPv4)
//     const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
//     // Basic IPv6 validation (simplified)
//     const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
//     return ipv4Regex.test(ip) || ipv6Regex.test(ip);
//   }
// }

// module.exports = IpFetcher;
