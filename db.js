const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'jarvis.db');
const db = new Database(dbPath);

// Initialize tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      auto_execute BOOLEAN DEFAULT 0,
      model TEXT DEFAULT 'google/gemini-2.5-pro:free'
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      content TEXT,
      status TEXT DEFAULT 'pending_review',
      scheduled_for DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents (id)
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT,
      metric_value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS published_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      platform TEXT,
      reference_id TEXT,
      content TEXT,
      status TEXT DEFAULT 'active',
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      account_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      author_urn TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      done BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

  `);

  // Migrations for existing tables
  try {
    db.exec("ALTER TABLE proposals ADD COLUMN target_account_id INTEGER;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE proposals ADD COLUMN image_url TEXT;");
  } catch (e) { /* ignore if column exists */ }

  try {
    db.exec("ALTER TABLE published_items ADD COLUMN target_account_id INTEGER;");
  } catch (e) { /* ignore if column exists */ }

  try {
    db.exec("ALTER TABLE published_items ADD COLUMN image_url TEXT;");
  } catch (e) { /* ignore if column exists */ }

  // Insert default agents if they don't exist
  const agents = [
    { id: 'seo-specialist', name: 'SEO Specialist' },
    { id: 'crm-manager', name: 'CRM Manager' },
    { id: 'content-strategist', name: 'Content Strategist' },
    { id: 'research-analyst', name: 'Research Analyst' },
    { id: 'frontend-developer', name: 'Frontend Developer' },
    { id: 'backend-architect', name: 'Backend Architect' },
    { id: 'ui-designer', name: 'UI Designer' },
    { id: 'sales-outreach', name: 'Sales Outreach' },
    { id: 'growth-hacker', name: 'Growth Hacker' },
    { id: 'social-media-strategist', name: 'Social Media Strategist' },
    { id: 'product-manager', name: 'Product Manager' },
    { id: 'customer-service', name: 'Customer Service' },
    { id: 'analytics-reporter', name: 'Analytics Reporter' },
    { id: 'ceo', name: 'Chief Executive Officer' }
  ];

  const insertAgent = db.prepare('INSERT OR IGNORE INTO agents (id, name, model) VALUES (@id, @name, @model)');
  
  const insertMany = db.transaction((agents) => {
    for (const agent of agents) {
      if (agent.id === 'ceo' || agent.id === 'backend-architect') {
        insertAgent.run({ ...agent, model: 'meta-llama/llama-3.3-70b-instruct:free' });
      } else {
        insertAgent.run({ ...agent, model: 'google/gemini-2.5-pro:free' });
      }
    }
  });
  
  insertMany(agents);

  // Pre-populate analytics metrics if not present
  const metrics = [
    { metric_name: 'tasks_completed', metric_value: '0' },
    { metric_name: 'posts_published', metric_value: '0' }
  ];
  const insertMetric = db.prepare('INSERT INTO analytics (metric_name, metric_value) SELECT @metric_name, @metric_value WHERE NOT EXISTS (SELECT 1 FROM analytics WHERE metric_name = @metric_name)');
  const insertManyMetrics = db.transaction((metrics) => {
    for (const m of metrics) insertMetric.run(m);
  });
  insertManyMetrics(metrics);

  // Insert LinkedIn Webhook dummy account if not present
  db.prepare(`
    INSERT INTO accounts (platform, account_name, access_token)
    SELECT 'webhook', 'Make.com Webhook', ?
    WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE platform = 'webhook')
  `).run(process.env.LINKEDIN_COMPANY_WEBHOOK_URL || '');

  // Phase 5 Migrations
  try { db.exec("ALTER TABLE proposals ADD COLUMN target_account_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE proposals ADD COLUMN image_url TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE published_items ADD COLUMN likes INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE published_items ADD COLUMN shares INTEGER DEFAULT 0"); } catch (e) {}
}

module.exports = {
  db,
  initDb
};
