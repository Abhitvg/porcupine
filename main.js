const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const qs = require('querystring');
const { initDb, db } = require('./db');
const { startOrchestrator, executeManualTask } = require('./orchestrator');
const { startVoiceListener } = require('./voice');
const env = require('./utils/env');
const isDev = !app.isPackaged;


function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] [${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev) {
    win.loadURL('http://localhost:3333');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'out/index.html'));
  }
  
  return win;
}

app.whenReady().then(() => {
  initDb();
  
  // Migrate sensitive settings to safeStorage if available
  if (safeStorage.isEncryptionAvailable()) {
    const SENSITIVE_KEYS = ['openrouter_api_key'];
    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' + SENSITIVE_KEYS.map(k => `'${k}'`).join(',') + ')').all();
    for (const row of rows) {
      let isEncrypted = false;
      try {
        safeStorage.decryptString(Buffer.from(row.value, 'base64'));
        isEncrypted = true;
      } catch(e) {}
      
      if (!isEncrypted && row.value) {
        console.log(`[Security] Migrating ${row.key} to safeStorage...`);
        const encrypted = safeStorage.encryptString(row.value).toString('base64');
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(encrypted, row.key);
      }
    }
  }

  startOrchestrator();
  const mainWindow = createWindow();
  startVoiceListener(ipcMain, mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Basic IPC to test connection
ipcMain.on('ping', (event, arg) => {
  console.log('Ping from React received:', arg);
  event.reply('ping-reply', 'pong');
});

const { executeAction, revokeAction } = require('./publisher');

// ─── Database IPC handlers ────────────────────────────────────────────────────
const fs = require('fs');

ipcMain.handle('get-vault-context', () => {
  try {
    const vaultPath = path.join(__dirname, 'vault', 'atma_context.txt');
    if (fs.existsSync(vaultPath)) {
      return fs.readFileSync(vaultPath, 'utf8');
    }
    return '';
  } catch (e) {
    console.error('Error reading vault:', e);
    return '';
  }
});

ipcMain.handle('save-vault-context', (event, content) => {
  try {
    const vaultPath = path.join(__dirname, 'vault', 'atma_context.txt');
    fs.writeFileSync(vaultPath, content, 'utf8');
    // We should tell the orchestrator to reload it. Since we can't easily reach it without exporting a reload function, we'll assume orchestrator reads it on tick, but actually orchestrator caches it.
    // Let's call a reload function if we export it from orchestrator.
    const { loadRAGVault } = require('./orchestrator');
    if (loadRAGVault) loadRAGVault();
    broadcastStateUpdate();
    return { success: true };
  } catch (e) {
    console.error('Error saving vault:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('submit-manual-task', async (event, { agentId, task, orgId = 'org-default' }) => {
  executeManualTask(agentId, task);
  broadcastStateUpdate();
    return { success: true };
});

ipcMain.handle('get-agents', (event, orgId = 'org-default') => {
  return db.prepare('SELECT * FROM agents WHERE org_id = ?').all(orgId);
});

ipcMain.handle('toggle-auto-execute', (event, { agentId, autoExecute }) => {
  db.prepare('UPDATE agents SET auto_execute = ? WHERE id = ?').run(autoExecute ? 1 : 0, agentId);
  broadcastStateUpdate();
    return { success: true };
});

ipcMain.handle('update-agent-model', (event, { agentId, model }) => {
  db.prepare('UPDATE agents SET model = ? WHERE id = ?').run(model, agentId);
  broadcastStateUpdate();
    return { success: true };
});

ipcMain.handle('get-proposals', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM proposals WHERE status = 'pending_review' AND org_id = ? ORDER BY created_at DESC").all(orgId);
});

ipcMain.handle('update-proposal-status', async (event, { proposalId, status, scheduledFor }) => {
  if (scheduledFor) {
    db.prepare('UPDATE proposals SET status = ?, scheduled_for = ? WHERE id = ?').run('scheduled', scheduledFor, proposalId);
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Proposal ${proposalId} scheduled for ${new Date(scheduledFor).toLocaleString()}.`);
    broadcastStateUpdate();
    return { success: true };
  } else {
    db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run(status, proposalId);
  }
  
  if (status === 'approved') {
    const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId);
    if (proposal) {
      let refId1 = null, refId2 = null, refId3 = null, platform1 = null, platform2 = null, platform3 = null;
      let targetAccountId = proposal.target_account_id;
      let imageUrl = proposal.image_url;

      try {
        if (proposal.agent_id === 'social-media-strategist' || proposal.agent_id === 'ceo') {
          if (targetAccountId) {
            const account = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(targetAccountId);
            platform1 = account ? account.platform : 'twitter';
            refId1 = await executeAction(platform1, proposal.content, targetAccountId, imageUrl);
          } else {
            platform1 = 'twitter';
            refId1 = await executeAction(platform1, proposal.content, null, imageUrl);
            platform2 = 'linkedin';
            refId2 = await executeAction(platform2, proposal.content, null, imageUrl);
            platform3 = 'webhook';
            refId3 = await executeAction(platform3, proposal.content, null, imageUrl);
          }
        } else if (proposal.agent_id === 'seo-specialist' || proposal.agent_id === 'content-strategist') {
          platform1 = 'seo-content';
          // FIX: Use current date instead of random backdating
          refId1 = await executeAction(platform1, proposal.content);
        } else if (proposal.agent_id === 'sales-outreach' || proposal.agent_id === 'crm-manager') {
          platform1 = 'crm-campaign';
          refId1 = await executeAction(platform1, proposal.content);
        } else {
          platform1 = 'generic';
          refId1 = await executeAction(platform1, proposal.content);
        }

        // Save to published_items
        const insertPub = db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content, target_account_id, image_url) VALUES (?, ?, ?, ?, ?, ?)');
        
        const handleRefIds = (platform, refIds) => {
          if (!refIds) return;
          const ids = Array.isArray(refIds) ? refIds : [refIds];
          ids.forEach(id => {
            insertPub.run(proposal.agent_id, platform, id, proposal.content, targetAccountId, imageUrl);
          });
        };
        
        handleRefIds(platform1, refId1);
        handleRefIds(platform2, refId2);
        handleRefIds(platform3, refId3);
      } catch (err) {
        console.error("Action execution failed:", err);
        // FIX: Return error to the UI so it can display the problem
        db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Approval execution failed: ${err.message}`);
        return { success: false, error: err.message };
      }
      
      // Update analytics
      db.prepare("UPDATE analytics SET metric_value = CAST(metric_value AS INTEGER) + 1 WHERE metric_name = 'tasks_completed'").run();
      db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Task from ${proposal.agent_id} approved & executed.`);
    }
  }
  return { success: true };
});

ipcMain.handle('get-analytics', (event, orgId = 'org-default') => {
  return db.prepare('SELECT * FROM analytics WHERE org_id = ?').all(orgId);
});

ipcMain.handle('get-logs', (event, orgId = 'org-default') => {
  return db.prepare('SELECT * FROM logs WHERE org_id = ? ORDER BY timestamp DESC LIMIT 50').all(orgId);
});

ipcMain.handle('get-published-items', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM published_items WHERE org_id = ? ORDER BY published_at DESC LIMIT 50").all(orgId);
});

ipcMain.handle('revoke-action', async (event, { id, platform, reference_id }) => {
  try {
    await revokeAction(platform, reference_id);
    db.prepare("UPDATE published_items SET status = 'revoked' WHERE id = ?").run(id);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    console.error("Revoke error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('twitter-oauth-login', async (event) => {
  const clientId = env.get('TWITTER_CLIENT_ID');
  
  if (!clientId || clientId === 'INSERT_YOUR_NEW_CLIENT_ID_HERE') {
    return { success: false, error: 'Twitter Client ID not configured in .env' };
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = 'https://www.atma-ai.co.in/callback'; // Make sure this matches Developer Portal

  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  return new Promise((resolve, reject) => {
    let authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    authWindow.loadURL(authUrl);
    authWindow.show();

    const filter = { urls: [`${redirectUri}*`] };
    authWindow.webContents.session.webRequest.onBeforeRequest(filter, async (details, callback) => {
      const url = new URL(details.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        callback({ cancel: true });
        authWindow.close();
        resolve({ success: false, error });
        return;
      }

      if (code && returnedState === state) {
        callback({ cancel: true });
        authWindow.close();
        
        try {
          // Exchange code for token
          const postData = qs.stringify({
            code,
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
          });

          const options = {
            hostname: 'api.twitter.com',
            port: 443,
            path: '/2/oauth2/token',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const response = JSON.parse(data);
                if (response.access_token) {
                  // Save to DB
                  const orgId = 'org-default';
                  const accountName = 'Twitter User'; // Ideally we would fetch the user profile here, but let's keep it simple
                  const stmt = db.prepare(`
                    INSERT INTO accounts (platform, account_name, access_token, refresh_token, org_id) 
                    VALUES (?, ?, ?, ?, ?)
                  `);
                  
                  // Encrypt tokens before saving
                  const encryptedAccess = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(response.access_token).toString('base64') : response.access_token;
                  const encryptedRefresh = response.refresh_token && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(response.refresh_token).toString('base64') : (response.refresh_token || '');

                  stmt.run('twitter', accountName, encryptedAccess, encryptedRefresh, orgId);
                  
                  // Also update settings table to maintain backwards compatibility
                  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('twitter_access_token', ?)").run(encryptedAccess);
                  if (encryptedRefresh) {
                    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('twitter_refresh_token', ?)").run(encryptedRefresh);
                  }

                  resolve({ success: true });
                } else {
                  resolve({ success: false, error: response.error_description || 'Failed to get access token' });
                }
              } catch (e) {
                resolve({ success: false, error: e.message });
              }
            });
          });

          req.on('error', (e) => resolve({ success: false, error: e.message }));
          req.write(postData);
          req.end();

        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      } else {
        callback({ cancel: false });
      }
    });

    authWindow.on('closed', () => {
      resolve({ success: false, error: 'Authentication window was closed' });
    });
  });
});

// ─── Accounts IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('get-accounts', (event, orgId = 'org-default') => {
  // FIX: Don't expose access_token to the renderer process
  return db.prepare('SELECT id, platform, account_name, is_active, created_at FROM accounts WHERE org_id = ?').all(orgId);
});

ipcMain.handle('add-account', (event, { platform, account_name, access_token, refresh_token, author_urn, orgId = 'org-default' }) => {
  try {
    if (platform === 'webhook') {
      author_urn = 'urn:webhook';
    }
    const stmt = db.prepare('INSERT INTO accounts (platform, account_name, access_token, refresh_token, author_urn, org_id) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(platform, account_name, access_token, refresh_token || null, author_urn || null, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-account', (event, { id, is_active }) => {
  try {
    db.prepare('UPDATE accounts SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-account', (event, id) => {
  try {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('test-webhook', async (event, accountId) => {
  try {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!account || !account.access_token) throw new Error("Webhook URL not found");
    
    const webhookRes = await fetch(account.access_token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: "This is a test webhook from ATMA AI!", imageUrl: null })
    });
    
    if (!webhookRes.ok) {
      const err = await webhookRes.text();
      throw new Error(`HTTP Error: ${webhookRes.status} - ${err}`);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── OAuth IPC ────────────────────────────────────────────────────────────────
ipcMain.handle('start-linkedin-oauth', async (event) => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const LINKEDIN_CLIENT_ID = env.get('LINKEDIN_CLIENT_ID');
    const LINKEDIN_CLIENT_SECRET = env.get('LINKEDIN_CLIENT_SECRET');
    const LINKEDIN_REDIRECT_URI = env.get('LINKEDIN_REDIRECT_URI');
    
    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
      resolve({ success: false, error: 'Missing LinkedIn credentials in .env. Please configure them in the Settings.' });
      return;
    }
    
    const state = Math.random().toString(36).substring(2, 15);
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&state=${state}&scope=${encodeURIComponent('w_member_social profile openid email')}`;

    authWindow.loadURL(authUrl);

    let isResolved = false;

    authWindow.webContents.on('will-redirect', async (e, url) => {
      if (url.startsWith(LINKEDIN_REDIRECT_URI)) {
        e.preventDefault();
        const rawCode = /code=([^&]*)/.exec(url) || null;
        const code = rawCode && rawCode.length > 1 ? rawCode[1] : null;
        const errorMatch = /error=([^&]*)/.exec(url);

        if (code) {
          try {
            const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: LINKEDIN_REDIRECT_URI,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_CLIENT_SECRET,
              }).toString()
            });
            const tokenData = await tokenResponse.json();
            
            if (tokenData.access_token) {
              const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
              });
              const profile = await profileResponse.json();
              const author_urn = `urn:li:person:${profile.sub}`;
              const account_name = profile.name || profile.given_name || 'LinkedIn User';

              const stmt = db.prepare('INSERT INTO accounts (platform, account_name, access_token, author_urn) VALUES (?, ?, ?, ?)');
              stmt.run('linkedin', account_name, tokenData.access_token, author_urn);
              
              if (!isResolved) { isResolved = true; resolve({ success: true, account_name }); }
            } else {
              if (!isResolved) { isResolved = true; resolve({ success: false, error: tokenData.error_description || 'Failed to get token' }); }
            }
          } catch (err) {
            if (!isResolved) { isResolved = true; resolve({ success: false, error: err.message }); }
          }
        } else if (errorMatch) {
          if (!isResolved) { isResolved = true; resolve({ success: false, error: decodeURIComponent(errorMatch[1]) }); }
        }
        
        authWindow.close();
      }
    });

    authWindow.on('closed', () => {
      if (!isResolved) {
        resolve({ success: false, error: 'Window closed before completing auth' });
      }
    });
  });
});

// ─── Todos IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('get-todos', (event, orgId = 'org-default') => {
  return db.prepare('SELECT * FROM todos WHERE org_id = ? ORDER BY created_at DESC').all(orgId);
});

ipcMain.handle('get-organizations', () => {
  try {
    return db.prepare('SELECT * FROM organizations ORDER BY created_at ASC').all();
  } catch (err) {
    return [];
  }
});

ipcMain.handle('create-organization', (event, { id, name }) => {
  try {
    db.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run(id, name);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('add-todo', (event, { text, orgId = 'org-default' }) => {
  try {
    const result = db.prepare('INSERT INTO todos (text, org_id) VALUES (?, ?)').run(text, orgId);
    broadcastStateUpdate();
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-todo', (event, { id, done }) => {
  try {
    db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-todo', (event, id) => {
  try {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  const SENSITIVE_KEYS = ['openrouter_api_key'];
  for (const row of rows) {
    if (SENSITIVE_KEYS.includes(row.key) && safeStorage.isEncryptionAvailable() && row.value) {
      try {
        settings[row.key] = safeStorage.decryptString(Buffer.from(row.value, 'base64'));
      } catch (e) {
        settings[row.key] = row.value; // Fallback or corrupted
      }
    } else {
      settings[row.key] = row.value;
    }
  }
  return settings;
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const SENSITIVE_KEYS = ['openrouter_api_key'];
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const update = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        let finalValue = value;
        if (SENSITIVE_KEYS.includes(key) && safeStorage.isEncryptionAvailable() && value) {
          finalValue = safeStorage.encryptString(value).toString('base64');
        }
        stmt.run(key, finalValue);
      }
    });
    update(settings);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── CRM & Sales IPC ────────────────────────────────────────────────────────────

ipcMain.handle('get-leads', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM leads WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
});

ipcMain.handle('add-lead', (event, { id, name, email, source, value, orgId = 'org-default' }) => {
  try {
    db.prepare("INSERT INTO leads (id, name, email, source, value, org_id) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, email, source, value, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-orders', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM orders WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
});

ipcMain.handle('add-order', (event, { id, leadId, totalAmount, orgId = 'org-default' }) => {
  try {
    db.prepare("INSERT INTO orders (id, lead_id, total_amount, org_id) VALUES (?, ?, ?, ?)").run(id, leadId, totalAmount, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Billing IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('get-billing', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM billing WHERE org_id = ?").all(orgId);
});

// ─── Support IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('get-support-tickets', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM support_tickets WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
});

ipcMain.handle('add-support-ticket', (event, { id, subject, customerEmail, message, aiResponse, status = 'open', orgId = 'org-default' }) => {
  try {
    db.prepare("INSERT INTO support_tickets (id, subject, customer_email, message, ai_response, status, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, subject, customerEmail, message, aiResponse, status, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Domain Experts IPC ────────────────────────────────────────────────────────

ipcMain.handle('get-domain-experts', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM domain_experts WHERE org_id = ?").all(orgId);
});

ipcMain.handle('add-domain-expert', (event, { id, name, domain, instructions, orgId = 'org-default' }) => {
  try {
    db.prepare("INSERT INTO domain_experts (id, name, domain, instructions, org_id) VALUES (?, ?, ?, ?, ?)").run(id, name, domain, instructions, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Agents IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('create-agent', async (event, { id, name, systemPrompt, orgId = 'org-default' }) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Insert into SQLite
    db.prepare("INSERT INTO agents (id, name, status, auto_execute, model, org_id) VALUES (?, ?, 'idle', 0, 'google/gemini-2.5-pro:free', ?)").run(id, name, orgId);
    
    // Write system prompt to file
    const promptPath = path.join(__dirname, 'src', 'agents', `${id}.md`);
    await fs.promises.writeFile(promptPath, systemPrompt, 'utf8');
    
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `New agent cloned: ${name} (${id})`);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Investors IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('get-investors', (event, orgId = 'org-default') => {
  return db.prepare("SELECT * FROM investors WHERE org_id = ? ORDER BY created_at DESC").all(orgId);
});

ipcMain.handle('add-investor', (event, { id, name, firm, email, status = 'New', notes = '', orgId = 'org-default' }) => {
  try {
    db.prepare("INSERT INTO investors (id, name, firm, email, status, notes, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, name, firm, email, status, notes, orgId);
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('upload-investors-csv', (event, { csvData, orgId = 'org-default' }) => {
  try {
    const { parse } = require('csv-parse/sync');
    const records = parse(csvData, { columns: true, skip_empty_lines: true });
    
    const insertInvestor = db.prepare('INSERT OR IGNORE INTO investors (id, name, firm, email, status, notes, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((records) => {
      for (const row of records) {
        const id = 'inv-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        // Expecting standard headers: name, firm, email, notes
        insertInvestor.run(id, row.name || 'Unknown', row.firm || 'Unknown Firm', row.email || '', 'New', row.notes || '', orgId);
      }
    });
    insertMany(records);
    broadcastStateUpdate();
    return { success: true, count: records.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('trigger-investor-outreach', async (event, orgId = 'org-default') => {
  try {
    const { executeManualTask } = require('./orchestrator');
    await executeManualTask('investor-relations', 'Please check for new investors and draft an outreach email.');
    broadcastStateUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function broadcastStateUpdate() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return;
  const win = windows[0];

  try {
    win.webContents.send('db-changed');
  } catch(e) {
    console.error("Error broadcasting state update:", e);
  }
}

module.exports.broadcastStateUpdate = broadcastStateUpdate;
