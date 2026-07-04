const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    // Whitelist channels for security
    const validChannels = [
      'get-agents', 
      'toggle-auto-execute', 
      'get-proposals', 
      'update-proposal-status',
      'get-analytics',
      'get-logs',
      'get-published-items',
      'revoke-action',
      'submit-manual-task',
      'get-accounts',
      'add-account',
      'toggle-account',
      'delete-account',
      'get-todos',
      'add-todo',
      'toggle-todo',
      'delete-todo',
      'update-agent-model',
      'get-vault-context',
      'save-vault-context',
      'create-agent',
      'start-linkedin-oauth',
      'get-settings',
      'save-settings',
      'test-webhook'
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
  }
});
