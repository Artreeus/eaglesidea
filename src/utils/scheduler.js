const cron = require('node-cron');
const moment = require('moment-timezone');

class Scheduler {
  constructor(ipFetcher, ipAnalyzer) {
    this.ipFetcher = ipFetcher;
    this.ipAnalyzer = ipAnalyzer;
    this.isRunning = false;
  }

  start() {
    console.log('🕐 Scheduler started - Will run daily at 10:00 PM BDT');
    console.log('⏰ Next scheduled run:', this.getNextRunTime());
    
    // Schedule for 10:00 PM BDT (22:00)
    // Cron expression: "0 22 * * *" (minute hour day month dayOfWeek)
    cron.schedule('0 22 * * *', async () => {
      if (this.isRunning) {
        console.log('⚠️  Previous job still running, skipping this execution');
        return;
      }
      
      await this.executeJob();
    }, {
      scheduled: true,
      timezone: "Asia/Dhaka"
    });

    // Optional: Add a test schedule that runs every minute (uncomment for testing)
    // cron.schedule('* * * * *', async () => {
    //   console.log('🧪 Test job running every minute...');
    //   await this.executeJob();
    // });
  }

  async executeJob() {
    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log('\n' + '🚀'.repeat(20));
      console.log('🚀 DAILY IP MONITORING JOB STARTED');
      console.log('🚀'.repeat(20));
      console.log(`⏰ Job started at: ${moment().tz('Asia/Dhaka').format('YYYY-MM-DD HH:mm:ss')} BDT`);
      
      // Fetch IP addresses
      const ipAddresses = await this.ipFetcher.fetchIpAddresses();
      
      if (ipAddresses && ipAddresses.length > 0) {
        // Analyze and store
        const stats = await this.ipAnalyzer.analyzeAndStore(ipAddresses);
        
        // Show latest IPs
        await this.ipAnalyzer.getLatestIps(5);
        
        const endTime = new Date();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '✅'.repeat(20));
        console.log('✅ JOB COMPLETED SUCCESSFULLY');
        console.log('✅'.repeat(20));
        console.log(`⏱️  Total execution time: ${duration} seconds`);
        console.log(`⏰ Job finished at: ${moment().tz('Asia/Dhaka').format('YYYY-MM-DD HH:mm:ss')} BDT`);
        console.log('⏰ Next scheduled run:', this.getNextRunTime());
        console.log('✅'.repeat(20));
        
      } else {
        console.log('⚠️  No IP addresses were fetched');
      }
      
    } catch (error) {
      console.log('\n' + '❌'.repeat(20));
      console.log('❌ JOB FAILED');
      console.log('❌'.repeat(20));
      console.error('Error during scheduled job execution:', error.message);
      console.log('❌'.repeat(20));
    } finally {
      this.isRunning = false;
    }
  }

  // Manual trigger for testing
  async runNow() {
    console.log('🔧 Manual job execution triggered...');
    await this.executeJob();
  }

  getNextRunTime() {
    const now = moment().tz('Asia/Dhaka');
    let nextRun = moment().tz('Asia/Dhaka').hour(22).minute(0).second(0);
    
    // If it's already past 10 PM today, schedule for tomorrow
    if (now.isAfter(nextRun)) {
      nextRun = nextRun.add(1, 'day');
    }
    
    return nextRun.format('YYYY-MM-DD HH:mm:ss') + ' BDT';
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.getNextRunTime(),
      currentTime: moment().tz('Asia/Dhaka').format('YYYY-MM-DD HH:mm:ss') + ' BDT'
    };
  }
}

module.exports = Scheduler;