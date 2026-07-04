const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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
    return { success: true };
  } catch (e) {
    console.error('Error saving vault:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('submit-manual-task', async (event, { agentId, task }) => {
  executeManualTask(agentId, task);
  return { success: true };
});

ipcMain.handle('get-agents', () => {
  return db.prepare('SELECT * FROM agents').all();
});

ipcMain.handle('toggle-auto-execute', (event, { agentId, autoExecute }) => {
  db.prepare('UPDATE agents SET auto_execute = ? WHERE id = ?').run(autoExecute ? 1 : 0, agentId);
  return { success: true };
});

ipcMain.handle('update-agent-model', (event, { agentId, model }) => {
  db.prepare('UPDATE agents SET model = ? WHERE id = ?').run(model, agentId);
  return { success: true };
});

ipcMain.handle('get-proposals', () => {
  return db.prepare("SELECT * FROM proposals WHERE status = 'pending_review' ORDER BY created_at DESC").all();
});

ipcMain.handle('update-proposal-status', async (event, { proposalId, status, scheduledFor }) => {
  if (scheduledFor) {
    db.prepare('UPDATE proposals SET status = ?, scheduled_for = ? WHERE id = ?').run('scheduled', scheduledFor, proposalId);
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Proposal ${proposalId} scheduled for ${new Date(scheduledFor).toLocaleString()}.`);
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

ipcMain.handle('get-analytics', () => {
  return db.prepare('SELECT * FROM analytics').all();
});

ipcMain.handle('get-logs', () => {
  return db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50').all();
});

ipcMain.handle('get-published-items', () => {
  return db.prepare("SELECT * FROM published_items ORDER BY published_at DESC LIMIT 50").all();
});

ipcMain.handle('revoke-action', async (event, { id, platform, reference_id }) => {
  try {
    await revokeAction(platform, reference_id);
    db.prepare("UPDATE published_items SET status = 'revoked' WHERE id = ?").run(id);
    return { success: true };
  } catch (err) {
    console.error("Revoke error:", err);
    return { success: false, error: err.message };
  }
});

// ─── Accounts IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('get-accounts', () => {
  // FIX: Don't expose access_token to the renderer process
  return db.prepare('SELECT id, platform, account_name, is_active, created_at FROM accounts').all();
});

ipcMain.handle('add-account', (event, { platform, account_name, access_token, refresh_token, author_urn }) => {
  try {
    if (platform === 'webhook') {
      author_urn = 'urn:webhook';
    }
    const stmt = db.prepare('INSERT INTO accounts (platform, account_name, access_token, refresh_token, author_urn) VALUES (?, ?, ?, ?, ?)');
    stmt.run(platform, account_name, access_token, refresh_token || null, author_urn || null);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-account', (event, { id, is_active }) => {
  try {
    db.prepare('UPDATE accounts SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-account', (event, id) => {
  try {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
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

ipcMain.handle('get-todos', () => {
  return db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all();
});

ipcMain.handle('add-todo', (event, { text }) => {
  try {
    const result = db.prepare('INSERT INTO todos (text) VALUES (?)').run(text);
    return { success: true, id: result.lastInsertRowid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-todo', (event, { id, done }) => {
  try {
    db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-todo', (event, id) => {
  try {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const update = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        stmt.run(key, value);
      }
    });
    update(settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Agents IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('create-agent', async (event, { id, name, systemPrompt }) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Insert into SQLite
    db.prepare("INSERT INTO agents (id, name, status, auto_execute, model) VALUES (?, ?, 'idle', 0, 'google/gemini-2.5-pro:free')").run(id, name);
    
    // Write system prompt to file
    const promptPath = path.join(__dirname, 'src', 'agents', `${id}.md`);
    await fs.promises.writeFile(promptPath, systemPrompt, 'utf8');
    
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `New agent cloned: ${name} (${id})`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

