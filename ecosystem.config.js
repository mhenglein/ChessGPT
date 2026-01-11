module.exports = {
  apps: [{
    name: 'chessgpt',
    script: './cluster.js',
    instances: process.env.WEB_CONCURRENCY || 1,
    exec_mode: 'cluster',
    node_args: '--optimize_for_size --max_old_space_size=460 --gc_interval=100 --expose-gc',
    env: {
      NODE_ENV: 'production',
      PORT: 3500
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3500
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '450M',
    restart_delay: 4000,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health check
    health_check: {
      interval: 30,
      url: 'http://localhost:3500/health',
      max_consecutive_failures: 3
    },
    
    // Auto restart cron (daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Environment specific error handling
    error_strategies: {
      max_consecutive_restarts: 5,
      restart_delay_growth: 1.5,
      min_restart_delay: 1000,
      max_restart_delay: 30000
    }
  }]
};