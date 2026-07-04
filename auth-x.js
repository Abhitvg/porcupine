const readline = require('readline');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Load credentials from .env
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^#=][^=]*)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  } catch (e) { /* ignore */ }
}
loadEnv();

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const REDIRECT_URI = "https://articles.atma-ai.co.in/";
const SCOPES = "tweet.read tweet.write users.read offline.access";

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
  console.error("Missing TWITTER_CLIENT_ID or TWITTER_CLIENT_SECRET in .env");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const state = crypto.randomBytes(16).toString('hex');

// PKCE Challenge
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

console.log("=== X (TWITTER) OAUTH 2.0 SETUP ===");
console.log("1. Open this URL in your browser:\n");
console.log(authUrl);
console.log(`\n2. Log in and authorize the app.`);
console.log(`3. You will be redirected to ${REDIRECT_URI}?state=${state}&code=XXXX`);
console.log("4. Copy the entire URL you were redirected to and paste it here:");

rl.question('> ', async (answer) => {
  try {
    const url = new URL(answer.trim());
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (returnedState !== state) {
      console.error("State mismatch. Possible CSRF attack.");
      process.exit(1);
    }

    if (!code) {
      console.error("No code found in the URL.");
      process.exit(1);
    }

    console.log("\nExchanging code for access token...");
    
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', TWITTER_CLIENT_ID);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code_verifier', codeVerifier);
    params.append('code', code);
    
    const authHeader = 'Basic ' + Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: params.toString()
    });

    const data = await response.json();
    
    if (data.access_token) {
      console.log("\n✅ SUCCESS! Token obtained.");
      console.log(`Token expires in: ${data.expires_in} seconds\n`);
      
      // Auto-save to accounts table
      try {
        const Database = require('better-sqlite3');
        const dbPath = path.join(__dirname, 'jarvis.db');
        const db = new Database(dbPath);
        
        const accountName = `X/Twitter Account (${new Date().toLocaleDateString()})`;
        db.prepare('INSERT INTO accounts (platform, account_name, access_token, refresh_token) VALUES (?, ?, ?, ?)')
          .run('twitter', accountName, data.access_token, data.refresh_token || null);
        
        // Also save to settings for legacy compatibility
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('twitter_access_token', data.access_token);
        if (data.refresh_token) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('twitter_refresh_token', data.refresh_token);
        }
        
        console.log(`✅ Token automatically saved to database as "${accountName}"`);
        console.log("   You can see it in your ATMA AI dashboard under Connected Accounts.");
        db.close();
      } catch (dbErr) {
        console.warn("⚠️  Could not auto-save to database:", dbErr.message);
        console.log(`   Manually add this token: ${data.access_token}`);
      }
    } else {
      console.error("❌ Failed to get token:", data);
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    rl.close();
  }
});
