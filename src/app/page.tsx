'use client';

import { useState, useEffect } from 'react';
import { Activity, Terminal, CheckCircle, Database, Shield, Zap, Settings, Command, History, RotateCcw, CheckSquare, Users, Trash2, AlertTriangle, BookOpen, BarChart2, Heart, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Use window.electron from preload.js for secure IPC
const ipcRenderer = typeof window !== 'undefined' && (window as any).electron ? (window as any).electron : {
  invoke: async () => [],
};

export default function JarvisDashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({
    tasks_completed: 0,
    posts_published: 0
  });
  const [publishedItems, setPublishedItems] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [manualTask, setManualTask] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("seo-specialist");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [todos, setTodos] = useState<any[]>([]);
  const [newTodo, setNewTodo] = useState("");
  
  const [accounts, setAccounts] = useState<any[]>([]);
  const [newAccountPlatform, setNewAccountPlatform] = useState("twitter");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountToken, setNewAccountToken] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  
  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [vaultContext, setVaultContext] = useState("");
  const [isEditingVault, setIsEditingVault] = useState(false);

  const [isCloningAgent, setIsCloningAgent] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentSystemPrompt, setNewAgentSystemPrompt] = useState("");

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<Record<string, string>>({});

  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [logFilter, setLogFilter] = useState("");

  const showToast = (message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveSettings = async () => {
    try {
      await ipcRenderer.invoke('save-settings', settingsData);
      setIsSettingsModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentId || !newAgentName) return;
    try {
      await ipcRenderer.invoke('create-agent', {
        id: newAgentId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: newAgentName,
        systemPrompt: newAgentSystemPrompt
      });
      setIsCloningAgent(false);
      setNewAgentId("");
      setNewAgentName("");
      setNewAgentSystemPrompt("");
      showToast("Agent cloned successfully");
    } catch (e: any) {
      console.error(e);
      showToast("Failed to clone agent: " + e.message, "error");
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const agentsData = await ipcRenderer.invoke('get-agents');
        const proposalsData = await ipcRenderer.invoke('get-proposals');
        const analyticsData = await ipcRenderer.invoke('get-analytics');
        const logsData = await ipcRenderer.invoke('get-logs');
        const historyData = await ipcRenderer.invoke('get-published-items');
        const accountsData = await ipcRenderer.invoke('get-accounts');
        const todosData = await ipcRenderer.invoke('get-todos');
        const vaultData = await ipcRenderer.invoke('get-vault-context');
        const settingsDataRes = await ipcRenderer.invoke('get-settings');
        
        if (isMounted) {
          if (vaultData) setVaultContext(vaultData);
          if (agentsData && agentsData.length > 0) setAgents(agentsData);
          if (proposalsData) setProposals(proposalsData);
          if (historyData) setPublishedItems(historyData);
          if (accountsData) setAccounts(accountsData);
          if (todosData) setTodos(todosData);
          if (settingsDataRes) setSettingsData(settingsDataRes);
          
          if (analyticsData && analyticsData.length > 0) {
            const metrics: Record<string, number> = {};
            analyticsData.forEach((row: any) => {
              metrics[row.metric_name] = parseInt(row.metric_value) || 0;
            });
            setAnalytics(metrics);
          }
          
          if (logsData) setLogs(logsData);
        }
      } catch (e) {
        console.warn("IPC unavailable or failed. Retrying on next tick.");
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleToggleAutoExecute = async (agentId: string, currentStatus: boolean) => {
    try {
      await ipcRenderer.invoke('toggle-auto-execute', { agentId, autoExecute: !currentStatus });
      setAgents(agents.map(a => a.id === agentId ? { ...a, auto_execute: !currentStatus ? 1 : 0 } : a));
    } catch (e) {
      setAgents(agents.map(a => a.id === agentId ? { ...a, auto_execute: !currentStatus ? 1 : 0 } : a));
    }
  };

  const handleUpdateAgentModel = async (agentId: string, model: string) => {
    try {
      await ipcRenderer.invoke('update-agent-model', { agentId, model });
      setAgents(agents.map(a => a.id === agentId ? { ...a, model } : a));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevoke = async (item: any) => {
    try {
      const result = await ipcRenderer.invoke('revoke-action', item);
      if (result.success) {
        setPublishedItems(publishedItems.map(p => p.id === item.id ? { ...p, status: 'revoked' } : p));
        showToast("Post revoked successfully");
      } else {
        showToast("Failed to revoke: " + result.error, "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
  };

  const handleSubmitTask = async () => {
    if (!manualTask.trim()) return;
    setIsSubmittingTask(true);
    try {
      await ipcRenderer.invoke('submit-manual-task', { agentId: selectedAgent, task: manualTask });
      setManualTask("");
      setLogs(prev => [{id: Date.now(), timestamp: new Date().toISOString(), agent_id: 'SYSTEM', message: `Delegated task to ${selectedAgent}`}].concat(prev).slice(0, 50));
      showToast("Task submitted to " + selectedAgent);
    } catch (e: any) {
      showToast("Failed to submit task: " + e.message, "error");
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleSaveVault = async () => {
    try {
      await ipcRenderer.invoke('save-vault-context', vaultContext);
      setIsEditingVault(false);
      setLogs(prev => [{id: Date.now(), timestamp: new Date().toISOString(), agent_id: 'SYSTEM', message: `Knowledge Vault updated`}].concat(prev).slice(0, 50));
      showToast("Vault saved successfully");
    } catch (e: any) {
      showToast("Failed to save vault: " + e.message, "error");
    }
  };

  // ─── Persistent Todos ───────────────────────────────────────────────────────
  const handleAddTodo = async () => {
    if (newTodo.trim()) {
      const result = await ipcRenderer.invoke('add-todo', { text: newTodo });
      if (result && result.success) {
        setTodos(prev => [{ id: result.id, text: newTodo, done: 0, created_at: new Date().toISOString() }, ...prev]);
      }
      setNewTodo("");
    }
  };

  const toggleTodo = async (id: number, currentDone: boolean) => {
    await ipcRenderer.invoke('toggle-todo', { id, done: !currentDone });
    setTodos(todos.map(t => t.id === id ? { ...t, done: !currentDone ? 1 : 0 } : t));
  };
  
  const deleteTodo = async (id: number) => {
    await ipcRenderer.invoke('delete-todo', id);
    setTodos(todos.filter(t => t.id !== id));
  };

  // ─── Accounts ───────────────────────────────────────────────────────────────
  const handleAddAccount = async () => {
    if (!newAccountName || !newAccountToken) return;
    try {
      await ipcRenderer.invoke('add-account', {
        platform: newAccountPlatform,
        account_name: newAccountName,
        access_token: newAccountToken
      });
      setIsAddingAccount(false);
      setNewAccountName("");
      setNewAccountToken("");
      // Refresh
      const data = await ipcRenderer.invoke('get-accounts');
      setAccounts(data);
      showToast("Account added successfully");
    } catch (e: any) {
      console.error(e);
      showToast("Failed to add account: " + e.message, "error");
    }
  };

  const handleLinkedInLogin = async () => {
    try {
      const result = await ipcRenderer.invoke('start-linkedin-oauth');
      if (result.success) {
        // Refresh
        const data = await ipcRenderer.invoke('get-accounts');
        setAccounts(data);
        showToast("LinkedIn account linked successfully");
      } else {
        showToast("LinkedIn Login Failed: " + result.error, "error");
      }
    } catch (e: any) {
      showToast("LinkedIn Login Error: " + e.message, "error");
    }
  };
  
  const handleToggleAccount = async (id: number, currentStatus: boolean) => {
    await ipcRenderer.invoke('toggle-account', { id, is_active: !currentStatus });
    setAccounts(accounts.map(a => a.id === id ? { ...a, is_active: !currentStatus ? 1 : 0 } : a));
    showToast("Account status toggled");
  };
  
  const handleDeleteAccount = async (id: number) => {
    if (confirmDeleteId === id) {
      await ipcRenderer.invoke('delete-account', id);
      setAccounts(accounts.filter(a => a.id !== id));
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => setConfirmDeleteId(prev => prev === id ? null : prev), 3000);
    }
  };

  const handleTestWebhook = async (id: number) => {
    try {
      const result = await ipcRenderer.invoke('test-webhook', id);
      if (result.success) {
        showToast("Test webhook sent successfully! Check Make.com.");
      } else {
        showToast("Test webhook failed: " + result.error, "error");
      }
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
  };

  // ─── Analytics Calculations ──────────────────────────────────────────────────
  const totalLikes = publishedItems.reduce((sum, item) => sum + (item.likes || 0), 0);
  const totalShares = publishedItems.reduce((sum, item) => sum + (item.shares || 0), 0);
  const activePostsCount = publishedItems.filter(i => i.status === 'active').length;

  if (typeof window !== 'undefined' && !(window as any).electron) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-slate-950 to-cyan-950 text-cyan-50 font-mono p-8 flex items-center justify-center">
        <div className="bg-black/60 p-8 border border-red-500/50 rounded-xl max-w-2xl text-center shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-400 mb-4 uppercase tracking-widest">Environment Error</h1>
          <p className="text-gray-300 mb-6">
            You are viewing ATMA AI in a regular web browser. The backend IPC (Inter-Process Communication) bridge is disconnected, which means the app cannot communicate with the database, agents, or APIs.
          </p>
          <div className="bg-red-950/30 p-4 rounded text-sm text-red-300 mb-6 border border-red-900/50 text-left">
            <strong>How to fix:</strong>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Close this browser tab.</li>
              <li>Wait for the native ATMA AI app window to appear when running <code>npm run dev</code>.</li>
              <li>If the native window closes immediately, check your terminal for <code>better-sqlite3</code> compilation errors.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-cyan-500 font-mono p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

      <header className="flex justify-between items-center mb-8 border-b border-cyan-900/50 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Zap className={`w-8 h-8 ${isListening ? 'text-red-500 animate-pulse' : 'text-cyan-400'}`} />
            <div className="absolute inset-0 bg-cyan-400 blur-md opacity-50" />
          </div>
          <h1 className="text-3xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 uppercase">
            ATMA AI — D.O.P.A. Jarvis
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-cyan-400 bg-cyan-950/40 px-3 py-1 rounded-full border border-cyan-800/50">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            SYSTEM ONLINE
          </div>
          <Settings onClick={() => setIsSettingsModalOpen(true)} className="w-5 h-5 cursor-pointer text-gray-400 hover:text-white transition-colors" />
        </div>
      </header>

      {/* Phase 6: Analytics Dashboard */}
      <div className="mb-6 relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex items-center justify-between">
          <div>
            <p className="text-cyan-500/80 text-xs uppercase font-bold tracking-widest mb-1">Total Audience Likes</p>
            <p className="text-3xl font-bold text-cyan-300">{totalLikes.toLocaleString()}</p>
          </div>
          <Heart className="w-10 h-10 text-cyan-700/50" />
        </div>
        <div className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex items-center justify-between">
          <div>
            <p className="text-cyan-500/80 text-xs uppercase font-bold tracking-widest mb-1">Total Amplification</p>
            <p className="text-3xl font-bold text-cyan-300">{totalShares.toLocaleString()}</p>
          </div>
          <Share2 className="w-10 h-10 text-cyan-700/50" />
        </div>
        <div className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex items-center justify-between">
          <div>
            <p className="text-cyan-500/80 text-xs uppercase font-bold tracking-widest mb-1">Active AI Posts</p>
            <p className="text-3xl font-bold text-cyan-300">{activePostsCount.toLocaleString()}</p>
          </div>
          <BarChart2 className="w-10 h-10 text-cyan-700/50" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        
        {/* Left Column: Accounts, Agents & History */}
        <div className="lg:col-span-1 space-y-6 flex flex-col">
          
          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-cyan-300 uppercase tracking-wider">
                <Users className="w-5 h-5" /> Connected Accounts
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={handleLinkedInLogin}
                  className="text-xs bg-blue-800/80 hover:bg-blue-700 text-white px-2 py-1 rounded border border-blue-600 uppercase font-bold shadow-[0_0_10px_rgba(29,78,216,0.5)]"
                >
                  <span className="flex items-center gap-1">in Login</span>
                </button>
                <button 
                  onClick={() => setIsAddingAccount(!isAddingAccount)}
                  className="text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 px-2 py-1 rounded border border-cyan-700 uppercase font-bold"
                >
                  {isAddingAccount ? 'Cancel' : '+ Add'}
                </button>
              </div>
            </div>
            
            <AnimatePresence>
              {isAddingAccount && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 bg-cyan-950/30 p-3 rounded-lg border border-cyan-800 flex flex-col gap-2 overflow-hidden"
                >
                  <select 
                    value={newAccountPlatform} 
                    onChange={(e) => setNewAccountPlatform(e.target.value)}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  >
                    <option value="twitter">Twitter / X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="webhook">Custom Webhook</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder={newAccountPlatform === 'webhook' ? "Webhook Name (e.g. Make.com LinkedIn)" : "Account Name (e.g. ATMA AI Page)"} 
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                  <input 
                    type={newAccountPlatform === 'webhook' ? "text" : "password"} 
                    placeholder={newAccountPlatform === 'webhook' ? "Webhook URL (https://hook.us1.make.com/...)" : "Access Token"} 
                    value={newAccountToken}
                    onChange={(e) => setNewAccountToken(e.target.value)}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                  <button 
                    onClick={handleAddAccount}
                    disabled={!newAccountName.trim() || !newAccountToken.trim()}
                    className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white p-1.5 rounded text-xs uppercase font-bold mt-1"
                  >
                    Save Account
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-2 custom-scrollbar">
              {accounts.length === 0 && !isAddingAccount && (
                <div className="text-xs text-cyan-800/60 text-center py-3">
                  <p className="mb-1">No connected accounts yet.</p>
                  <p className="text-[10px]">Click <strong>+ Add</strong> above to connect your Twitter or LinkedIn.</p>
                </div>
              )}
              {accounts.map(acc => (
                <div key={acc.id} className={`p-2 rounded-lg flex justify-between items-center border transition-all ${acc.is_active ? 'bg-cyan-950/20 border-cyan-700' : 'bg-gray-900/50 border-gray-800 opacity-60'}`}>
                  <div>
                    <div className="text-xs font-bold text-cyan-100 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${acc.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                      {acc.account_name || 'Unknown'} 
                      <span className={`text-[10px] font-bold ml-1 px-1 rounded ${acc.platform === 'webhook' ? 'bg-purple-900/50 text-purple-400 border border-purple-800' : 'text-cyan-700 font-normal'}`}>
                        {acc.platform === 'webhook' ? 'WEBHOOK' : `(${acc.platform})`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {acc.platform === 'webhook' && (
                      <button
                        onClick={() => handleTestWebhook(acc.id)}
                        className="text-[10px] px-2 py-0.5 rounded border border-purple-800 text-purple-400 hover:bg-purple-900/50"
                      >
                        TEST
                      </button>
                    )}
                    <button 
                      onClick={() => handleToggleAccount(acc.id, acc.is_active === 1)}
                      className={`text-[10px] px-2 py-0.5 rounded border ${acc.is_active ? 'border-cyan-800 text-cyan-400 hover:bg-cyan-900' : 'border-gray-700 text-gray-400 hover:text-white'}`}
                    >
                      {acc.is_active ? 'ACTIVE' : 'OFF'}
                    </button>
                    <button 
                      onClick={() => handleDeleteAccount(acc.id)} 
                      className={`transition-colors ${confirmDeleteId === acc.id ? 'text-red-500' : 'text-red-900 hover:text-red-500'}`}
                      title={confirmDeleteId === acc.id ? 'Click again to confirm' : 'Delete account'}
                    >
                      {confirmDeleteId === acc.id ? (
                        <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-cyan-300 uppercase tracking-wider">
                <Activity className="w-5 h-5" /> Agent Roster
              </h2>
              <button 
                onClick={() => setIsCloningAgent(!isCloningAgent)}
                className="text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 px-2 py-1 rounded border border-cyan-700 uppercase font-bold"
              >
                {isCloningAgent ? 'Cancel' : '+ New Agent'}
              </button>
            </div>

            <AnimatePresence>
              {isCloningAgent && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 bg-cyan-950/30 p-3 rounded-lg border border-cyan-800 flex flex-col gap-2 overflow-hidden"
                >
                  <input 
                    type="text" 
                    placeholder="Agent ID (e.g. event-planner)" 
                    value={newAgentId}
                    onChange={(e) => setNewAgentId(e.target.value)}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                  <input 
                    type="text" 
                    placeholder="Display Name (e.g. Event Planner)" 
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                  <textarea 
                    placeholder="System Prompt (Define their role and rules)" 
                    value={newAgentSystemPrompt}
                    onChange={(e) => setNewAgentSystemPrompt(e.target.value)}
                    rows={3}
                    className="bg-black border border-cyan-900/50 rounded p-1.5 text-xs text-cyan-300 outline-none focus:border-cyan-500"
                  />
                  <button 
                    onClick={handleCreateAgent}
                    disabled={!newAgentId.trim() || !newAgentName.trim() || !newAgentSystemPrompt.trim()}
                    className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white p-1.5 rounded text-xs uppercase font-bold mt-1"
                  >
                    Deploy Agent
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {agents.map((agent) => (
                <div key={agent.id} className="bg-cyan-950/20 border border-cyan-900/40 p-3 rounded-lg flex justify-between items-center hover:bg-cyan-900/30 transition-all">
                  <div>
                    <div className="text-sm font-semibold text-white">{agent.name}</div>
                    <div className="text-xs text-cyan-600 flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${agent.status === 'idle' ? 'bg-gray-500' : agent.status === 'working' ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`} />
                      {agent.status.toUpperCase()}
                      <select 
                        value={agent.model || 'google/gemini-2.5-pro:free'}
                        onChange={(e) => handleUpdateAgentModel(agent.id, e.target.value)}
                        className="ml-2 bg-black border border-cyan-900/50 rounded p-1 text-[10px] text-cyan-300 outline-none focus:border-cyan-500 max-w-[120px]"
                      >
                        <option value="google/gemini-2.5-pro:free">Gemini 2.5 Pro</option>
                        <option value="meta-llama/llama-3.3-70b-instruct:free">LLaMA 3.3 70B</option>
                        <option value="qwen/qwen3-next-80b-a3b-instruct:free">Qwen 3 Next 80B</option>
                        <option value="google/gemma-4-31b-it:free">Gemma 4 31B</option>
                        <option value="openai/gpt-oss-120b:free">GPT OSS 120B</option>
                        <option value="liquid/lfm-2.5-1.2b-instruct:free">LFM 2.5 1.2B</option>
                        <option value="nousresearch/hermes-3-llama-3.1-405b:free">Hermes 3 405B</option>
                        <option value="cognitivecomputations/dolphin-mistral-24b-venice-edition:free">Dolphin Mistral 24B</option>
                      </select>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleToggleAutoExecute(agent.id, agent.auto_execute === 1)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${agent.auto_execute === 1 ? 'border-red-500/50 text-red-400 bg-red-950/20' : 'border-cyan-800 text-cyan-600 hover:text-cyan-400'}`}
                  >
                    {agent.auto_execute === 1 ? 'AUTO' : 'REVIEW'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4 text-cyan-300 border-b border-cyan-900/30 pb-2 uppercase tracking-wider">
              <History className="w-5 h-5" /> Publication History
            </h2>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {publishedItems.length === 0 ? (
                <div className="text-sm text-cyan-800/60 text-center py-4">No published items yet.</div>
              ) : (
                publishedItems.map((item) => (
                  <div key={item.id} className={`border p-3 rounded-lg flex flex-col gap-2 transition-all ${item.status === 'revoked' ? 'bg-red-950/10 border-red-900/30' : 'bg-cyan-950/20 border-cyan-900/40 hover:bg-cyan-900/30'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-semibold text-cyan-400">[{item.platform.toUpperCase()}] <span className="text-gray-400">{item.agent_id}</span></div>
                        <div className="text-xs text-gray-500 mt-0.5">{new Date(item.published_at).toLocaleString()}</div>
                      </div>
                      <div className="text-xs font-mono text-cyan-700 truncate max-w-[150px]" title={item.reference_id}>
                        {item.platform === 'twitter' && item.reference_id && !item.reference_id.startsWith('sim_') && !item.reference_id.startsWith('mock_') ? (
                          <a href={`https://x.com/i/web/status/${item.reference_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 underline">
                            {item.reference_id}
                          </a>
                        ) : (
                          item.reference_id
                        )}
                      </div>
                    </div>
                    {item.target_account_id && (
                      <div className="text-[10px] text-cyan-500/80 uppercase font-bold tracking-wider">
                        Routed to: {accounts.find(a => a.id === item.target_account_id)?.account_name || `Account #${item.target_account_id}`}
                      </div>
                    )}
                    <div className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-3" title={item.content}>
                      {item.content}
                    </div>
                    {item.image_url && (
                      <div className="mt-2 rounded overflow-hidden border border-cyan-900/50">
                        <img src={item.image_url} alt="Generated for post" className="w-full h-auto object-cover max-h-32 opacity-80" />
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-cyan-900/30">
                      <div className="text-xs font-semibold flex items-center gap-4">
                        {item.status === 'active' ? (
                          <span className="text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> LIVE</span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> REVOKED</span>
                        )}
                        {item.likes !== undefined && item.status === 'active' && (
                          <div className="flex gap-2 text-cyan-300/70 font-normal">
                            <span title="Likes">❤️ {item.likes}</span>
                            <span title="Shares">🔄 {item.shares}</span>
                          </div>
                        )}
                      </div>
                      {item.status === 'active' && item.platform !== 'crm-campaign' && (
                        <button 
                          onClick={() => handleRevoke(item)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-red-900/50 text-red-400 hover:bg-red-900/30 transition-colors uppercase tracking-wider font-bold"
                        >
                          <RotateCcw className="w-3 h-3" /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Middle Column: Delegate Task & Review Inbox */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-cyan-300 uppercase tracking-wider">
                <BookOpen className="w-5 h-5" /> Knowledge Vault
              </h2>
              <button 
                onClick={() => {
                  if (isEditingVault) handleSaveVault();
                  else setIsEditingVault(true);
                }}
                className={`text-xs px-2 py-1 rounded border transition-colors uppercase font-bold ${isEditingVault ? 'bg-cyan-700 hover:bg-cyan-600 text-white border-cyan-500' : 'bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 border-cyan-700'}`}
              >
                {isEditingVault ? 'Save Context' : 'Edit Context'}
              </button>
            </div>
            {isEditingVault ? (
              <textarea 
                value={vaultContext}
                onChange={(e) => setVaultContext(e.target.value)}
                className="w-full bg-cyan-950/20 border border-cyan-500 rounded p-3 text-xs text-cyan-100 outline-none focus:border-cyan-400 min-h-[150px] resize-none custom-scrollbar"
              />
            ) : (
              <div className="text-xs text-cyan-600 whitespace-pre-wrap h-[150px] overflow-y-auto custom-scrollbar p-2 bg-black/30 border border-cyan-900/30 rounded">
                {vaultContext || "No context defined. Edit to add RAG knowledge."}
              </div>
            )}
          </section>

          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4 text-cyan-300 border-b border-cyan-900/30 pb-2 uppercase tracking-wider">
              <Command className="w-5 h-5" /> Delegate Task
            </h2>
            <div className="flex flex-col gap-3">
              <select 
                value={selectedAgent} 
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="bg-cyan-950/20 border border-cyan-900/50 rounded p-2 text-sm text-cyan-300 outline-none focus:border-cyan-500 transition-colors"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id} className="bg-black text-cyan-500">{a.name}</option>
                ))}
              </select>
              <textarea 
                value={manualTask}
                onChange={(e) => setManualTask(e.target.value)}
                placeholder="Describe a task for the agent to do..."
                className="bg-cyan-950/20 border border-cyan-900/50 rounded p-2 text-sm text-cyan-300 outline-none focus:border-cyan-500 transition-colors min-h-[80px] resize-none custom-scrollbar"
              />
              <button 
                onClick={handleSubmitTask}
                disabled={isSubmittingTask || !manualTask.trim()}
                className="bg-cyan-900/50 hover:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed text-cyan-300 py-2 rounded text-xs border border-cyan-700 transition-colors uppercase tracking-widest font-bold"
              >
                {isSubmittingTask ? 'Submitting...' : 'Send Task'}
              </button>
            </div>
          </section>

          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4 text-cyan-300 border-b border-cyan-900/30 pb-2 uppercase tracking-wider">
              <Shield className="w-5 h-5" /> Pending Reviews
            </h2>
            
            {proposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-cyan-800/60">
                <CheckCircle className="w-12 h-12 mb-2 opacity-50" />
                <p>All clear. No pending proposals.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {proposals.map((prop) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    key={prop.id} 
                    className="bg-cyan-950/30 border border-cyan-700/50 p-4 rounded-lg"
                  >
                    <div className="text-xs text-cyan-500 mb-2 font-semibold flex justify-between">
                      <span>Source: {prop.agent_id}</span>
                      {prop.target_account_id && (
                        <span className="text-cyan-300 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-800">
                          To: {accounts.find(a => a.id === prop.target_account_id)?.account_name || `#${prop.target_account_id}`}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-300 mb-2 whitespace-pre-wrap">{prop.content}</div>
                    {prop.image_url && (
                      <div className="mb-4 rounded overflow-hidden border border-cyan-900/50">
                        <img src={prop.image_url} alt="Generated for post" className="w-full h-auto object-cover max-h-40" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          const result = await ipcRenderer.invoke('update-proposal-status', { proposalId: prop.id, status: 'approved' });
                          if (result && !result.success) {
                            alert("Execution failed: " + result.error);
                          }
                          setProposals(proposals.filter(p => p.id !== prop.id));
                        }}
                        className="flex-1 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 py-1.5 rounded text-xs border border-cyan-700 transition-colors uppercase tracking-widest font-bold">
                        Approve
                      </button>
                      <button 
                        onClick={async () => {
                          const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                          await ipcRenderer.invoke('update-proposal-status', { proposalId: prop.id, status: 'scheduled', scheduledFor });
                          setProposals(proposals.filter(p => p.id !== prop.id));
                        }}
                        className="flex-1 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 py-1.5 rounded text-xs border border-blue-900/50 transition-colors uppercase tracking-widest font-bold">
                        +1hr
                      </button>
                      <button 
                        onClick={async () => {
                          const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                          await ipcRenderer.invoke('update-proposal-status', { proposalId: prop.id, status: 'scheduled', scheduledFor });
                          setProposals(proposals.filter(p => p.id !== prop.id));
                        }}
                        className="flex-1 bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 py-1.5 rounded text-xs border border-purple-900/50 transition-colors uppercase tracking-widest font-bold">
                        +24hr
                      </button>
                      <button 
                        onClick={async () => {
                          await ipcRenderer.invoke('update-proposal-status', { proposalId: prop.id, status: 'rejected' });
                          setProposals(proposals.filter(p => p.id !== prop.id));
                        }}
                        className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 py-1.5 rounded text-xs border border-red-900/50 transition-colors uppercase tracking-widest font-bold">
                        Reject
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Logs, Analytics & Todos */}
        <div className="lg:col-span-1 space-y-6 flex flex-col h-full">
          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex-1">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-cyan-300 uppercase tracking-wider">
                <Terminal className="w-5 h-5" /> System Logs
              </h2>
              <input 
                type="text" 
                placeholder="Filter logs..." 
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                className="bg-black border border-cyan-900/50 rounded px-2 py-1 text-xs text-cyan-300 w-32 focus:w-48 transition-all outline-none focus:border-cyan-500"
              />
            </div>
            <div className="bg-black border border-cyan-900/50 rounded p-3 h-48 overflow-y-auto font-mono text-xs text-cyan-600 space-y-1 flex flex-col-reverse">
              {logs.length === 0 && <div>[SYSTEM] Waiting for activity...</div>}
              {logs.filter(log => log.message.toLowerCase().includes(logFilter.toLowerCase()) || log.agent_id.toLowerCase().includes(logFilter.toLowerCase())).map((log) => (
                <div key={log.id}>
                  <span className="text-cyan-800">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span className="text-cyan-500 font-bold">[{log.agent_id.toUpperCase()}]</span>{' '}
                  <span className="text-cyan-300">{log.message}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4 text-cyan-300 border-b border-cyan-900/30 pb-2 uppercase tracking-wider">
              <Database className="w-5 h-5" /> Analytics
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-cyan-950/20 border border-cyan-900/40 p-3 rounded text-center">
                <div className="text-2xl font-bold text-cyan-300">{analytics.tasks_completed || 0}</div>
                <div className="text-xs text-cyan-700 uppercase">Tasks Completed</div>
              </div>
              <div className="bg-cyan-950/20 border border-cyan-900/40 p-3 rounded text-center">
                <div className="text-2xl font-bold text-cyan-300">{analytics.posts_published || 0}</div>
                <div className="text-xs text-cyan-700 uppercase">Posts Published</div>
              </div>
            </div>
          </section>

          {/* Persistent Todos */}
          <section className="bg-black/40 backdrop-blur-md border border-cyan-900/50 rounded-xl p-5 shadow-[0_0_15px_rgba(6,182,212,0.1)] flex-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4 text-cyan-300 border-b border-cyan-900/30 pb-2 uppercase tracking-wider">
              <CheckSquare className="w-5 h-5" /> Things To Do
            </h2>
            <div className="flex flex-col gap-3 h-full">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                  placeholder="Add a new task..." 
                  className="flex-1 bg-cyan-950/20 border border-cyan-900/50 rounded p-2 text-sm text-cyan-300 outline-none focus:border-cyan-500"
                />
                <button onClick={handleAddTodo} className="bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 px-3 py-2 rounded text-xs border border-cyan-700 uppercase font-bold">Add</button>
              </div>
              <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 max-h-48">
                {todos.length === 0 && <div className="text-xs text-cyan-800 italic">No tasks pending.</div>}
                {todos.map(todo => (
                  <div key={todo.id} className="flex items-center gap-2 bg-cyan-950/10 p-2 rounded border border-cyan-900/30 group">
                    <input 
                      type="checkbox" 
                      checked={todo.done === 1} 
                      onChange={() => toggleTodo(todo.id, todo.done === 1)}
                      className="accent-cyan-500 w-4 h-4 cursor-pointer"
                    />
                    <span className={`text-sm flex-1 ${todo.done === 1 ? 'line-through text-cyan-800' : 'text-cyan-300'}`}>{todo.text}</span>
                    <button 
                      onClick={() => deleteTodo(todo.id)} 
                      className="text-red-900 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

      </div>
      
      {/* Global Styles for Scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(6, 182, 212, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.3);
          border-radius: 4px;
        }
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}} />
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-cyan-800/50 rounded-lg p-6 max-w-md w-full"
            >
              <h2 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Global Settings
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">OpenRouter API Key (For Custom Models)</label>
                  <input
                    type="password"
                    value={settingsData.openrouter_api_key || ''}
                    onChange={e => setSettingsData({...settingsData, openrouter_api_key: e.target.value})}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-black/50 border border-cyan-900/50 rounded p-2 text-sm text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">If blank, defaults to the .env key.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded"
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-4 right-4 px-4 py-3 rounded shadow-lg z-50 text-sm font-medium ${toast.type === 'success' ? 'bg-cyan-600' : 'bg-red-600'} text-white flex items-center gap-2`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
