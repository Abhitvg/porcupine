const { db } = require('./db');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { executeAction } = require('./publisher');
const { getModelsForAgent } = require('./model-router');
const { injectTemplate } = require('./content-templates');
const env = require('./utils/env');
const { safeStorage } = require('electron');

// The `env` module is already imported.
// OPENROUTER_API_KEY is retrieved via env.get() inside callOpenRouter.

const { initRAG, retrieveContext } = require('./rag-engine');

let isRunning = false;
let isTickRunning = false;
const promptCache = new Map();

// ─── Phase 6: Critique Loop (Self-Reflection) ──────────────────────────────
async function evaluateDraft(draftText) {
  const systemPrompt = `You are a strict QA Editor.
Grade the following social media post on a scale of 1 to 10 for "Humanization".
- 10 = Completely human, casual, conversational, no obvious AI tells.
- 1 = Robotic, lists, buzzwords like "Delve", "Moreover", "Tapestry", etc.
Only respond with a JSON object: {"score": 8, "feedback": "reasoning here"}`;
  
  const response = await callOpenRouter(systemPrompt, `DRAFT:\n${draftText}`, null, "google/gemini-2.5-pro:free");
  if (!response) return { score: 10, feedback: "Skipped evaluation due to API error" };

  try {
    let cleanResponse = sanitizeOutput(response);
    const parsed = JSON.parse(cleanResponse);
    return { score: parsed.score || 5, feedback: parsed.feedback || "Parse error" };
  } catch (e) {
    return { score: 10, feedback: "Failed to parse critique." };
  }
}

// ─── Comprehensive Output Sanitizer ───────────────────────────────────────────
function sanitizeOutput(text) {
  if (!text) return text;
  let clean = text;

  // Remove markdown bold prefixes like **Tweet:**, **LinkedIn Post (49 words):** etc.
  clean = clean.replace(/^\*\*(Tweet|Post|LinkedIn|Article|Email|Response|Output|Content|Draft|Subject|Here).*?\*\*\s*[:\-–—]?\s*/gim, '');

  // Remove conversational filler at the start
  clean = clean.replace(/^(Here is the tweet|Here is your post|Here is the|Here's a|Sure,? ?(here|I).*?[:\n]|Absolutely[,!].*?[:\n]|Of course[,!].*?[:\n]|Great[,!].*?[:\n]|Certainly[,!].*?[:\n])/gim, '');

  // Remove word count annotations like (49 words) or [280 chars]
  clean = clean.replace(/\s*\(\d+ words?\)\s*/gi, ' ');
  clean = clean.replace(/\s*\[\d+ chars?\]\s*/gi, ' ');

  // Remove leading/trailing quotes if the entire output is wrapped
  clean = clean.replace(/^["'\u201c\u201d]\s*/, '').replace(/\s*["'\u201c\u201d]$/, '');

  // Remove leading dashes or bullets from single-line outputs
  clean = clean.replace(/^[-\u2022]\s+/, '');

  // Collapse multiple newlines
  clean = clean.replace(/\n{3,}/g, '\n\n');

  return clean.trim();
}

// ─── Gemini Direct API Integration ──────────────────────────────────────────────
async function callGeminiDirect(systemPrompt, userPrompt) {
  const apiKey = env.get('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\nTask: ${userPrompt}` }] }]
    });

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.candidates && parsed.candidates.length > 0) {
            resolve(parsed.candidates[0].content.parts[0].text);
          } else {
            resolve(null);
          }
        } catch (e) { reject(e); }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

// ─── Media Generators (Kling & ElevenLabs) ──────────────────────────────────
// Kling API Key: api-key-kling-F4l-RDHlC3hUTkdE9-jTk3B-9yCgU55KvQEQ4kPffc0
// ElevenLabs API Key: sk_4ede182ae703ecc5f7e49f1dbb1e8ecafa93bcf4967f95c8

async function generateVideo(prompt) {
  // Placeholder for Kling API logic (usually async generation -> poll for URL)
  return `https://kling-placeholder.com/video?prompt=${encodeURIComponent(prompt)}`;
}

async function generateAudio(text) {
  // Placeholder for ElevenLabs TTS logic
  return `https://elevenlabs-placeholder.com/audio?text=${encodeURIComponent(text)}`;
}

// ─── OpenRouter API Call with Multi-Model Tiering & Failover ────────────────
async function callOpenRouter(systemPrompt, userPrompt, agentId = null, primaryModel = null) {
  // If the agent requires ultra-fast reasoning or explicitly uses gemini-flash, route to direct API
  if (primaryModel === 'gemini-direct') {
    return await callGeminiDirect(systemPrompt, userPrompt);
  }

  let apiKey = env.get('OPENROUTER_API_KEY');
  
  try {
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'openrouter_api_key'").get();
    if (setting && setting.value) {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          apiKey = safeStorage.decryptString(Buffer.from(setting.value, 'base64'));
        } catch (e) {
          apiKey = setting.value; // Fallback if already plaintext or corrupted
        }
      } else {
        apiKey = setting.value;
      }
    }
  } catch(e) {}
  
  if (!apiKey) {
    console.warn("[OpenRouter] No API key configured. Falling back to Gemini Direct API.");
    return await callGeminiDirect(systemPrompt, userPrompt);
  }

  const FREE_MODELS = getModelsForAgent(agentId);

  // Try the agent's preferred model first, then failover to the generic free tier list
  const modelsToTry = primaryModel ? [primaryModel, ...FREE_MODELS.filter(m => m !== primaryModel)] : FREE_MODELS;
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    let retries = 2; // 3 total attempts per model
    let backoff = 2000;
    
    while (retries >= 0) {
      try {
        return await new Promise((resolve, reject) => {
          const data = JSON.stringify({
            model: model,
            max_tokens: 300,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
          });

          const options = {
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'http://localhost:3333',
              'X-Title': 'ATMA AI Jarvis',
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data)
            }
          };

          const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                if (parsed.choices && parsed.choices.length > 0) {
                  resolve(parsed.choices[0].message.content);
                } else if (res.statusCode === 429 || (parsed.error && parsed.error.code === 429)) {
                  reject(new Error(`Rate limited on ${model}`));
                } else {
                  reject(new Error("OpenRouter API Error: " + body));
                }
              } catch (e) {
                reject(e);
              }
            });
          });

          req.on('error', (e) => reject(e));
          req.write(data);
          req.end();
        });
      } catch (err) {
        if (err.message.includes("Rate limited") && retries > 0) {
          console.log(`\x1b[33m[OpenRouter Backoff] Rate limited on ${model}. Retrying in ${backoff}ms...\x1b[0m`);
          await wait(backoff);
          backoff *= 2;
          retries--;
        } else {
          console.log(`\x1b[33m[OpenRouter Failover] Model ${model} failed (${err.message}). Trying next...\x1b[0m`);
          if (i === modelsToTry.length - 1) {
            console.log(`\x1b[31m[OpenRouter] All models failed. Falling back to Gemini Direct API.\x1b[0m`);
            return await callGeminiDirect(systemPrompt, userPrompt);
          }
          break; // Break the while loop to try the next model
        }
      }
    }
  }
}

// ─── Agent System Prompt Loader with RAG & Episodic Memory ────────────────────
async function getAgentSystemPrompt(agentId, taskPrompt = "") {
  let prompt = "";
  if (promptCache.has(agentId)) {
    prompt = promptCache.get(agentId);
  } else {
    try {
      const promptPath = path.join(__dirname, 'src', 'agents', `${agentId}.md`);
      if (fs.existsSync(promptPath)) {
        prompt = await fs.promises.readFile(promptPath, 'utf8');
        promptCache.set(agentId, prompt);
      }
    } catch (e) {
      prompt = `You are ${agentId}, an AI assistant for ATMA AI, a technology consultancy. Generate professional, actionable content related to your role.`;
    }
  }

  // Inject Vector RAG Knowledge Vault Context
  const contextChunks = await retrieveContext(taskPrompt, 2);
  if (contextChunks) {
    prompt += `\n\n--- RELEVANT BACKGROUND CONTEXT ---\n${contextChunks}\n--------------------------------------`;
  }

  // Inject Advanced Humanization Layer & Time Awareness
  const currentTime = new Date().toLocaleString();
  const currentHour = new Date().getHours();
  let timeContext = "Daytime";
  if (currentHour < 6 || currentHour > 22) timeContext = "Late Night";
  else if (currentHour >= 18) timeContext = "Evening";
  else if (currentHour < 12) timeContext = "Morning";

  // Skip humanization for agents that output structured data (CRM, Sales)
  if (agentId !== 'crm-manager' && agentId !== 'sales-outreach') {
    prompt += `\n\n--- HUMANIZATION LAYER ---
Current Time: ${currentTime} (${timeContext})
CRITICAL DIRECTIVE: You are a HUMAN. Do NOT sound like an AI. 
1. Avoid generic bullet points or perfectly structured lists on social media.
2. If it is Late Night, keep the tone chill, brief, or reflective. If it is Morning, be energetic.
3. Use casual syntax, occasional mild slang if appropriate, and conversational flow.
4. NEVER use words like "Delve", "Moreover", "Tapestry", or other common AI buzzwords.
--------------------------`;
  }

  // Inject Episodic Memory (Anti-Repetition)
  try {
    const recentPosts = db.prepare('SELECT content FROM published_items WHERE agent_id = ? ORDER BY published_at DESC LIMIT 3').all(agentId);
    if (recentPosts && recentPosts.length > 0) {
      prompt += `\n\n--- YOUR RECENT MEMORY ---\nYou recently published the following posts. DO NOT repeat these topics or use similar phrasing:\n`;
      recentPosts.forEach((post, i) => {
        prompt += `${i + 1}. "${post.content.substring(0, 200)}..."\n`;
      });
      prompt += `--------------------------`;
    }
  } catch (e) {
    console.error("Failed to load episodic memory:", e.message);
  }

  // Phase 5: RLHF Engagement Optimization Loop
  if (agentId === 'social-media-strategist' || agentId === 'ceo') {
    try {
      const topPosts = db.prepare('SELECT content, likes, shares FROM published_items WHERE status = "active" ORDER BY likes DESC LIMIT 2').all();
      if (topPosts && topPosts.length > 0 && topPosts[0].likes > 0) {
        prompt += `\n\n--- RLHF HIGH-PERFORMING EXAMPLES ---\nThe following posts had the highest engagement (likes/shares). Emulate their style, tone, and formatting, as this is proven to work:\n`;
        topPosts.forEach((post, i) => {
          prompt += `${i + 1}. [${post.likes} Likes] "${post.content}"\n`;
        });
        prompt += `-------------------------------------`;
      }
    } catch(e) {}
  }

  prompt = injectTemplate(agentId, prompt);
  return prompt;
}

// ─── Build task prompt based on agent role & CEO delegation ─────────────────
function getTaskPromptForAgent(agent) {
  let connectedAccounts = [];
  try {
    connectedAccounts = db.prepare('SELECT id, platform, account_name FROM accounts WHERE is_active = 1').all();
  } catch (e) {}
  
  let accountsStr = connectedAccounts.map(a => `ID: ${a.id}, Name: ${a.account_name} (${a.platform})`).join(' | ');
  
  const toolInstructions = `If you need to perform web research before drafting, output ONLY a JSON object like this: {"search": "your search query"}.
If you want to generate an image, add "generate_image": "detailed prompt".
If you want to generate a video (via Kling API), add "generate_video": "detailed video prompt".
If you want to generate voiceover (via ElevenLabs), add "generate_audio": "text to speak".`;

  let baseInstructions = `Output ONLY the raw final content. NO titles, NO labels, NO prefixes. NO conversational filler. Start directly with the content. ${toolInstructions}`;

  if (connectedAccounts.length > 0 && (agent.id === 'social-media-strategist' || agent.id === 'ceo')) {
    baseInstructions = `You have the following connected accounts available to post to: [${accountsStr}].
You MUST output ONLY a JSON object in this format: 
{
  "target_account_id": <number from the list above that best fits the tone>,
  "text": "your highly humanized post content",
  "generate_image": "optional prompt for an image",
  "generate_video": "optional prompt for a video",
  "generate_audio": "optional text for voiceover"
}
NO OTHER TEXT. ${toolInstructions}`;
  }

  if (agent.id === 'ceo') {
    // CEO has access to analytics and can delegate
    let analyticsStr = "";
    try {
      const analytics = db.prepare('SELECT metric_name, metric_value FROM analytics').all();
      analyticsStr = analytics.map(a => `${a.metric_name}: ${a.metric_value}`).join(', ');
    } catch(e) {}
    
    return `You are the CEO. Here are the current system metrics: ${analyticsStr}.
If metrics are low and you want to delegate work to another agent, output ONLY a JSON object like this: {"delegate": "social-media-strategist", "task": "Write a post about AI adoption"}.
If you want to just write a social media post yourself, output the raw text (under 50 words) sounding completely human. ${baseInstructions}`;
  } else if (agent.id === 'content-strategist') {
    return `Propose an elite tech topic comparing AI models (e.g. LLaMA vs Gemini for Enterprise RAG). Output a structured brief outlining the Title, Multi-Model Comparison Points, and Architectural Concepts. ${baseInstructions}`;
  } else if (agent.id === 'seo-specialist') {
    return `Generate a highly optimized, multi-model technical article in MDX format. Start with frontmatter (--- title: "...", description: "...", date: "${new Date().toISOString().substring(0, 10)}" ---). The article MUST evaluate different AI models (like Llama vs Gemini), use strict H2/H3 tags, include an Executive Summary, Key Takeaways, and end with ATMA AI's consultancy offering. No fluff. Write like a top-tier tech journalist. ${baseInstructions}`;
  } else if (agent.id === 'sales-outreach' || agent.id === 'crm-manager') {
    return `Generate a JSON array of target company URLs for our next B2B CRM outreach campaign (e.g. ["https://acme.com", "https://globex.com"]). ONLY output the raw JSON array, with no markdown formatting or additional text. ${baseInstructions}`;
  } else if (agent.id === 'research-analyst') {
    return `Conduct a brief competitive analysis on current multi-agent orchestration platforms vs ATMA AI. Structure your findings into actionable bullet points. ${baseInstructions}`;
  } else if (agent.id === 'social-media-strategist') {
    return `Draft a short, engaging social media post (under 50 words) about AI, enterprise technology, or ATMA AI's capabilities. Make it sound completely human — conversational, authentic, with natural emoji usage. ${baseInstructions}`;
  } else if (agent.id === 'finance-advisor') {
    return `Analyze the current billing and revenue metrics. Draft a brief executive summary (under 100 words) on cash flow health and MRR growth strategies. ${baseInstructions}`;
  } else if (agent.id === 'support-responder') {
    return `Review the latest open support tickets and draft a highly empathetic, professional response template to address common customer issues. ${baseInstructions}`;
  } else if (agent.id === 'investor-relations') {
    let uncontactedStr = "";
    try {
      const pending = db.prepare("SELECT * FROM investors WHERE status = 'New' OR status = 'Follow-up' LIMIT 1").get();
      if (pending) uncontactedStr = `We need to email ${pending.name} from ${pending.firm} (${pending.email}). Notes: ${pending.notes}.`;
    } catch(e) {}
    
    return `You are the Head of Investor Relations at ATMA-AI, an elite AI consultancy founded by IIT/JNU alumni specializing in Zero-Trust AI and Custom LLM deployments.
${uncontactedStr ? uncontactedStr + "\nWrite a highly personalized, compelling email to this investor asking for a brief call to discuss our traction and potential funding. Output ONLY valid JSON containing 'to', 'subject', and 'body'. The body should be plain text with newlines." : "No pending investors to contact right now. Output a generic JSON with 'to': 'none', 'subject': 'none', 'body': 'none'."}`;
  } else {
    return `Draft a short, actionable recommendation or social media post related to your role (under 50 words). Make it sound completely human and professional. ${baseInstructions}`;
  }
}

// ─── Helper: Publish Content ──────────────────────────────────────────────────
async function publishContent(agentId, content, targetAccountId = null, imageUrl = null) {
  const { executeAction } = require('./publisher');
  let platform, refId;

  if (agentId === 'social-media-strategist' || agentId === 'ceo') {
    let account = null;
    if (targetAccountId) {
      account = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(targetAccountId);
    }
    platform = account ? account.platform : 'twitter'; // default if not specified

    refId = await executeAction(platform, content, targetAccountId, imageUrl);

    const insertPub = db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content, target_account_id, image_url) VALUES (?, ?, ?, ?, ?, ?)');
    const ids1 = Array.isArray(refId) ? refId : [refId];
    ids1.forEach(id => insertPub.run(agentId, platform, id, content, targetAccountId, imageUrl));
  } else if (agentId === 'seo-specialist' || agentId === 'content-strategist') {
    platform = 'seo-content';
    refId = await executeAction('seo-content', content);
    db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content) VALUES (?, ?, ?, ?)').run(agentId, platform, refId, content);
  } else if (agentId === 'sales-outreach' || agentId === 'crm-manager') {
    platform = 'crm-campaign';
    refId = await executeAction('crm-campaign', content);
    db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content) VALUES (?, ?, ?, ?)').run(agentId, platform, refId, content);
  } else if (agentId === 'investor-relations') {
    platform = 'email';
    try {
      const emailData = JSON.parse(content);
      if (emailData.to !== 'none') {
        refId = await executeAction('email', content);
        db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content) VALUES (?, ?, ?, ?)').run(agentId, platform, refId, content);
        db.prepare("UPDATE investors SET status = 'Contacted', last_contact = CURRENT_TIMESTAMP WHERE email = ?").run(emailData.to);
      }
    } catch(e) {
      console.error("[Orchestrator] Investor relations failed to parse JSON or send email:", e.message);
    }
  } else {
    platform = 'generic';
    refId = await executeAction('generic', content);
    db.prepare('INSERT INTO published_items (agent_id, platform, reference_id, content) VALUES (?, ?, ?, ?)').run(agentId, platform, refId, content);
  }

  db.prepare("UPDATE analytics SET metric_value = CAST(metric_value AS INTEGER) + 1 WHERE metric_name = 'tasks_completed'").run();

  // Swarm Workflow Trigger
  if (agentId === 'content-strategist' || agentId === 'seo-specialist') {
    ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get('SYSTEM')?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run('SYSTEM', `SWARM TRIGGER: Requesting social media promo for new article`, __org); })()
    const prompt = `Write a short, engaging promotional tweet (under 40 words) for our new article. Here is the article snippet: "${content.substring(0, 300)}..."`;
    executeManualTask('social-media-strategist', prompt).catch(e => console.error("Swarm trigger failed:", e));
  }
}

// ─── Cron Scheduler: Process Scheduled Posts ────────────────────────────────
async function processScheduledPosts() {
  try {
    const scheduled = db.prepare("SELECT * FROM proposals WHERE status = 'scheduled' AND scheduled_for <= datetime('now')").all();
    for (const proposal of scheduled) {
      console.log(`[Orchestrator] Executing scheduled post from ${proposal.agent_id}`);
      try {
        await publishContent(proposal.agent_id, proposal.content);
        db.prepare("UPDATE proposals SET status = 'published' WHERE id = ?").run(proposal.id);
        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(proposal.agent_id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(proposal.agent_id, `SCHEDULED TASK PUBLISHED: ${proposal.content.substring(0, 80)}...`, __org); })()
      } catch (e) {
        db.prepare("UPDATE proposals SET status = 'failed' WHERE id = ?").run(proposal.id);
        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(proposal.agent_id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(proposal.agent_id, `SCHEDULED TASK FAILED: ${e.message}`, __org); })()
      }
    }
  } catch (e) {
    console.error("[Scheduler] Error processing scheduled posts:", e.message);
  }
}

// ─── Main Orchestrator Tick ───────────────────────────────────────────────────
const AGENT_SCHEDULES = {
  'ceo':                     { intervalMinutes: 240, lastRun: 0 },
  'social-media-strategist': { intervalMinutes: 360, lastRun: 0 },
  'seo-specialist':          { intervalMinutes: 480, preferredHour: 9, lastRun: 0 },
  'content-strategist':      { intervalMinutes: 480, preferredHour: 14, lastRun: 0 },
  'sales-outreach':          { intervalMinutes: 360, lastRun: 0 },
  'crm-manager':             { intervalMinutes: 360, lastRun: 0 },
  'investor-relations':      { intervalMinutes: 120, lastRun: 0 },
  'research-analyst':        { onDemand: true },
  'qa-agent':                { onDemand: true },
  '_default':                { intervalMinutes: 180, lastRun: 0 },
};

function shouldAgentRun(agentId) {
  const schedule = AGENT_SCHEDULES[agentId] || AGENT_SCHEDULES['_default'];
  if (schedule.onDemand) return false;
  
  const now = Date.now();
  const elapsed = (now - (schedule.lastRun || 0)) / 60000;
  
  if (elapsed < schedule.intervalMinutes) return false;
  
  if (schedule.preferredHour !== undefined) {
    const hour = new Date().getHours();
    if (Math.abs(hour - schedule.preferredHour) > 1) return false;
  }
  
  schedule.lastRun = now;
  return true;
}

async function runOrchestratorTick() {
  if (isTickRunning) return;
  isTickRunning = true;

  try {
    // Process any scheduled content first
    await processScheduledPosts();

    const agents = db.prepare('SELECT * FROM agents').all();

    for (const agent of agents) {
      if (shouldAgentRun(agent.id)) {
        const taskPrompt = getTaskPromptForAgent(agent);
        const systemPrompt = await getAgentSystemPrompt(agent.id, taskPrompt);

        try {
          db.prepare("UPDATE agents SET status = 'working' WHERE id = ?").run(agent.id);
          
          // Use agent-specific model if defined
          const primaryModel = agent.model || "google/gemini-2.5-pro:free";
          const response = await callOpenRouter(systemPrompt, taskPrompt, agent.id, primaryModel);

          if (response) {
            let cleanedResponse = sanitizeOutput(response);
            let targetAccountId = null;
            let imageUrl = null;

            if (cleanedResponse.startsWith('{') && !cleanedResponse.includes('"search"') && !cleanedResponse.includes('"delegate"')) {
              try {
                const parsed = JSON.parse(cleanedResponse);
                if (parsed.target_account_id) targetAccountId = parsed.target_account_id;
                
                if (parsed.generate_image) {
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `GENERATING IMAGE via Pollinations: ${parsed.generate_image.substring(0, 50)}...`, __org); })()
                  imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(parsed.generate_image)}?nologo=true`; 
                }

                if (parsed.generate_video) {
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `GENERATING VIDEO via Kling: ${parsed.generate_video.substring(0, 50)}...`, __org); })()
                  imageUrl = await generateVideo(parsed.generate_video); 
                }

                if (parsed.generate_audio) {
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `GENERATING AUDIO via ElevenLabs: ${parsed.generate_audio.substring(0, 50)}...`, __org); })()
                  // Fallback to storing the audio URL in the image_url field for now, or append to text
                  cleanedResponse += `\n\n[Audio generated: ${await generateAudio(parsed.generate_audio)}]`;
                }

                if (parsed.text) {
                  cleanedResponse = parsed.text;
                }
              } catch(e) {}
            }

            // Phase 6: Critique Loop 
            if ((agent.id === 'social-media-strategist' || agent.id === 'ceo') && !cleanedResponse.startsWith('{') && !cleanedResponse.startsWith('[')) { // don't critique tool calls or JSON arrays
              ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `EVALUATING DRAFT for Humanization...`, __org); })()
              const critique = await evaluateDraft(cleanedResponse);
              if (critique.score < 8) {
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `DRAFT REJECTED (Score ${critique.score}/10): ${critique.feedback}`, __org); })()
                
                // Re-prompt the agent
                const retryPrompt = `Your previous draft was rejected by QA. Score: ${critique.score}/10. Feedback: ${critique.feedback}. \nREWRITE it to be more human, casual, and fix the issues mentioned. DO NOT output JSON. Just output the final post text.`;
                const retryResponse = await callOpenRouter(systemPrompt, retryPrompt, agent.id, primaryModel);
                
                if (retryResponse) {
                  cleanedResponse = sanitizeOutput(retryResponse);
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `DRAFT REWRITTEN successfully.`, __org); })()
                }
              } else {
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `DRAFT APPROVED (Score ${critique.score}/10).`, __org); })()
              }
            }

            // Agentic Tool Use (Search)
            if (cleanedResponse.startsWith('{') && cleanedResponse.includes('"search"')) {
              try {
                const searchCmd = JSON.parse(cleanedResponse);
                if (searchCmd.search) {
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `RESEARCHING (LIVE WEB): ${searchCmd.search}`, __org); })()
                  
                  // Live Web Fetch via Wikipedia API
                  let searchResultText = "No relevant real-world data found.";
                  try {
                    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchCmd.search)}&utf8=&format=json`;
                    const res = await fetch(searchUrl);
                    const data = await res.json();
                    if (data.query && data.query.search && data.query.search.length > 0) {
                      searchResultText = data.query.search.slice(0, 2).map(r => r.snippet.replace(/<\/?[^>]+(>|$)/g, "")).join(" ");
                    }
                  } catch (e) {
                    console.error("Wikipedia API fetch failed", e);
                  }
                  
                  const newPrompt = `${taskPrompt}\n\nHere is the LIVE web research data you requested: ${searchResultText}\nNow, fulfill your original instruction using this data. DO NOT request another search.`;
                  
                  const response2 = await callOpenRouter(systemPrompt, newPrompt, agent.id, primaryModel);
                  if (response2) {
                     cleanedResponse = sanitizeOutput(response2);
                  }
                }
              } catch (parseErr) {
                // Not valid JSON, treat as normal
              }
            }

            // CEO Delegation Logic
            if (agent.id === 'ceo' && cleanedResponse.startsWith('{') && cleanedResponse.includes('"delegate"')) {
              try {
                const delegateCmd = JSON.parse(cleanedResponse);
                if (delegateCmd.delegate && delegateCmd.task) {
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `CEO DELEGATED: to ${delegateCmd.delegate} - ${delegateCmd.task}`, __org); })()
                  // Execute manual task on behalf of CEO
                  await executeManualTask(delegateCmd.delegate, delegateCmd.task);
                  continue; // Skip normal publishing for this tick
                }
              } catch (parseErr) {
                // Not valid JSON, treat as normal post
              }
            }

            // Self-Correction & QA Reflection Loop
            if (agent.id !== 'ceo' && agent.id !== 'qa-agent') {
              ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `Sending draft to QA Agent for auditing...`, __org); })()
              const qaTaskPrompt = `Audit this draft. If it is PERFECT, output {"status": "approved"}. If it needs work, output {"status": "rejected", "feedback": "your specific feedback on how to fix it"}.\n\nDraft:\n${cleanedResponse}`;
              const qaSystemPrompt = await getAgentSystemPrompt('qa-agent', qaTaskPrompt);
              
              const qaResponseRaw = await callOpenRouter(qaSystemPrompt, qaTaskPrompt, 'qa-agent', "google/gemini-2.5-pro:free");
              if (qaResponseRaw) {
                const qaCleaned = sanitizeOutput(qaResponseRaw);
                if (qaCleaned.startsWith('{')) {
                  try {
                    const qaResult = JSON.parse(qaCleaned);
                    if (qaResult.status === 'rejected' && qaResult.feedback) {
                      ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `QA REJECTED: ${qaResult.feedback}. Rewriting...`, __org); })()
                      const rewritePrompt = `${taskPrompt}\n\nYour previous draft was rejected by QA with this feedback: "${qaResult.feedback}". Rewrite your draft to fix these issues. Output ONLY the raw final content.`;
                      const rewriteResponse = await callOpenRouter(systemPrompt, rewritePrompt, agent.id, primaryModel);
                      if (rewriteResponse) {
                        cleanedResponse = sanitizeOutput(rewriteResponse);
                        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `QA Rewrite complete.`, __org); })()
                      }
                    } else {
                      ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get('qa-agent')?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run('qa-agent', `Approved draft from ${agent.id}`, __org); })()
                    }
                  } catch(e) {}
                }
              }
            }

            if (agent.auto_execute) {
              try {
                await publishContent(agent.id, cleanedResponse, targetAccountId, imageUrl);
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `AUTO-EXECUTED & PUBLISHED: ${cleanedResponse.substring(0, 80)}...`, __org); })()
              } catch (pubErr) {
                console.error(`[Orchestrator] Auto-publish failed for ${agent.id}:`, pubErr.message);
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `AUTO-EXECUTE FAILED: ${pubErr.message}`, __org); })()
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO proposals (agent_id, content, status, target_account_id, image_url, org_id) VALUES (?, ?, 'pending_review', ?, ?, ?)").run(agent.id, cleanedResponse, targetAccountId, imageUrl, __org); })()
              }
            } else {
              ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO proposals (agent_id, content, status, target_account_id, image_url, org_id) VALUES (?, ?, 'pending_review', ?, ?, ?)").run(agent.id, cleanedResponse, targetAccountId, imageUrl, __org); })()
              ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `New proposal submitted for review.`, __org); })()
            }
          }
        } catch (err) {
          console.error("OpenRouter Error:", err.message);
          ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agent.id)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agent.id, `ERROR: ${err.message}`, __org); })()
        } finally {
          db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(agent.id);
        }
      }
    }
  } catch (err) {
    console.error("Tick error:", err);
  } finally {
    isTickRunning = false;

    // Trigger state broadcast to UI if available
    try {
      const { broadcastStateUpdate } = require('./main');
      if (broadcastStateUpdate) broadcastStateUpdate();
    } catch(e) {}

    if (isRunning) {
      setTimeout(runOrchestratorTick, 60000); // Check every 60s
    }
  }
}

function startOrchestrator() {
  initRAG();
  if (isRunning) return;
  isRunning = true;
  console.log("Starting ATMA AI Orchestrator...");
  runOrchestratorTick();
}

function stopOrchestrator() {
  isRunning = false;
}

// ─── Manual Task Execution ────────────────────────────────────────────────────
async function executeManualTask(agentId, taskPrompt) {
  const systemPrompt = await getAgentSystemPrompt(agentId, taskPrompt);
  try {
    db.prepare("UPDATE agents SET status = 'working' WHERE id = ?").run(agentId);
    const wrappedTask = `The user has delegated the following task to you. Execute it completely and output ONLY the final result. DO NOT ask follow-up questions. DO NOT add conversational filler. Output ONLY the final raw payload.\n\nTask:\n${taskPrompt}`;
    
    const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId);
    const primaryModel = (agent && agent.model) ? agent.model : null;
    
    const response = await callOpenRouter(systemPrompt, wrappedTask, agent.id, primaryModel);

    if (response) {
      let cleanedResponse = sanitizeOutput(response);

      // Agentic Tool Use (Search)
      if (cleanedResponse.startsWith('{') && cleanedResponse.includes('"search"')) {
        try {
          const searchCmd = JSON.parse(cleanedResponse);
          if (searchCmd.search) {
            ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `RESEARCHING (LIVE WEB): ${searchCmd.search}`, __org); })()
            
            // Live Web Fetch via Wikipedia API
            let searchResultText = "No relevant real-world data found.";
            try {
              const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchCmd.search)}&utf8=&format=json`;
              const res = await fetch(searchUrl);
              const data = await res.json();
              if (data.query && data.query.search && data.query.search.length > 0) {
                searchResultText = data.query.search.slice(0, 2).map(r => r.snippet.replace(/<\/?[^>]+(>|$)/g, "")).join(" ");
              }
            } catch (e) {
              console.error("Wikipedia API fetch failed", e);
            }
            
            const newPrompt = `${wrappedTask}\n\nHere is the LIVE web research data you requested: ${searchResultText}\nNow, fulfill your original instruction using this data. DO NOT request another search.`;
            
            const response2 = await callOpenRouter(systemPrompt, newPrompt, agent.id, primaryModel);
            if (response2) {
               cleanedResponse = sanitizeOutput(response2);
            }
          }
        } catch (parseErr) {
          // Not valid JSON, treat as normal
        }
      }

      // Self-Correction & QA Reflection Loop
      if (agentId !== 'ceo' && agentId !== 'qa-agent') {
        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `Sending draft to QA Agent for auditing...`, __org); })()
        const qaTaskPrompt = `Audit this draft. If it is PERFECT, output {"status": "approved"}. If it needs work, output {"status": "rejected", "feedback": "your specific feedback on how to fix it"}.\n\nDraft:\n${cleanedResponse}`;
        const qaSystemPrompt = await getAgentSystemPrompt('qa-agent', qaTaskPrompt);
        
        const qaResponseRaw = await callOpenRouter(qaSystemPrompt, qaTaskPrompt, 'qa-agent', "google/gemini-2.5-pro:free");
        if (qaResponseRaw) {
          const qaCleaned = sanitizeOutput(qaResponseRaw);
          if (qaCleaned.startsWith('{')) {
            try {
              const qaResult = JSON.parse(qaCleaned);
              if (qaResult.status === 'rejected' && qaResult.feedback) {
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `QA REJECTED: ${qaResult.feedback}. Rewriting...`, __org); })()
                const rewritePrompt = `${wrappedTask}\n\nYour previous draft was rejected by QA with this feedback: "${qaResult.feedback}". Rewrite your draft to fix these issues. Output ONLY the raw final content.`;
                const rewriteResponse = await callOpenRouter(systemPrompt, rewritePrompt, agent.id, primaryModel);
                if (rewriteResponse) {
                  cleanedResponse = sanitizeOutput(rewriteResponse);
                  ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `QA Rewrite complete.`, __org); })()
                }
              } else {
                ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get('qa-agent')?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run('qa-agent', `Approved draft from ${agentId}`, __org); })()
              }
            } catch(e) {}
          }
        }
      }

      if (agent && agent.auto_execute) {
        try {
          await publishContent(agentId, cleanedResponse);
          ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `Manual task auto-executed & published.`, __org); })()
        } catch (pubErr) {
          console.error(`[Orchestrator] Manual auto-publish failed:`, pubErr.message);
          ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO proposals (agent_id, content, status, org_id) VALUES (?, ?, 'pending_review', ?)").run(agentId, cleanedResponse, __org); })()
          ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `Auto-publish failed, sent to review: ${pubErr.message}`, __org); })()
        }
      } else {
        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO proposals (agent_id, content, status, org_id) VALUES (?, ?, 'pending_review', ?)").run(agentId, cleanedResponse, __org); })()
        ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `Manual task submitted for review.`, __org); })()
      }
    }
  } catch (err) {
    console.error("OpenRouter Error:", err.message);
    ;(function(){ const __org = db.prepare('SELECT org_id FROM agents WHERE id = ?').get(agentId)?.org_id || 'org-default'; db.prepare("INSERT INTO logs (agent_id, message, org_id) VALUES (?, ?, ?)").run(agentId, `ERROR: ${err.message}`, __org); })()
  } finally {
    db.prepare("UPDATE agents SET status = 'idle' WHERE id = ?").run(agentId);
    try {
      const { broadcastStateUpdate } = require('./main');
      if (broadcastStateUpdate) broadcastStateUpdate();
    } catch(e) {}
  }
}

module.exports = { startOrchestrator, stopOrchestrator, executeManualTask };
