/**
 * Content Templates for ATMA AI
 * Enforces MDX constraints, Mermaid diagramming, and formatting requirements.
 */

const SEO_TEMPLATE = `
--- OUTPUT FORMAT REQUIREMENTS ---
You MUST output ONLY a valid MDX string. No markdown code blocks surrounding it, just the raw MDX content.
The MDX MUST start with the following frontmatter EXACTLY as formatted:
---
title: "Your High-Quality SEO Optimized Title"
date: "YYYY-MM-DD"
author: "Naman Sharma"
summary: "A compelling 2-3 sentence summary optimized for AEO/GEO."
tags: ["Tag1", "Tag2", "Tag3", "Tag4"]
---

--- CONTENT GUIDELINES ---
1. Quality over Quantity. Every paragraph must provide extreme value. No fluff. No filler.
2. Structure the blog with H2 (##) and H3 (###) headers.
3. You MUST include at least ONE Mermaid.js diagram to visualize a concept, architecture, or workflow.
   Example of a Mermaid diagram in MDX:
   \`\`\`mermaid
   graph TD;
       A[Enterprise Data] --> B(Vector Database);
       B --> C{Orchestrator Agent};
       C --> D[Action];
   \`\`\`
4. Use Bullet Points and Bold text to highlight key concepts.
5. The tone should be authoritative, highly technical, professional, but deeply engaging.
6. NO AI buzzwords. Never use: Delve, Tapestry, Moreover, Crucial, Demystify.
`;

const SOCIAL_TEMPLATE = `
--- OUTPUT FORMAT REQUIREMENTS ---
You MUST output ONLY the raw text for the social media post. No JSON, no surrounding quotes.

--- CONTENT GUIDELINES ---
1. This post is going to the ATMA AI LinkedIn Company Page. The tone must be professional, authoritative, but highly engaging and concise.
2. Focus on insights, industry shifts, or technical milestones.
3. Use strategic line breaks. Do not write a wall of text.
4. Hook the reader in the first line.
5. Do NOT use more than 3 hashtags at the end.
6. NO AI buzzwords. Never use: Delve, Tapestry, Moreover, Crucial, Demystify.
`;

function injectTemplate(agentId, prompt) {
  if (agentId === 'seo-specialist' || agentId === 'content-strategist') {
    return prompt + '\n' + SEO_TEMPLATE;
  } else if (agentId === 'social-media-strategist') {
    return prompt + '\n' + SOCIAL_TEMPLATE;
  }
  return prompt;
}

module.exports = {
  SEO_TEMPLATE,
  SOCIAL_TEMPLATE,
  injectTemplate
};
