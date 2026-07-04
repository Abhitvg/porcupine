const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    console.warn(`[Env] .env file not found at ${envPath}`);
  }
}

// Load it immediately upon import
loadEnv();

module.exports = {
  get: (key, defaultValue = null) => {
    return process.env[key] || defaultValue;
  },
  requireKey: (key) => {
    const val = process.env[key];
    if (!val) {
      throw new Error(`CRITICAL: Missing required environment variable: ${key}`);
    }
    return val;
  }
};
