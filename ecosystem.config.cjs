// pm2 process definition. Secrets are NOT here: they come from .env (loaded by dotenv from `cwd`).
module.exports = {
  apps: [
    {
      name: "mcp-file-server",
      script: "dist/index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1, // keep 1: handoff-file locking is per process
      autorestart: true,
      min_uptime: "10s",
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: "300M",
      kill_timeout: 5000, // time allowed for graceful shutdown after SIGINT
      time: true, // timestamp log lines
      merge_logs: true,
      out_file: "logs/pm2-out.log",
      error_file: "logs/pm2-error.log",
      env: { NODE_ENV: "production" },
    },
  ],
};
