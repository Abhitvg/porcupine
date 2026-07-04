/**
 * ATMA AI v2 Multi-Model Router
 * Routes tasks to the best free-tier open-source models available on OpenRouter.
 */

const TASK_MODELS = {
  'seo-content': [
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'google/gemma-2-27b-it:free'
  ],
  'social-media': [
    'google/gemma-2-27b-it:free',
    'qwen/qwen2.5-72b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free'
  ],
  'qa-critique': [
    'google/gemini-2.5-pro:free',
    'qwen/qwen2.5-72b-instruct:free',
    'google/gemma-2-27b-it:free'
  ],
  'structured-data': [
    'qwen/qwen2.5-72b-instruct:free',
    'google/gemma-2-27b-it:free'
  ],
  'strategy': [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-2-27b-it:free'
  ],
  '_default': [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-2-27b-it:free',
    'qwen/qwen3-next-80b-a3b-instruct:free'
  ]
};

function getModelsForAgent(agentId) {
  if (agentId === 'seo-specialist' || agentId === 'content-strategist') {
    return TASK_MODELS['seo-content'];
  } else if (agentId === 'social-media-strategist') {
    return TASK_MODELS['social-media'];
  } else if (agentId === 'qa-agent') {
    return TASK_MODELS['qa-critique'];
  } else if (agentId === 'ceo') {
    return TASK_MODELS['strategy'];
  } else if (agentId === 'crm-manager' || agentId === 'sales-outreach') {
    return TASK_MODELS['structured-data'];
  }
  
  return TASK_MODELS['_default'];
}

module.exports = {
  getModelsForAgent
};
