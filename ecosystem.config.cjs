/**
 * PM2 Ecosystem Configuration
 * 
 * Run with: pm2 start ecosystem.config.cjs
 */

module.exports = {
    apps: [
        {
            name: 'notifoty',
            script: './src/index.js',

            // Environment
            node_args: '--experimental-modules',

            // Instances and cluster mode
            instances: 1, // Single instance - bot state must not be duplicated
            exec_mode: 'fork',

            // Restart behavior
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',

            // Error handling
            max_restarts: 10,
            min_uptime: '30s',
            restart_delay: 5000,

            // Logging
            log_file: './logs/combined.log',
            out_file: './logs/out.log',
            error_file: './logs/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // Environment variables for production
            env: {
                NODE_ENV: 'production',
            },

            // Environment variables for development
            env_development: {
                NODE_ENV: 'development',
                LOG_LEVEL: 'debug',
            },

            // Graceful shutdown
            kill_timeout: 10000,

            // Cron restart (optional - restart daily at 4 AM for memory cleanup)
            // cron_restart: '0 4 * * *',
        },
    ],
};
