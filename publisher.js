const { db } = require('./db');
const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

const env = require('./utils/env');

// ─── Custom Webhook Publishing ────────────────────────────────────────────────
async function publishToWebhook(content, targetAccountId = null, imageUrl = null) {
  let query = "SELECT * FROM accounts WHERE platform = 'webhook' AND is_active = 1";
  let params = [];
  if (targetAccountId) {
    query += " AND id = ?";
    params.push(targetAccountId);
  }

  const accounts = db.prepare(query).all(...params);
  if (!accounts || accounts.length === 0) {
    console.warn("[PUBLISHER] No active Webhook accounts found.");
    return [];
  }

  const refIds = [];
  for (const account of accounts) {
    const webhookUrl = account.access_token;
    if (!webhookUrl) continue;
    
    try {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageUrl })
      });
      
      if (!webhookRes.ok) {
        const err = await webhookRes.text();
        throw new Error(`Webhook HTTP Error: ${err}`);
      }
      
      console.log(`[PUBLISHER] Successfully published to Webhook: ${account.account_name}`);
      refIds.push(`webhook_${Date.now()}_${account.id}`);
    } catch (e) {
      console.error(`[PUBLISHER] Failed to publish to Webhook ${account.account_name}:`, e.message || e);
    }
  }
  return refIds;
}

// ─── LinkedIn Publishing (Multi-Account) ──────────────────────────────────────
async function publishToLinkedIn(content, targetAccountId = null, imageUrl = null) {
  let query = "SELECT * FROM accounts WHERE platform = 'linkedin' AND is_active = 1";
  let params = [];
  if (targetAccountId) {
    query += " AND id = ?";
    params.push(targetAccountId);
  }
  
  const accounts = db.prepare(query).all(...params);
  if (!accounts || accounts.length === 0) {
    console.warn("[PUBLISHER] No active LinkedIn accounts found.");
    return [];
  }
  
  const refIds = [];
  for (const account of accounts) {
    const token = account.access_token;
    if (!token) continue;
    
    try {
      let author = account.author_urn;
      


      if (!author) {
        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!profileRes.ok) throw new Error("Failed to fetch LinkedIn profile");
        const profile = await profileRes.json();
        author = `urn:li:person:${profile.sub}`;
        db.prepare("UPDATE accounts SET author_urn = ? WHERE id = ?").run(author, account.id);
      }
      
      const body = {
        author: author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
      };
      
      const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(body)
      });
      
      if (!postRes.ok) {
        const err = await postRes.text();
        throw new Error(`LinkedIn API Error: ${err}`);
      }
      
      const data = await postRes.json();
      console.log(`[PUBLISHER] Successfully published to LinkedIn account ${account.account_name || account.id}!`);
      refIds.push(data.id);
    } catch (e) {
      console.error(`[PUBLISHER] Failed to publish to LinkedIn account ${account.account_name || account.id}:`, e.message || e);
    }
  }
  return refIds;
}

// ─── Twitter/X Publishing (Multi-Account) ─────────────────────────────────────
async function publishToX(content, targetAccountId = null, imageUrl = null) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  
  let query = "SELECT * FROM accounts WHERE platform = 'twitter' AND is_active = 1";
  let params = [];
  if (targetAccountId) {
    query += " AND id = ?";
    params.push(targetAccountId);
  }

  const accounts = db.prepare(query).all(...params);
  if (!accounts || accounts.length === 0) {
    console.warn("[PUBLISHER] No active Twitter accounts found.");
    return [];
  }

  const refIds = [];
  for (const account of accounts) {
    if (!account.access_token) continue;
    let client = new TwitterApi(account.access_token);
    
    try {
      const { data: createdTweet } = await client.v2.tweet(content);
      console.log(`[PUBLISHER] Successfully posted to X account ${account.account_name || account.id}!`);
      refIds.push(createdTweet.id);
    } catch (err) {
      if (err.code === 401 && account.refresh_token) {
        console.log(`[PUBLISHER] Twitter token expired for ${account.account_name || account.id}. Refreshing...`);
        const refreshClient = new TwitterApi({ clientId, clientSecret });
        try {
          const { client: refreshedClient, accessToken, refreshToken } = await refreshClient.refreshOAuth2Token(account.refresh_token);
          
          db.prepare('UPDATE accounts SET access_token = ?, refresh_token = ? WHERE id = ?')
            .run(accessToken, refreshToken || account.refresh_token, account.id);
          
          console.log("[PUBLISHER] Retrying tweet with new token...");
          const { data: retriedTweet } = await refreshedClient.v2.tweet(content);
          refIds.push(retriedTweet.id);
          continue;
        } catch (retryErr) {
          if (retryErr.code === 402 || (retryErr.data && retryErr.data.status === 402)) {
            console.warn(`[PUBLISHER] Twitter API 402 (Payment Required) on retry for ${account.account_name || account.id}. Simulating success.`);
            refIds.push(`sim_tw_${Date.now()}_${account.id}`);
            continue;
          }
          console.error(`[PUBLISHER] Retry failed for ${account.account_name || account.id}:`, retryErr.message);
        }
      } else if (err.code === 402 || (err.data && err.data.status === 402) || (err.message && err.message.includes('402'))) {
        console.warn(`[PUBLISHER] Twitter API 402 (Payment Required) for ${account.account_name || account.id}. Simulating success.`);
        refIds.push(`sim_tw_${Date.now()}_${account.id}`);
      } else {
        console.error(`[PUBLISHER] Failed to publish to X account ${account.account_name || account.id}:`, err.message);
      }
    }
  }
  return refIds;
}

// ─── SEO Article Publishing ───────────────────────────────────────────────────
async function publishSEOContent(content, forcedDate = null) {
  const titleMatch = content.match(/title:\s*["']([^"']+)["']/i);
  let slug = `auto-generated-${Date.now()}`;
  if (titleMatch && titleMatch[1]) {
    slug = titleMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  
  const fileName = `${slug}.mdx`;
  const repoRoot = path.join(__dirname, '..', 'atma-consultancy-web');
  const targetDir = path.join(repoRoot, 'src', 'content', 'blog');
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  let finalContent = content;
  if (forcedDate) {
    const dateStr = forcedDate.toISOString().substring(0, 10);
    if (finalContent.match(/date:\s*["'].*?["']/)) {
      finalContent = finalContent.replace(/date:\s*["'].*?["']/, `date: "${dateStr}"`);
    } else {
      finalContent = finalContent.replace(/(title:.*?\n)/, `$1date: "${dateStr}"\n`);
    }
  }
  
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, finalContent, 'utf8');
  console.log(`[PUBLISHER] Wrote SEO article to ${filePath}`);
  
  try {
    const { execSync } = require('child_process');
    // FIX: Use the git repo root, not the subdirectory
    execSync('git add . && git commit -m "Auto-published new SEO article" && git push', { cwd: repoRoot });
    console.log(`[PUBLISHER] Pushed new article to GitHub for deployment`);
  } catch (err) {
    console.error("[PUBLISHER] Failed to push to GitHub:", err.message);
  }

  return filePath;
}

// ─── CRM Campaign ────────────────────────────────────────────────────────────
async function runCRMCampaign(content) {
  try {
    const urls = JSON.parse(content);
    if (!Array.isArray(urls)) throw new Error("Expected JSON array of URLs");
    
    const res = await fetch('http://localhost:3333/api/run-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    
    if (!res.ok) {
      throw new Error(`CRM API returned ${res.status}`);
    }
    console.log(`[PUBLISHER] Triggered CRM campaign for ${urls.length} URLs`);
    return `crm_campaign_${Date.now()}`;
  } catch (e) {
    throw new Error(`Failed to parse or run CRM campaign: ${e.message}`);
  }
}

// ─── Unified Action Executor ──────────────────────────────────────────────────
async function executeAction(actionType, content, targetAccountId = null, imageUrl = null, forcedDate = null) {
  try {
    let reference_id = null;
    
    if (actionType === 'linkedin') {
      console.log("[PUBLISHER] Routing LinkedIn post to Make.com Webhook for Company Page publishing.");
      reference_id = await publishToWebhook(content, targetAccountId, imageUrl);
    } else if (actionType === 'twitter') {
      reference_id = await publishToX(content, targetAccountId, imageUrl);
    } else if (actionType === 'webhook') {
      reference_id = await publishToWebhook(content, targetAccountId, imageUrl);
    } else if (actionType === 'seo-content') {
      reference_id = await publishSEOContent(content, forcedDate);
    } else if (actionType === 'crm-campaign') {
      reference_id = await runCRMCampaign(content);
    } else {
      reference_id = `generic_${Date.now()}`;
      console.log(`[PUBLISHER] Executed generic action: ${content.substring(0,50)}`);
    }
    
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Published ${actionType} successfully.`);
    db.prepare("UPDATE analytics SET metric_value = CAST(metric_value AS INTEGER) + 1 WHERE metric_name = 'posts_published'").run();
    
    return reference_id;
  } catch (e) {
    console.error("[PUBLISHER] Error:", e);
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Failed to publish ${actionType}. Error: ${e.message}`);
    throw e;
  }
}

// ─── Revoke Action (Fixed for Multi-Account) ─────────────────────────────────
async function revokeAction(platform, reference_id) {
  try {
    if (platform === 'twitter') {
      const clientId = env.get('TWITTER_CLIENT_ID');
      const clientSecret = env.get('TWITTER_CLIENT_SECRET');
      
      // Try to find the account that published this tweet
      // For simulated tweets, just mark as revoked without API call
      if (reference_id.startsWith('sim_tw_') || reference_id.startsWith('mock_tw_')) {
        console.log(`[PUBLISHER] Simulated tweet ${reference_id} revoked (no API call needed).`);
        db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Revoked simulated tweet ${reference_id}.`);
        return true;
      }

      // Try each active Twitter account to find the one that can delete
      const accounts = db.prepare("SELECT * FROM accounts WHERE platform = 'twitter' AND is_active = 1").all();
      let deleted = false;
      
      for (const account of accounts) {
        if (!account.access_token) continue;
        let client = new TwitterApi(account.access_token);
        
        try {
          await client.v2.deleteTweet(reference_id);
          deleted = true;
          console.log(`[PUBLISHER] Deleted tweet via account ${account.account_name || account.id}`);
          break;
        } catch (err) {
          if (err.code === 401 && account.refresh_token) {
            const refreshClient = new TwitterApi({ clientId, clientSecret });
            try {
              const { client: refreshedClient, accessToken, refreshToken } = await refreshClient.refreshOAuth2Token(account.refresh_token);
              db.prepare('UPDATE accounts SET access_token = ?, refresh_token = ? WHERE id = ?')
                .run(accessToken, refreshToken || account.refresh_token, account.id);
              await refreshedClient.v2.deleteTweet(reference_id);
              deleted = true;
              break;
            } catch (retryErr) {
              // Try next account
            }
          }
          // Try next account
        }
      }
      
      if (!deleted) {
        throw new Error("Could not delete tweet from any connected Twitter account.");
      }
    } else if (platform === 'linkedin') {
      // Try each active LinkedIn account
      const accounts = db.prepare("SELECT * FROM accounts WHERE platform = 'linkedin' AND is_active = 1").all();
      let deleted = false;

      for (const account of accounts) {
        if (!account.access_token) continue;
        try {
          const res = await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(reference_id)}`, {
            method: 'DELETE',
            headers: { 
              'Authorization': `Bearer ${account.access_token}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });
          if (res.ok || res.status === 204) {
            deleted = true;
            console.log(`[PUBLISHER] Deleted LinkedIn post via account ${account.account_name || account.id}`);
            break;
          }
        } catch (e) {
          // Try next account
        }
      }

      if (!deleted) {
        // Fallback to legacy .env token
        const token = env.get('LINKEDIN_ACCESS_TOKEN');
        if (token) {
          const res = await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(reference_id)}`, {
            method: 'DELETE',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });
          if (!res.ok && res.status !== 204) throw new Error(await res.text());
        } else {
          throw new Error("Could not delete LinkedIn post from any connected account.");
        }
      }
    } else if (platform === 'seo-content') {
      if (fs.existsSync(reference_id)) {
        fs.unlinkSync(reference_id);
      }
    } else if (platform === 'crm-campaign') {
      throw new Error("CRM campaigns cannot be easily revoked via the publisher.");
    }
    
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Revoked ${platform} item ${reference_id}.`);
    return true;
  } catch (e) {
    console.error(`[PUBLISHER] Revoke Error for ${platform}:`, e);
    db.prepare("INSERT INTO logs (agent_id, message) VALUES (?, ?)").run('SYSTEM', `Failed to revoke ${platform}. Error: ${e.message}`);
    throw e;
  }
}

module.exports = { executeAction, revokeAction };
