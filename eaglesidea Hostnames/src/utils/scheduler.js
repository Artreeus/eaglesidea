const cron = require('node-cron');
const moment = require('moment-timezone');

class Scheduler {
  constructor(hostnameFetcher, hostnameAnalyzer) {
    this.hostnameFetcher = hostnameFetcher;
    this.hostnameAnalyzer = hostnameAnalyzer;
    this.isRunning = false;
  }

  start() {
    console.log('🕐 Scheduler started - Will run daily at 10:00 PM BDT');
    console.log('⏰ Next scheduled run:', this.getNextRunTime());

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
  }

  async executeJob() {
    this.isRunning = true;
    const startTime = new Date();

    try {
      console.log('\n' + '🚀'.repeat(20));
      console.log('🚀 DAILY HOSTNAME MONITORING JOB STARTED');
      console.log('🚀'.repeat(20));
      console.log(`⏰ Job started at: ${moment().tz('Asia/Dhaka').format('YYYY-MM-DD HH:mm:ss')} BDT`);

      const hostnames = await this.hostnameFetcher.fetchHostnames();

      if (hostnames && hostnames.length > 0) {
        const stats = await this.hostnameAnalyzer.analyzeAndStore(hostnames);
        await this.hostnameAnalyzer.getLatestHostnames(5);

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
        console.log('⚠️  No hostnames fetched');
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

  getNextRunTime() {
    const now = moment().tz('Asia/Dhaka');
    let nextRun = moment().tz('Asia/Dhaka').hour(22).minute(0).second(0);

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
