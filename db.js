const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'jarvis.db');
const db = new Database(dbPath);

// Initialize tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'idle',
      auto_execute BOOLEAN DEFAULT 0,
      model TEXT DEFAULT 'google/gemini-2.5-pro:free',
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      content TEXT,
      status TEXT DEFAULT 'pending_review',
      scheduled_for DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents (id),
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT,
      metric_value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );
    
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS published_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      platform TEXT,
      reference_id TEXT,
      content TEXT,
      status TEXT DEFAULT 'active',
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      done BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      company TEXT,
      status TEXT DEFAULT 'New',
      source TEXT,
      value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      customer_name TEXT,
      amount REAL,
      status TEXT DEFAULT 'Completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS billing (
      id TEXT PRIMARY KEY,
      description TEXT,
      amount REAL,
      status TEXT DEFAULT 'Paid',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      subject TEXT,
      customer_email TEXT,
      message TEXT,
      ai_response TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS domain_experts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      instructions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
    );

    CREATE TABLE IF NOT EXISTS investors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      firm TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'New',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      org_id TEXT,
      FOREIGN KEY (org_id) REFERENCES organizations (id)
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

  try {
    db.exec("ALTER TABLE agents ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE proposals ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE analytics ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE logs ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE published_items ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }
  
  try {
    db.exec("ALTER TABLE todos ADD COLUMN org_id TEXT;");
  } catch (e) { /* ignore if column exists */ }

  // Insert default organization if it doesn't exist
  try {
    db.prepare('INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)').run('org-default', 'My Workspace');
  } catch(e) {}

  // Backfill org_id for existing records
  ['agents', 'proposals', 'analytics', 'logs', 'published_items', 'accounts', 'todos'].forEach(table => {
    try {
      db.prepare(`UPDATE ${table} SET org_id = 'org-default' WHERE org_id IS NULL`).run();
    } catch(e) {}
  });

  const agents = [
    { id: 'seo-specialist', name: 'SEO Specialist', org_id: 'org-default' },
    { id: 'crm-manager', name: 'CRM Manager', org_id: 'org-default' },
    { id: 'content-strategist', name: 'Content Strategist', org_id: 'org-default' },
    { id: 'research-analyst', name: 'Research Analyst', org_id: 'org-default' },
    { id: 'copywriter', name: 'Lead Copywriter', org_id: 'org-default' },
    { id: 'frontend-developer', name: 'Frontend Developer', org_id: 'org-default' },
    { id: 'backend-architect', name: 'Backend Architect', org_id: 'org-default' },
    { id: 'ui-designer', name: 'UI Designer', org_id: 'org-default' },
    { id: 'sales-outreach', name: 'Sales Outreach', org_id: 'org-default' },
    { id: 'growth-hacker', name: 'Growth Hacker', org_id: 'org-default' },
    { id: 'social-media-strategist', name: 'Social Media Strategist', org_id: 'org-default' },
    { id: 'product-manager', name: 'Product Manager', org_id: 'org-default' },
    { id: 'customer-service', name: 'Customer Service', org_id: 'org-default' },
    { id: 'analytics-reporter', name: 'Analytics Reporter', org_id: 'org-default' },
    { id: 'ceo', name: 'Chief Executive Officer', org_id: 'org-default' }
  ];

  const insertAgent = db.prepare('INSERT OR IGNORE INTO agents (id, name, model, org_id) VALUES (@id, @name, @model, @org_id)');
  
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

  // Pre-populate investors
  const investors = [
    { id: 'inv-1', name: 'Roelof Botha', firm: 'Sequoia Capital', email: 'rbotha@sequoiacap.com', status: 'New', notes: 'Top AI infrastructure investor.' },
    { id: 'inv-2', name: 'Hemant Mohapatra', firm: 'Lightspeed Venture Partners', email: 'hemant@lsvp.com', status: 'New', notes: 'Active in India/US AI enterprise space.' },
    { id: 'inv-3', name: 'Rajan Anandan', firm: 'Peak XV Partners', email: 'ranandan@peakxv.com', status: 'New', notes: 'Early stage AI and digital focus.' },
    { id: 'inv-4', name: 'Tarun Davda', firm: 'Matrix Partners', email: 'tarun@matrixpartners.in', status: 'New', notes: 'Enterprise software and AI.' },
    { id: 'inv-5', name: 'Prashanth Prakash', firm: 'Accel', email: 'prashanth@accel.com', status: 'New', notes: 'Global enterprise and SaaS focus.' }
  ];
  const insertInvestor = db.prepare('INSERT OR IGNORE INTO investors (id, name, firm, email, status, notes, org_id) VALUES (@id, @name, @firm, @email, @status, @notes, @org_id)');
  const insertManyInvestors = db.transaction((investors) => {
    for (const inv of investors) {
      insertInvestor.run({ ...inv, org_id: 'org-default' });
    }
  });
  insertManyInvestors(investors);

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

  // Backfill org_id for new tables if needed
  ['leads', 'orders', 'billing', 'support_tickets', 'domain_experts'].forEach(table => {
    try {
      db.prepare(`UPDATE ${table} SET org_id = 'org-default' WHERE org_id IS NULL`).run();
    } catch(e) {}
  });

  // Seed Data if empty
  const leadsCount = db.prepare("SELECT count(*) as count FROM leads").get().count;
  if (leadsCount === 0) {
    const seedLeads = [
      { id: 'lead-1', name: 'John Doe', email: 'john@techcorp.com', company: 'TechCorp Inc', status: 'Qualified', source: 'Website', value: 15000, org_id: 'org-default' },
      { id: 'lead-2', name: 'Sarah Smith', email: 'sarah@globalai.net', company: 'Global AI', status: 'In Progress', source: 'LinkedIn', value: 32000, org_id: 'org-default' },
      { id: 'lead-3', name: 'Michael Chen', email: 'mchen@innovate.co', company: 'Innovate Co', status: 'New', source: 'Outreach', value: 8500, org_id: 'org-default' }
    ];
    const insertLead = db.prepare('INSERT INTO leads (id, name, email, company, status, source, value, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    seedLeads.forEach(l => insertLead.run(l.id, l.name, l.email, l.company, l.status, l.source, l.value, l.org_id));
  }

  const ordersCount = db.prepare("SELECT count(*) as count FROM orders").get().count;
  if (ordersCount === 0) {
    const seedOrders = [
      { id: 'ord-1', lead_id: 'lead-1', customer_name: 'TechCorp Inc', amount: 15000, status: 'Completed', org_id: 'org-default' },
      { id: 'ord-2', lead_id: 'lead-unknown', customer_name: 'Beta Systems', amount: 4500, status: 'Processing', org_id: 'org-default' }
    ];
    const insertOrder = db.prepare('INSERT INTO orders (id, lead_id, customer_name, amount, status, org_id) VALUES (?, ?, ?, ?, ?, ?)');
    seedOrders.forEach(o => insertOrder.run(o.id, o.lead_id, o.customer_name, o.amount, o.status, o.org_id));
  }

  const billingCount = db.prepare("SELECT count(*) as count FROM billing").get().count;
  if (billingCount === 0) {
    const seedBilling = [
      { id: 'bill-1', description: 'OpenAI API Usage - June', amount: 345.50, status: 'Paid', org_id: 'org-default' },
      { id: 'bill-2', description: 'AWS Hosting', amount: 1250.00, status: 'Pending', org_id: 'org-default' },
      { id: 'bill-3', description: 'Anthropic Claude API', amount: 89.20, status: 'Paid', org_id: 'org-default' }
    ];
    const insertBill = db.prepare('INSERT INTO billing (id, description, amount, status, org_id) VALUES (?, ?, ?, ?, ?)');
    seedBilling.forEach(b => insertBill.run(b.id, b.description, b.amount, b.status, b.org_id));
  }

  const ticketsCount = db.prepare("SELECT count(*) as count FROM support_tickets").get().count;
  if (ticketsCount === 0) {
    const seedTickets = [
      { id: 'ticket-1', subject: 'API Rate Limits Exceeded', customer_email: 'dev@clientapp.com', message: 'We keep hitting a 429 error on the orchestrator endpoints.', ai_response: 'I apologize for the disruption. I have automatically bumped your API tier to Enterprise which includes 10k requests/min. The changes should reflect in 5 minutes.', status: 'resolved', org_id: 'org-default' },
      { id: 'ticket-2', subject: 'Need help setting up Custom Agent', customer_email: 'founder@startup.io', message: 'How do I add a new custom knowledge vault?', ai_response: 'You can add a custom knowledge vault by navigating to the Vault tab and uploading your .txt or .pdf files. Our ingestion engine will automatically vectorize it for your custom agents.', status: 'open', org_id: 'org-default' }
    ];
    const insertTicket = db.prepare('INSERT INTO support_tickets (id, subject, customer_email, message, ai_response, status, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    seedTickets.forEach(t => insertTicket.run(t.id, t.subject, t.customer_email, t.message, t.ai_response, t.status, t.org_id));
  }

  const expertsCount = db.prepare("SELECT count(*) as count FROM domain_experts").get().count;
  if (expertsCount === 0) {
    const seedExperts = [
      { id: 'expert-1', name: 'Dr. Alan Turing', domain: 'Cryptography & Logic', instructions: 'Analyze all security proposals through a strict cryptanalytic lens.', org_id: 'org-default' },
      { id: 'expert-2', name: 'Steve Jobs Persona', domain: 'Product & UX', instructions: 'Ruthlessly simplify product designs. Focus on emotional resonance and pixel-perfect aesthetics.', org_id: 'org-default' }
    ];
    const insertExpert = db.prepare('INSERT INTO domain_experts (id, name, domain, instructions, org_id) VALUES (?, ?, ?, ?, ?)');
    seedExperts.forEach(e => insertExpert.run(e.id, e.name, e.domain, e.instructions, e.org_id));
  }
}

module.exports = {
  db,
  initDb
};
