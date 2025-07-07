# IP Monitoring Application

A Node.js application that fetches IP addresses from a specified URL daily, compares them with existing data in MongoDB, and provides detailed analytics.

## Features

- 🕐 **Scheduled Execution**: Runs automatically every day at 10 PM BDT
- 📊 **IP Analysis**: Compares new IPs with existing database records
- 🗄️ **MongoDB Storage**: Stores only unique IP addresses (no duplicates)
- 📈 **Statistics**: Shows detailed analytics including duplicates found in fetched data
- 🔧 **Manual Trigger**: Run analysis manually for testing
- 📋 **Interactive CLI**: Command-line interface for manual operations
- 🚫 **Duplicate Prevention**: Prevents duplicate IPs from being stored in database

## Statistics Display

The application shows comprehensive statistics:
```
Total IPs Fetched: 1000
Total IPs in Database (before): 850
Total Same IPs (already exist in DB): 120
New Unique IPs: 150
Duplicate IPs in Fetched Data: 80
Duplicate Rate in Fetched Data: 8.00%
Already in Database Rate: 44.44%
New IP Rate: 55.56%
Total Unique IPs Processed: 270
```

## Installation

1. **Clone/Create the project directory:**
   ```bash
   mkdir ip-monitoring-app
   cd ip-monitoring-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file with:
   ```
   MONGODB_URI=mongodb://localhost:27017/ipMonitoringDB
   IP_FETCH_URL=https://intelligence.threatwinds.com/feeds/public/ip/cumulative.list
   ```

4. **Make sure MongoDB is running:**
   ```bash
   # Start MongoDB service
   sudo systemctl start mongod
   # or
   brew services start mongodb-community
   ```

## Usage

### Start the Application
```bash
npm start
```

### Development Mode
```bash
npm run dev
```

### Interactive Commands

Once the application is running, you can use these commands:

- **`r`** + Enter: Run job manually
- **`s`** + Enter: Show scheduler status
- **`d`** + Enter: Show database statistics
- **`q`** + Enter: Quit application

## File Structure

```
ip-monitoring-app/
├── package.json
├── .env
├── src/
│   ├── config/
│   │   └── database.js        # MongoDB connection
│   ├── models/
│   │   └── IpAddress.js       # IP address data model
│   ├── services/
│   │   ├── ipFetcher.js       # Fetches IPs from URL
│   │   └── ipAnalyzer.js      # Analyzes and stores IPs
│   ├── utils/
│   │   └── scheduler.js       # Cron job scheduler
│   └── app.js                 # Main application
└── README.md
```

## Database Schema

```javascript
{
  ip: String,           // IP address (unique - no duplicates allowed)
  firstSeen: Date,      // First time this IP was encountered
  lastSeen: Date,       // Last time this IP was seen
  isActive: Boolean,    // Whether this IP is currently active
  createdAt: Date,      // Document creation timestamp
  updatedAt: Date       // Document update timestamp
}
```

## Scheduled Execution

The application automatically runs every day at **10:00 PM Bangladesh Time (BDT)**. The scheduler:

- Fetches IP addresses from the configured URL
- Removes duplicate IPs from the fetched data
- Compares unique IPs with existing database records
- Adds only new unique IPs to the database (skips duplicates)
- Displays comprehensive statistics including duplicate counts

## Error Handling

The application includes robust error handling for:
- Network connectivity issues
- Database connection problems
- Invalid IP address formats
- Duplicate key conflicts
- Timeout scenarios

## Configuration

### MongoDB Configuration
- Default URI: `mongodb://localhost:27017/ipMonitoringDB`
- Automatically creates database and collections

### IP Fetch URL
- Configurable via `IP_FETCH_URL` environment variable
- Supports both IPv4 and IPv6 addresses
- Includes timeout and retry mechanisms

## Testing

To test the application:

1. **Start the application:**
   ```bash
   npm start
   ```

2. **Run manual job:**
   Press `r` + Enter to trigger a manual execution

3. **Check status:**
   Press `s` + Enter to see current status

4. **View statistics:**
   Press `d` + Enter to see database statistics

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error:**
   - Ensure MongoDB is running
   - Check the connection URI in `.env`

2. **Network Timeout:**
   - Check internet connectivity
   - Verify the IP fetch URL is accessible

3. **Permission Issues:**
   - Ensure proper file permissions
   - Check MongoDB write permissions

### Logs