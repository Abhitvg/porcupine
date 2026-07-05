'use client';

import { useState, useEffect } from 'react';
import { Activity, Terminal, CheckCircle, Database, Shield, Zap, Settings, Command, History, RotateCcw, CheckSquare, Users, Trash2, TriangleAlert, BookOpen, BarChart2, Heart, Share2, Menu, X, Plus, Play, Pause, FileText, Lock, ChevronsUpDown, Search, User, Bell, DollarSign, ShoppingCart, Headset, Lightbulb, TrendingUp, AlertTriangle, Briefcase, Upload, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Use window.electron from preload.js for secure IPC
const ipcRenderer = typeof window !== 'undefined' && (window as any).electron ? (window as any).electron : {
  invoke: async () => [],
};

// Fake data for the chart since the backend currently only tracks total integers
const generateChartData = (totalTasks: number) => {
  const data = [];
  let current = Math.max(10, totalTasks / 2);
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      name: d.toLocaleDateString('en-US', { weekday: 'short' }),
      tasks: Math.floor(current)
    });
    current += Math.random() * 5 + 1;
  }
  return data;
};

export default function JarvisDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("org-default");
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  

  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const [isCmdkOpen, setIsCmdkOpen] = useState(false);

  const [cmdkQuery, setCmdkQuery] = useState("");

  const [agents, setAgents] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({
    tasks_completed: 0,
    posts_published: 0
  });
  const [chartData, setChartData] = useState<any[]>([]);
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
  
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [leads, setLeads] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [billing, setBilling] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [domainExperts, setDomainExperts] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any[]>([]);
  const [csvInput, setCsvInput] = useState("");

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

  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(cmdkQuery.toLowerCase()) || a.id.toLowerCase().includes(cmdkQuery.toLowerCase()));
  const tabs = [
    { id: 'dashboard', label: 'CEO Dashboard', icon: Activity },
    { id: 'crm', label: 'CRM & Sales', icon: TrendingUp },
    { id: 'finance', label: 'Finance & Orders', icon: DollarSign },
    { id: 'content', label: 'Content Engine', icon: Share2 },
    { id: 'support', label: 'Customer Support', icon: Headset },
    { id: 'mentors', label: 'Advisory Board', icon: Lightbulb },
    { id: 'agents', label: 'Agent Mesh', icon: Users },
    { id: 'vault', label: 'Knowledge Vault', icon: Database },
    { id: 'investors', label: 'Investor Relations', icon: Briefcase },
    { id: 'logs', label: 'System Logs', icon: Terminal },
  ];
  const filteredTabs = tabs.filter(t => t.label.toLowerCase().includes(cmdkQuery.toLowerCase()));

  const showToast = (message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveSettings = async () => {
    try {
      await ipcRenderer.invoke('save-settings', settingsData);
      setIsSettingsModalOpen(false);
      showToast("Settings saved successfully");
    } catch (e) {
      console.error(e);
      showToast("Failed to save settings", "error");
    }
  };


  const handleCreateOrg = async () => {
    if (!newOrgName) return;
    try {
      const orgId = newOrgName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      await ipcRenderer.invoke('create-organization', { id: orgId, name: newOrgName });
      setIsCreateOrgModalOpen(false);
      setNewOrgName("");
      setSelectedOrg(orgId); // Switch to the new org
      showToast("Organization created successfully");
    } catch (e: any) {
      console.error(e);
      showToast("Failed to create organization: " + e.message, "error");
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentId || !newAgentName) return;
    try {
      await ipcRenderer.invoke('create-agent', {
        id: newAgentId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: newAgentName,
        systemPrompt: newAgentSystemPrompt,
        orgId: selectedOrg
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
        const orgsData = await ipcRenderer.invoke('get-organizations');
        const agentsData = await ipcRenderer.invoke('get-agents', selectedOrg);
        const proposalsData = await ipcRenderer.invoke('get-proposals', selectedOrg);
        const analyticsData = await ipcRenderer.invoke('get-analytics', selectedOrg);
        const logsData = await ipcRenderer.invoke('get-logs', selectedOrg);
        const historyData = await ipcRenderer.invoke('get-published-items', selectedOrg);
        const accountsData = await ipcRenderer.invoke('get-accounts', selectedOrg);
        const todosData = await ipcRenderer.invoke('get-todos', selectedOrg);
        const vaultData = await ipcRenderer.invoke('get-vault-context'); // vault is global for now
        const settingsDataRes = await ipcRenderer.invoke('get-settings');
        
        const leadsData = await ipcRenderer.invoke('get-leads', selectedOrg);
        const ordersData = await ipcRenderer.invoke('get-orders', selectedOrg);
        const billingData = await ipcRenderer.invoke('get-billing', selectedOrg);
        const supportData = await ipcRenderer.invoke('get-support-tickets', selectedOrg);
        const expertsData = await ipcRenderer.invoke('get-domain-experts', selectedOrg);
        const investorsData = await ipcRenderer.invoke('get-investors', selectedOrg);
        
        if (isMounted) {
          if (orgsData && orgsData.length > 0) setOrganizations(orgsData);
          if (vaultData) setVaultContext(vaultData);
          if (agentsData) setAgents(agentsData);
          if (proposalsData) setProposals(proposalsData);
          if (analyticsData) {
            setAnalytics(analyticsData);
            setChartData(generateChartData(analyticsData.tasks_completed || 0));
          }
          if (logsData) setLogs(logsData);
          if (historyData) setPublishedItems(historyData);
          if (accountsData) setAccounts(accountsData);
          if (todosData) setTodos(todosData);
          if (settingsDataRes) {
            setSettingsData(settingsDataRes || {});
          }
          if (leadsData) setLeads(leadsData);
          if (ordersData) setOrders(ordersData);
          if (billingData) setBilling(billingData);
          if (supportData) setSupportTickets(supportData);
          if (expertsData) setDomainExperts(expertsData);
          if (investorsData) setInvestors(investorsData);
        }
      } catch (err) {
        console.error("IPC Error:", err);
      }
    };

    fetchData();
    
    if (ipcRenderer && ipcRenderer.onStateUpdate) {
      ipcRenderer.onStateUpdate(() => {
        if (isMounted) fetchData();
      });
    }

    return () => {
      isMounted = false;
      if (ipcRenderer && ipcRenderer.offStateUpdate) {
        ipcRenderer.offStateUpdate();
      }
    };
  }, [selectedOrg]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdkOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleManualTask = async () => {
    if (!manualTask) return;
    setIsSubmittingTask(true);
    try {
      await ipcRenderer.invoke('submit-manual-task', { agentId: selectedAgent, prompt: manualTask, orgId: selectedOrg });
      setManualTask("");
      showToast("Task submitted successfully");
    } catch (e: any) {
      console.error(e);
      showToast("Error submitting task", "error");
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleToggleVoice = async () => {
    try {
      // voice logic
    } catch(e) {}
  };

  const handleUploadInvestors = async () => {
    if (!csvInput.trim()) {
      showToast("Please paste CSV data first", "error");
      return;
    }
    try {
      const res = await ipcRenderer.invoke('upload-investors-csv', { csvData: csvInput, orgId: selectedOrg });
      if (res.success) {
        showToast(`Successfully imported ${res.count} investors`);
        setCsvInput("");
        const investorsData = await ipcRenderer.invoke('get-investors', selectedOrg);
        setInvestors(investorsData);
      } else {
        showToast("Error importing CSV: " + res.error, "error");
      }
    } catch (e: any) {
      showToast("Error importing CSV", "error");
    }
  };

  const handleTriggerOutreach = async () => {
    try {
      showToast("Triggering Investor Relations Agent...");
      const res = await ipcRenderer.invoke('trigger-investor-outreach', selectedOrg);
      if (res.success) {
        showToast("Outreach task triggered successfully");
      } else {
        showToast("Error triggering outreach", "error");
      }
    } catch (e: any) {
      showToast("Error triggering outreach", "error");
    }
  };


  const handleProposalAction = async (id: number, action: 'approve' | 'reject') => {
    try {
      await ipcRenderer.invoke('update-proposal-status', { proposalId: id, status: action === 'approve' ? 'approved' : 'rejected', scheduledFor: Date.now() });
      showToast(`Proposal ${action}d`);
      setProposals(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error(error);
      showToast(`Error handling proposal`, "error");
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo) return;
    try {
      await ipcRenderer.invoke('add-todo', { text: newTodo, orgId: selectedOrg });
      setNewTodo("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTodo = async (id: number, currentStatus: number) => {
    try {
      await ipcRenderer.invoke('toggle-todo', { id, done: currentStatus ? 0 : 1 });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    try {
      await ipcRenderer.invoke('delete-todo', { id });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTwitterLogin = async () => {
    try {
      const result = await ipcRenderer.invoke('twitter-oauth-login');
      if (result && result.success) {
        const accountsData = await ipcRenderer.invoke('get-accounts', selectedOrg);
        if (accountsData.success) setAccounts(accountsData.data);
        setIsAddingAccount(false);
      } else {
        console.error('Twitter login failed:', result?.error);
        alert(`Twitter login failed: ${result?.error}`);
      }
    } catch (error) {
      console.error('Twitter login error:', error);
      alert(`Twitter login error: ${error}`);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName || !newAccountToken) return;
    try {
      await ipcRenderer.invoke('add-account', {
        platform: newAccountPlatform,
        accountName: newAccountName,
        accessToken: newAccountToken,
        orgId: selectedOrg
      });
      setIsAddingAccount(false);
      setNewAccountName("");
      setNewAccountToken("");
      showToast("Account added successfully");
    } catch (e) {
      console.error(e);
      showToast("Error adding account", "error");
    }
  };

  const handleSaveVault = async () => {
    try {
      await ipcRenderer.invoke('save-vault-context', vaultContext);
      setIsEditingVault(false);
      showToast("Vault saved securely");
    } catch (e) {
      console.error(e);
      showToast("Error saving vault", "error");
    }
  };

  const filteredLogs = logs.filter(l => l.message.toLowerCase().includes(logFilter.toLowerCase()) || l.agent_id.toLowerCase().includes(logFilter.toLowerCase()));

  // Render check for standard browser context
  if (typeof window !== 'undefined' && !(window as any).electron) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center font-sans p-6">
        <div className="bg-zinc-900 p-8 border border-red-500/30 rounded-2xl max-w-2xl text-center shadow-2xl">
          <TriangleAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-red-400 mb-4 tracking-tight">ENVIRONMENT ERROR</h1>
          <p className="text-zinc-400 mb-6 text-lg">
            ATMA AI requires native Electron IPC bindings to securely manage the multi-agent system and local SQLite database.
          </p>
          <div className="bg-black/50 p-6 rounded-lg text-left border border-zinc-800">
            <code className="text-sm text-green-400 font-mono block mb-2">$ npm run dev</code>
            <p className="text-zinc-500 text-sm">
              Please ensure you run the orchestrator through the packaged Electron app rather than a standard web browser.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Define tabs
  const navItems = [
    { id: 'dashboard', label: 'CEO Dashboard', icon: Activity },
    { id: 'crm', label: 'CRM & Sales', icon: TrendingUp },
    { id: 'finance', label: 'Finance & Orders', icon: DollarSign },
    { id: 'content', label: 'Content Engine', icon: Share2 },
    { id: 'support', label: 'Customer Support', icon: Headset },
    { id: 'mentors', label: 'Advisory Board', icon: Lightbulb },
    { id: 'agents', label: 'Agent Mesh', icon: Users },
    { id: 'vault', label: 'Knowledge Vault', icon: Database },
    { id: 'logs', label: 'System Logs', icon: Terminal },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans flex overflow-hidden selection:bg-violet-500/30">
      {/* Animated Background */}
      <div className="animated-bg" />

      {/* Sidebar */}
      <motion.aside 
        initial={{ width: 256 }}
        animate={{ width: isSidebarOpen ? 256 : 80 }}
        className="h-screen bg-zinc-950/80 backdrop-blur-2xl border-r border-white/5 flex flex-col transition-all duration-300 relative z-20"
      >
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-3 overflow-hidden"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)] shrink-0">
                    <Activity className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-lg tracking-tight whitespace-nowrap text-white">ATMA AI</span>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 transition-colors shrink-0">
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Org Switcher */}
          {isSidebarOpen && (
            <div className="relative">
              <button 
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors text-left"
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Workspace</span>
                  <span className="font-medium text-sm text-zinc-200 truncate">
                    {organizations.find(o => o.id === selectedOrg)?.name || 'Default Organization'}
                  </span>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-zinc-400 shrink-0" />
              </button>

              <AnimatePresence>
                {isOrgDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl p-1 shadow-2xl z-50 overflow-hidden"
                  >
                    {organizations.map(org => (
                      <button
                        key={org.id}
                        onClick={() => { setSelectedOrg(org.id); setIsOrgDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${selectedOrg === org.id ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-300 hover:bg-white/5'}`}
                      >
                        <span className="text-sm font-medium truncate">{org.name}</span>
                        {selectedOrg === org.id && <CheckCircle className="w-4 h-4" />}
                      </button>
                    ))}
                    <div className="my-1 border-t border-white/5"></div>
                    <button onClick={() => {setIsOrgDropdownOpen(false); setIsCreateOrgModalOpen(true);}} className="w-full flex items-center gap-2 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium">
                      <Plus className="w-4 h-4" />
                      Create Organization
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all relative group overflow-hidden ${
                activeTab === item.id ? 'text-white bg-white/10 shadow-inner' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-5 h-5 shrink-0 transition-colors ${activeTab === item.id ? 'text-violet-400' : 'group-hover:text-zinc-300'}`} />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span 
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="font-medium text-sm whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {activeTab === item.id && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute left-0 top-1/4 h-1/2 w-1 bg-violet-500 rounded-r-full"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5 flex flex-col gap-3">
          {/* User Profile */}
          {isSidebarOpen && (
            <div className="flex items-center gap-3 px-2 py-2 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 border border-white/10 group-hover:border-white/20 transition-colors">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-medium text-sm text-zinc-200 truncate group-hover:text-white transition-colors">Admin User</span>
                <span className="text-xs text-zinc-500 truncate">admin@atma.ai</span>
              </div>
            </div>
          )}

          <button 
            onClick={handleToggleVoice}
            className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl transition-all overflow-hidden ${
              isListening ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {isListening ? (
              <><span className="relative flex h-3 w-3 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span> {isSidebarOpen && <span className="whitespace-nowrap font-medium text-sm">Listening...</span>}</>
            ) : (
              <><Activity className="w-4 h-4 shrink-0" /> {isSidebarOpen && <span className="whitespace-nowrap font-medium text-sm">Voice Off</span>}</>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto relative z-10 scroll-smooth custom-scrollbar">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-zinc-950/50 backdrop-blur-xl border-b border-white/5 px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight capitalize">{activeTab.replace('-', ' ')}</h2>
            <p className="text-sm text-zinc-400 mt-1">ATMA Orchestrator Node v1.0.0</p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shadow-[0_0_10px_rgba(16,185,129,0.1)]">
               <Shield className="w-3 h-3" />
               SYSTEM SECURE
             </div>
             <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/5 shadow-sm">
               <Settings className="w-5 h-5 text-zinc-300" />
             </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-8 max-w-7xl mx-auto space-y-8 pb-32">
          
          {/* TAB: DASHBOARD */}
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-panel-interactive p-6 flex flex-col justify-between h-40">
                    <div className="flex justify-between items-start">
                      <p className="text-zinc-400 font-medium">Active Agents</p>
                      <Users className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-4xl font-bold text-white tracking-tight">{agents.filter(a => a.status === 'idle' || a.status === 'working').length}</h3>
                      <span className="text-sm text-emerald-400 font-medium">/ {agents.length} Online</span>
                    </div>
                  </div>
                  
                  <div className="glass-panel-interactive p-6 flex flex-col justify-between h-40">
                    <div className="flex justify-between items-start">
                      <p className="text-zinc-400 font-medium">Tasks Completed</p>
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-4xl font-bold text-white tracking-tight">{analytics.tasks_completed || 0}</h3>
                      <span className="text-sm text-zinc-500 font-medium">All time</span>
                    </div>
                  </div>

                  <div className="glass-panel-interactive p-6 flex flex-col justify-between h-40">
                    <div className="flex justify-between items-start">
                      <p className="text-zinc-400 font-medium">Content Published</p>
                      <Share2 className="w-5 h-5 text-pink-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-4xl font-bold text-white tracking-tight">{analytics.posts_published || 0}</h3>
                      <span className="text-sm text-zinc-500 font-medium">Cross-platform</span>
                    </div>
                  </div>
                </div>

                {/* Recharts Analytics Area */}
                <div className="glass-panel p-6 h-[400px] flex flex-col">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-violet-400" />
                    Activity Velocity
                  </h3>
                  <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="name" stroke="#a1a1aa" tick={{fill: '#a1a1aa', fontSize: 12}} axisLine={false} tickLine={false} />
                        <YAxis stroke="#a1a1aa" tick={{fill: '#a1a1aa', fontSize: 12}} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fafafa', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                          itemStyle={{ color: '#8b5cf6', fontWeight: 600 }}
                          cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '5 5' }}
                        />
                        <Area type="monotone" dataKey="tasks" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Approvals & Action Center */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Action Center */}
                  <div className="glass-panel p-6 flex flex-col h-[500px]">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                      <Command className="w-5 h-5 text-blue-400" />
                      Command Center
                    </h3>
                    
                    <div className="bg-black/40 border border-white/10 rounded-xl p-1 mb-4 flex items-center shadow-inner">
                      <select 
                        value={selectedAgent} 
                        onChange={(e) => setSelectedAgent(e.target.value)}
                        className="bg-transparent text-white px-4 py-3 outline-none border-r border-white/10 cursor-pointer appearance-none min-w-[140px] font-medium"
                      >
                        {agents.map(a => (
                          <option key={a.id} value={a.id} className="bg-zinc-900">{a.name}</option>
                        ))}
                      </select>
                      <input 
                        type="text" 
                        value={manualTask}
                        onChange={(e) => setManualTask(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleManualTask()}
                        placeholder="Direct task for agent..."
                        className="bg-transparent border-none text-white px-4 py-3 w-full focus:outline-none placeholder:text-zinc-600"
                        disabled={isSubmittingTask}
                      />
                      <button 
                        onClick={handleManualTask}
                        disabled={isSubmittingTask || !manualTask}
                        className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 mr-1 shadow-md shadow-violet-900/20"
                      >
                        {isSubmittingTask ? '...' : 'Deploy'}
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                      {todos.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50">
                           <CheckSquare className="w-12 h-12 mb-3 text-zinc-600" />
                           <p className="font-medium">No active directives.</p>
                         </div>
                      ) : (
                        <AnimatePresence>
                          {todos.map(todo => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95, height: 0 }}
                              key={todo.id} 
                              className={`flex items-center gap-3 p-4 rounded-xl border transition-all shadow-sm ${
                                todo.is_completed ? 'bg-white/5 border-white/5 opacity-50' : 'bg-zinc-900/80 border-white/10 hover:border-violet-500/30'
                              }`}
                            >
                              <button 
                                onClick={() => handleToggleTodo(todo.id, todo.is_completed)}
                                className={`w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0 ${
                                  todo.is_completed ? 'bg-emerald-500 text-white' : 'border border-zinc-500 hover:border-violet-400 bg-black/50'
                                }`}
                              >
                                {todo.is_completed ? <CheckCircle className="w-4 h-4" /> : null}
                              </button>
                              <span className={`flex-1 text-sm ${todo.is_completed ? 'line-through text-zinc-500' : 'text-zinc-200 font-medium'}`}>
                                {todo.text}
                              </span>
                              <button onClick={() => handleDeleteTodo(todo.id)} className="text-zinc-600 hover:text-red-400 p-1 shrink-0 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  </div>

                  {/* Proposals */}
                  <div className="glass-panel p-6 flex flex-col h-[500px]">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-amber-400" />
                      Pending Proposals
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                      {proposals.filter(p => p.status === 'pending_review').length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
                          <CheckCircle className="w-12 h-12 mb-3 text-zinc-700" />
                          <p className="font-medium">All clear. No pending proposals.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {proposals.filter(p => p.status === 'pending_review').map(proposal => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20, height: 0 }}
                              key={proposal.id} 
                              className="bg-black/60 border border-amber-500/20 rounded-xl p-5 shadow-[0_4_20px_rgba(245,158,11,0.05)] relative overflow-hidden"
                            >
                              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
                              <div className="flex items-center gap-2 mb-3">
                                <span className="px-2 py-1 bg-amber-500/10 text-amber-400 text-xs font-bold rounded uppercase tracking-wider">{proposal.agent_id}</span>
                                <span className="text-zinc-500 text-xs font-medium">{new Date(proposal.created_at).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-zinc-200 mb-5 whitespace-pre-wrap text-sm leading-relaxed">{proposal.content}</p>
                              <div className="flex gap-3">
                                <button 
                                  onClick={() => handleProposalAction(proposal.id, 'approve')}
                                  className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                                >
                                  Approve
                                </button>
                                <button 
                                  onClick={() => handleProposalAction(proposal.id, 'reject')}
                                  className="flex-1 bg-red-600/10 hover:bg-red-600/30 text-red-400 border border-red-500/30 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                                >
                                  Reject
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: CRM */}
            {activeTab === 'crm' && (
              <motion.div 
                key="crm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">CRM & Leads</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Manage pipeline and customer relationships</p>
                  </div>
                </div>
                <div className="glass-panel p-6">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-400 text-sm">
                        <th className="pb-3 font-medium">Name</th>
                        <th className="pb-3 font-medium">Company</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {leads.map((lead) => (
                        <tr key={lead.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 font-medium text-zinc-200">{lead.name}</td>
                          <td className="py-4 text-zinc-400">{lead.company}</td>
                          <td className="py-4">
                            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">{lead.status}</span>
                          </td>
                          <td className="py-4 text-zinc-500">{lead.source}</td>
                        </tr>
                      ))}
                      {leads.length === 0 && (
                        <tr><td colSpan={4} className="py-12 text-center text-zinc-500 font-medium">No active leads found in pipeline.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB: FINANCE */}
            {activeTab === 'finance' && (
              <motion.div 
                key="finance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Finance & Orders</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Monitor revenue and transactions</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="glass-panel p-6">
                    <h4 className="text-lg font-bold text-white mb-6">Recent Orders</h4>
                    <div className="space-y-3">
                      {orders.map(order => (
                        <div key={order.id} className="flex justify-between items-center p-4 bg-zinc-900/50 rounded-xl border border-white/5 hover:bg-white/5 transition-colors shadow-sm">
                          <div>
                            <p className="text-sm font-bold text-zinc-200">{order.customer_name}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{new Date(order.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-bold text-emerald-400">${order.amount.toFixed(2)}</p>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">{order.status}</span>
                          </div>
                        </div>
                      ))}
                      {orders.length === 0 && <p className="text-zinc-500 text-sm text-center py-8">No orders yet.</p>}
                    </div>
                  </div>
                  <div className="glass-panel p-6">
                    <h4 className="text-lg font-bold text-white mb-6">Billing History</h4>
                    <div className="space-y-3">
                      {billing.map(bill => (
                        <div key={bill.id} className="flex justify-between items-center p-4 bg-zinc-900/50 rounded-xl border border-white/5 hover:bg-white/5 transition-colors shadow-sm">
                          <p className="text-sm font-medium text-zinc-200">{bill.description}</p>
                          <div className="text-right">
                            <p className="text-base font-bold text-red-400">-${bill.amount.toFixed(2)}</p>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">{bill.status}</span>
                          </div>
                        </div>
                      ))}
                      {billing.length === 0 && <p className="text-zinc-500 text-sm text-center py-8">No billing records.</p>}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: CONTENT */}
            {activeTab === 'content' && (
              <motion.div 
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Content Engine</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Multi-platform autonomous publishing</p>
                  </div>
                  <button onClick={() => setIsAddingAccount(true)} className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10">
                    <Plus className="w-4 h-4" /> Link Account
                  </button>
                </div>
                
                {accounts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {accounts.map(acc => (
                       <div key={acc.id} className="glass-panel p-4 flex items-center gap-4 border-l-4 border-l-violet-500">
                          <div className="w-10 h-10 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                            <Share2 className="w-5 h-5" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-bold text-white text-sm capitalize">{acc.platform}</p>
                            <p className="text-xs text-zinc-400 truncate w-full">{acc.account_name}</p>
                          </div>
                       </div>
                    ))}
                  </div>
                )}

                <div className="glass-panel p-6">
                  <h4 className="text-lg font-bold text-white mb-6">Published Items</h4>
                  <div className="space-y-4">
                    {publishedItems.map(item => (
                      <div key={item.id} className="p-5 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors shadow-inner">
                        <div className="flex items-center justify-between mb-3">
                          <span className="px-2.5 py-1 bg-violet-500/10 text-violet-400 text-xs font-bold rounded-full uppercase tracking-wider border border-violet-500/20">{item.platform}</span>
                          <span className="text-xs text-zinc-500 font-medium">{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                      </div>
                    ))}
                    {publishedItems.length === 0 && <div className="text-zinc-500 text-sm text-center py-12 flex flex-col items-center gap-3"><FileText className="w-8 h-8 opacity-20"/> No content published yet.</div>}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: SUPPORT */}
            {activeTab === 'support' && (
              <motion.div 
                key="support"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Customer Support</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Autonomous issue resolution</p>
                  </div>
                </div>
                <div className="glass-panel p-6 min-h-[500px]">
                   <div className="space-y-4">
                      {supportTickets.map(ticket => (
                        <div key={ticket.id} className="p-5 bg-zinc-900/50 rounded-xl border border-white/5 flex flex-col gap-4 shadow-sm hover:border-white/10 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-bold text-white text-lg leading-tight">{ticket.subject}</h5>
                              <p className="text-xs text-zinc-400 mt-1 font-medium">From: {ticket.customer_email}</p>
                            </div>
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full uppercase tracking-wider border ${ticket.status === 'open' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                              {ticket.status}
                            </span>
                          </div>
                          <div className="bg-black/40 p-4 rounded-lg border border-white/5">
                            <p className="text-sm text-zinc-300 leading-relaxed">{ticket.message}</p>
                          </div>
                          {ticket.ai_response && (
                            <div className="mt-2 pl-4 border-l-2 border-violet-500/50 bg-violet-500/5 p-4 rounded-r-lg">
                              <p className="text-xs text-violet-400 font-bold mb-2 uppercase tracking-wider flex items-center gap-1.5"><Zap className="w-3.5 h-3.5"/> AI Agent Response</p>
                              <p className="text-sm text-zinc-200 leading-relaxed">{ticket.ai_response}</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {supportTickets.length === 0 && <div className="text-zinc-500 text-sm text-center py-16 flex flex-col items-center gap-3"><CheckCircle className="w-8 h-8 opacity-20"/> Inbox zero. No active tickets.</div>}
                   </div>
                </div>
              </motion.div>
            )}

            {/* TAB: MENTORS */}
            {activeTab === 'mentors' && (
              <motion.div 
                key="mentors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Advisory Board</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Domain experts and specialized agent nodes</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {domainExperts.map((expert) => (
                    <motion.div 
                      key={expert.id} 
                      className="glass-panel-interactive p-6 relative group overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-amber-500/20 transition-colors" />
                      
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 flex items-center justify-center mb-5 border border-amber-500/30 shadow-inner">
                        <Lightbulb className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-white text-xl mb-1 tracking-tight">{expert.name}</h4>
                      <p className="text-xs text-amber-400/80 font-mono mb-4 bg-amber-500/10 inline-block px-2 py-0.5 rounded">{expert.domain}</p>
                      <div className="text-sm text-zinc-400 line-clamp-4 leading-relaxed font-medium bg-black/30 p-3 rounded-lg border border-white/5">
                        {expert.instructions}
                      </div>
                    </motion.div>
                  ))}
                  {domainExperts.length === 0 && (
                    <div className="col-span-full py-16 text-center text-zinc-500 glass-panel flex flex-col items-center gap-4">
                      <Lightbulb className="w-8 h-8 opacity-20" />
                      <p className="font-medium text-sm">No domain experts configured for this workspace.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB: AGENT MESH */}
            {activeTab === 'agents' && (
              <motion.div 
                key="agents"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Agent Topology</h3>
                    <p className="text-zinc-400 mt-1 font-medium">Manage active autonomous nodes</p>
                  </div>
                  <button 
                    onClick={() => setIsCloningAgent(true)}
                    className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
                  >
                    <Plus className="w-4 h-4" /> Clone Agent
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map((agent) => (
                    <motion.div 
                      layoutId={`agent-${agent.id}`}
                      key={agent.id} 
                      className="glass-panel-interactive p-6 relative group overflow-hidden"
                    >
                      {agent.status === 'working' && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500 animate-[pulse_2s_ease-in-out_infinite]" />
                      )}
                      
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner ${
                             agent.status === 'working' ? 'bg-violet-500/20 text-violet-400' : 'bg-black/50 text-zinc-400 border border-white/5'
                           }`}>
                             {agent.status === 'working' ? <Zap className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                           </div>
                           <div>
                             <h4 className="font-bold text-white text-lg leading-tight">{agent.name}</h4>
                             <p className="text-xs text-zinc-500 font-mono mt-0.5">{agent.id}</p>
                           </div>
                        </div>
                      </div>

                      <div className="mb-5 text-sm text-zinc-400 line-clamp-3 leading-relaxed">
                        {agent.system_prompt}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${
                          agent.status === 'working' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 
                          agent.status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 
                          'bg-black/50 text-zinc-400 border border-white/5'
                        }`}>
                          {agent.status === 'working' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shadow-[0_0_5px_#60a5fa]" />}
                          {agent.status}
                        </span>
                        
                        {agent.last_active && (
                          <span className="text-xs text-zinc-500 font-medium">
                            {new Date(agent.last_active).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* TAB: VAULT */}
            {activeTab === 'vault' && (
              <motion.div 
                key="vault"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-panel p-8"
              >
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-violet-400" />
                      Knowledge Vault
                    </h3>
                    <p className="text-zinc-400 text-sm mt-1 font-medium">Background context injected into Agent RAG retrieval.</p>
                  </div>
                  <button 
                    onClick={() => isEditingVault ? handleSaveVault() : setIsEditingVault(true)}
                    className={`px-5 py-2.5 rounded-lg font-semibold transition-all shadow-sm ${
                      isEditingVault ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20' : 'bg-white/10 hover:bg-white/20 text-white border border-white/5'
                    }`}
                  >
                    {isEditingVault ? 'Save Context' : 'Edit Context'}
                  </button>
                </div>
                
                {isEditingVault ? (
                  <textarea 
                    value={vaultContext}
                    onChange={(e) => setVaultContext(e.target.value)}
                    className="w-full h-[500px] bg-black/60 text-zinc-200 p-6 rounded-xl border border-violet-500/40 focus:outline-none focus:border-violet-500 font-mono text-sm leading-relaxed shadow-inner"
                    placeholder="Enter context, brand guidelines, or knowledge here..."
                  />
                ) : (
                  <div className="w-full min-h-[500px] bg-black/40 text-zinc-300 p-6 rounded-xl border border-white/5 whitespace-pre-wrap font-mono text-sm leading-relaxed shadow-inner overflow-y-auto">
                    {vaultContext || "Vault is currently empty."}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB: INVESTOR RELATIONS */}
            {activeTab === 'investors' && (
              <motion.div 
                key="investors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Briefcase className="w-6 h-6 text-emerald-400" />
                    Investor Relations
                  </h2>
                  <button 
                    onClick={handleTriggerOutreach}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-medium rounded-lg shadow-lg flex items-center gap-2 transition-all transform hover:scale-105"
                  >
                    <Mail className="w-4 h-4" />
                    Run Automated Outreach
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Data Grid */}
                  <div className="lg:col-span-2 glass-panel p-6 min-h-[400px]">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-400" />
                      Target Investors
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-300">
                            <th className="py-3 px-4 font-semibold text-sm">Name</th>
                            <th className="py-3 px-4 font-semibold text-sm">Firm</th>
                            <th className="py-3 px-4 font-semibold text-sm">Email</th>
                            <th className="py-3 px-4 font-semibold text-sm">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {investors.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-400">
                                No investors found.
                              </td>
                            </tr>
                          ) : investors.map((inv) => (
                            <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                              <td className="py-3 px-4">
                                <div className="font-medium text-white">{inv.name}</div>
                              </td>
                              <td className="py-3 px-4 text-slate-300">{inv.firm}</td>
                              <td className="py-3 px-4 text-slate-400 text-sm">{inv.email || '-'}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  inv.status === 'Contacted' ? 'bg-emerald-500/20 text-emerald-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Upload Tool */}
                  <div className="glass-panel p-6 flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Upload className="w-5 h-5 text-purple-400" />
                      Bulk Import Leads
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Paste CSV data here. Headers must be: <code className="text-emerald-400 bg-white/10 px-1 py-0.5 rounded">name,firm,email,notes</code>
                    </p>
                    <textarea 
                      value={csvInput}
                      onChange={(e) => setCsvInput(e.target.value)}
                      placeholder="name,firm,email,notes&#10;Marc Andreessen,a16z,marc@a16z.com,AI Enthusiast"
                      className="w-full h-48 bg-black/40 border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4 font-mono text-sm resize-none"
                    />
                    <button 
                      onClick={handleUploadInvestors}
                      className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Import Investors
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB: LOGS */}
            {activeTab === 'logs' && (
              <motion.div 
                key="logs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-panel p-6 h-[700px] flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    System Logs
                  </h3>
                  <input 
                    type="text" 
                    placeholder="Filter logs..." 
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="bg-black/60 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm focus:outline-none focus:border-emerald-500/50 w-64 shadow-inner"
                  />
                </div>
                
                <div className="flex-1 bg-black/80 rounded-xl border border-white/5 p-4 overflow-y-auto font-mono text-xs space-y-1.5 custom-scrollbar shadow-inner">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="flex gap-4 p-2 hover:bg-white/5 rounded-lg border-l-2 border-transparent hover:border-emerald-500/50 transition-colors">
                      <span className="text-zinc-500 shrink-0">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                      <span className="text-emerald-500 shrink-0 font-bold w-32 truncate">{log.agent_id}</span>
                      <span className="text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">{log.message}</span>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && (
                    <div className="text-zinc-500 text-center mt-20 font-sans font-medium text-sm">No logs found.</div>
                  )}
                </div>
              </motion.div>
            )}
            
          </AnimatePresence>
        </div>
      </main>


      {/* Command Palette */}
      <AnimatePresence>
        {isCmdkOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4"
            onClick={() => setIsCmdkOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center px-4 py-3 border-b border-white/5">
                <Search className="w-5 h-5 text-zinc-500 mr-3" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Type a command or search..."
                  value={cmdkQuery}
                  onChange={e => setCmdkQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-white w-full text-lg placeholder:text-zinc-500"
                />
                <div className="flex gap-1 ml-3">
                  <kbd className="bg-white/10 border border-white/5 px-2 py-1 rounded text-xs text-zinc-400 font-mono">esc</kbd>
                </div>
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                {filteredTabs.length > 0 && <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Navigation</div>}
                {filteredTabs.map(tab => (
                  <button key={tab.id} onClick={() => {setActiveTab(tab.id); setIsCmdkOpen(false)}} className="w-full flex items-center px-3 py-3 hover:bg-white/5 rounded-xl text-left transition-colors group">
                    <tab.icon className="w-4 h-4 text-zinc-400 group-hover:text-violet-400 mr-3" />
                    <span className="text-zinc-300 group-hover:text-white">Go to {tab.label}</span>
                  </button>
                ))}
                
                {filteredAgents.length > 0 && <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-2">Agents</div>}
                {filteredAgents.map(agent => (
                  <button key={agent.id} onClick={() => {setSelectedAgent(agent.id); setActiveTab('dashboard'); setIsCmdkOpen(false)}} className="w-full flex items-center px-3 py-3 hover:bg-white/5 rounded-xl text-left transition-colors group">
                    <Terminal className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 mr-3" />
                    <span className="text-zinc-300 group-hover:text-white">Select {agent.name}</span>
                  </button>
                ))}

                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-2">Actions</div>
                <button onClick={() => {setIsSettingsModalOpen(true); setIsCmdkOpen(false)}} className="w-full flex items-center px-3 py-3 hover:bg-white/5 rounded-xl text-left transition-colors group">
                  <Settings className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400 mr-3" />
                  <span className="text-zinc-300 group-hover:text-white">Open Settings</span>
                </button>
                <button onClick={() => {setIsCreateOrgModalOpen(true); setIsCmdkOpen(false)}} className="w-full flex items-center px-3 py-3 hover:bg-white/5 rounded-xl text-left transition-colors group">
                  <Plus className="w-4 h-4 text-zinc-400 group-hover:text-violet-400 mr-3" />
                  <span className="text-zinc-300 group-hover:text-white">Create Workspace</span>
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Create Org Modal */}
      <AnimatePresence>
        {isCreateOrgModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="glass-panel p-8 w-full max-w-md shadow-2xl border border-white/10"
             >
               <h3 className="text-xl font-bold text-white mb-6">Create New Workspace</h3>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2">Workspace Name</label>
                   <input 
                     type="text" 
                     placeholder="e.g. Global Enterprises" 
                     value={newOrgName}
                     onChange={(e) => setNewOrgName(e.target.value)}
                     className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-violet-500/50"
                   />
                 </div>
                 <div className="flex gap-3 pt-4">
                   <button onClick={() => setIsCreateOrgModalOpen(false)} className="flex-1 px-4 py-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-white font-medium">Cancel</button>
                   <button onClick={handleCreateOrg} className="flex-1 bg-violet-600 hover:bg-violet-500 text-white px-4 py-3 rounded-lg transition-colors font-medium">Create</button>
                 </div>
               </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Account Modal */}
      <AnimatePresence>
        {isAddingAccount && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="glass-panel p-8 w-full max-w-md shadow-2xl border border-white/10"
             >
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-white">Link Account</h3>
                 <button onClick={() => setIsAddingAccount(false)} className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2">Platform</label>
                   <select 
                     value={newAccountPlatform}
                     onChange={(e) => setNewAccountPlatform(e.target.value)}
                     className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-violet-500/50 appearance-none"
                   >
                     <option value="twitter" className="bg-zinc-900">X / Twitter</option>
                     <option value="linkedin" className="bg-zinc-900">LinkedIn</option>
                     <option value="instagram" className="bg-zinc-900">Instagram</option>
                     <option value="medium" className="bg-zinc-900">Medium</option>
                     <option value="reddit" className="bg-zinc-900">Reddit</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2">Account Name</label>
                   <input 
                     type="text" 
                     placeholder="@username" 
                     value={newAccountName}
                     onChange={(e) => setNewAccountName(e.target.value)}
                     className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-violet-500/50"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2">Access Token / API Key</label>
                   <input 
                     type="password" 
                     placeholder="sk-..." 
                     value={newAccountToken}
                     onChange={(e) => setNewAccountToken(e.target.value)}
                     className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-violet-500/50"
                   />
                 </div>
                 
                 {newAccountPlatform === 'twitter' ? (
                   <div className="pt-2">
                     <button onClick={handleTwitterLogin} className="w-full bg-black border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 text-white font-bold py-3.5 rounded-xl transition-all mb-4 flex items-center justify-center gap-2">
                       <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.007 3.978H5.039z"></path></svg>
                       Sign in directly with X
                     </button>
                     <div className="text-center text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">Or enter token manually</div>
                     <button onClick={handleAddAccount} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-violet-900/20">Link Platform</button>
                   </div>
                 ) : (
                   <button onClick={handleAddAccount} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-xl transition-colors mt-4 shadow-lg shadow-violet-900/20">Link Platform</button>
                 )}
               </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal (Overlay) */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
             <motion.div 
               initial={{ scale: 0.95, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 20 }}
               className="glass-panel p-8 w-full max-w-2xl shadow-2xl border border-white/10"
             >
               <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                 <h3 className="text-xl font-bold text-white flex items-center gap-2">
                   <Settings className="w-5 h-5 text-zinc-400" />
                   Global Configuration
                 </h3>
                 <button onClick={() => setIsSettingsModalOpen(false)} className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="space-y-6">
                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
                     <Lock className="w-4 h-4 text-emerald-400" />
                     OpenRouter API Key
                   </label>
                   <input 
                     type="password" 
                     value={settingsData.openrouter_api_key || ""}
                     onChange={(e) => setSettingsData({...settingsData, openrouter_api_key: e.target.value})}
                     className="w-full bg-black/60 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
                     placeholder="sk-or-v1-..."
                   />
                   <p className="text-xs text-zinc-500 mt-2.5 flex items-center gap-1 font-medium">
                     <Shield className="w-3.5 h-3.5 text-emerald-500" /> Encrypted locally via Electron safeStorage
                   </p>
                 </div>

                 <div>
                   <label className="block text-sm font-semibold text-zinc-300 mb-2">Model Preference</label>
                   <input 
                     type="text" 
                     value={settingsData.default_model || ""}
                     onChange={(e) => setSettingsData({...settingsData, default_model: e.target.value})}
                     className="w-full bg-black/60 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
                     placeholder="e.g. google/gemini-2.5-pro"
                   />
                 </div>

                 <button 
                   onClick={handleSaveSettings}
                   className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)] mt-8"
                 >
                   Save Configuration
                 </button>
               </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clone Agent Modal */}
      <AnimatePresence>
        {isCloningAgent && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold text-white">Deploy New Agent</h3>
                <button onClick={() => setIsCloningAgent(false)} className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Agent ID <span className="text-zinc-500 font-normal">(lowercase, dashes)</span></label>
                  <input type="text" value={newAgentId} onChange={(e) => setNewAgentId(e.target.value)} className="w-full bg-black/60 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-violet-500 transition-colors shadow-inner" placeholder="e.g. data-analyst" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Display Name</label>
                  <input type="text" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} className="w-full bg-black/60 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-violet-500 transition-colors shadow-inner" placeholder="e.g. Data Analyst" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-300 mb-1.5">System Prompt / Persona</label>
                  <textarea value={newAgentSystemPrompt} onChange={(e) => setNewAgentSystemPrompt(e.target.value)} className="w-full h-32 bg-black/60 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-violet-500 transition-colors shadow-inner resize-none" placeholder="You are an expert data analyst..." />
                </div>
                <button onClick={handleCreateAgent} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-xl transition-colors mt-2 shadow-lg shadow-violet-900/20">
                  Initialize Agent
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-50 px-6 py-3.5 rounded-full flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] border ${
              toast.type === 'error' ? 'bg-red-950/90 text-red-400 border-red-500/30' : 'bg-emerald-950/90 text-emerald-400 border-emerald-500/30'
            } backdrop-blur-xl`}
          >
            {toast.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
            <span className="font-semibold text-sm tracking-wide">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
