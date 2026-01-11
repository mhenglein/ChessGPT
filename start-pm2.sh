#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop any existing PM2 processes
pm2 stop chessgpt 2>/dev/null || true
pm2 delete chessgpt 2>/dev/null || true

# Start the application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Show status
pm2 status

echo "ChessGPT started with PM2!"
echo "Use 'pm2 logs' to view logs"
echo "Use 'pm2 monit' for real-time monitoring"