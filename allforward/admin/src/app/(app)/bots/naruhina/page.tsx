'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Film, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  Database, Radio, Search, CheckCircle2, AlertCircle, HardDrive,
  Key, Save, Eye, EyeOff, Copy, Sliders, Shield, Terminal,
  Check, RefreshCcw
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function NaruHinaDetailPage() {
  const botId = 'naruhina_bot';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<{
    indexed_movies_count: number;
    collection_name: string;
    stream_port: number;
    db_connected: boolean;
  } | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'control' | 'tokens' | 'search' | 'logs'>('control');

  // Config & Tokens state
  const [config, setConfig] = useState({
    BOT_TOKEN: '',
    API_ID: '27672711',
    API_HASH: '4e7aaf6a6b0ddcb00e05e9234e2e84dd',
    ADMINS: '',
    CHANNELS: '',
    LOG_CHANNEL: '',
    BIN_CHANNEL: '',
    DATABASE_URI: '',
    DATABASE_NAME: 'Cluster0',
    COLLECTION_NAME: 'NovemberMovieData2',
    PORT: '8089',
    MULTI_TOKEN1: '',
    MULTI_TOKEN2: '',
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showDbUri, setShowDbUri] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Search sandbox state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    _id: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    channel_id?: string | number;
    message_id?: string | number;
  }>>([]);
  const [searching, setSearching] = useState(false);

  // Logs state
  const [logFilter, setLogFilter] = useState<'all' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  const fetchData = async () => {
    try {
      const [botData, statsData, logsData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getNaruHinaStats().catch(() => null),
        api.getBotLogs(botId, 60).catch(() => []),
      ]);
      setBot(botData);
      if (statsData) setStats(statsData);
      setLogs(logsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const data = await api.getNaruHinaConfig();
      if (data) {
        setConfig((prev) => ({
          ...prev,
          ...data,
        }));
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchConfig();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await api.startBot(botId);
      toast('success', 'NaruHina Filter Bot started successfully!');
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmedAction = async () => {
    setConfirmOpen(false);
    setActionLoading(true);
    try {
      if (confirmAction === 'stop') {
        await api.stopBot(botId);
        toast('info', 'NaruHina Filter Bot stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'NaruHina Filter Bot restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveConfig = async (restartAfter: boolean = false) => {
    setSavingConfig(true);
    try {
      await api.saveNaruHinaConfig(config);
      toast('success', 'Tokens & settings saved successfully!');
      if (restartAfter) {
        setActionLoading(true);
        await api.restartBot(botId);
        toast('success', 'Bot restarted with new configuration!');
        await fetchData();
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
      setActionLoading(false);
    }
  };

  const handleCopy = (text: string, keyName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    toast('info', `${keyName} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchNaruHinaMovies(searchQuery.trim(), 1, 15);
      setSearchResults(res.results || []);
      toast('success', `Found ${res.total} media item(s)`);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'error') return log.level === 'ERROR';
    return true;
  });

  if (loading) return <LoadingState message="Loading NaruHina Filter Bot controls..." />;

  const isRunning = Boolean(bot?.is_running);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111827] border border-[#1f2937] p-5 rounded-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/bots"
            className="p-2 bg-[#1f2937] hover:bg-[#374151] rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 shadow-lg shadow-pink-500/5">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">NaruHina Filter & Streaming Bot</h1>
              <StatusBadge status={isRunning ? 'running' : 'stopped'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Lucia Filter Core &bull; Auto Indexing &bull; Web Video Streaming &bull; Dual MongoDB
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchData(); fetchConfig(); }}
            disabled={refreshing}
            className="p-2.5 bg-[#1f2937] hover:bg-[#374151] rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh All"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {isRunning ? (
            <>
              <button
                onClick={() => { setConfirmAction('restart'); setConfirmOpen(true); }}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <RotateCw className="w-4 h-4" />
                Restart Bot
              </button>
              <button
                onClick={() => { setConfirmAction('stop'); setConfirmOpen(true); }}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                Stop Bot
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              Start Bot Now
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#1f2937] gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('control')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'control'
              ? 'border-pink-500 text-pink-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Overview & Controls
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'tokens'
              ? 'border-pink-500 text-pink-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Key className="w-4 h-4" />
          Bot Tokens & Configuration
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'search'
              ? 'border-pink-500 text-pink-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" />
          Database Search Sandbox
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-pink-500 text-pink-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Live Console Logs
          {logs.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-pink-500/20 text-pink-300">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: OVERVIEW & METRICS */}
      {activeTab === 'control' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 bg-[#111827] border border-[#1f2937] rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>Total Indexed Files</span>
                <Database className="w-4 h-4 text-pink-400" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-3">
                {stats ? stats.indexed_movies_count.toLocaleString() : '0'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Collection: {stats?.collection_name || 'NovemberMovieData2'}</p>
            </div>

            <div className="p-5 bg-[#111827] border border-[#1f2937] rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>Stream Server Port</span>
                <Radio className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-3xl font-extrabold text-white mt-3">
                {config.PORT || 8089}
              </p>
              <p className="text-xs text-gray-500 mt-1">Direct web video player engine</p>
            </div>

            <div className="p-5 bg-[#111827] border border-[#1f2937] rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>MongoDB Status</span>
                <HardDrive className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                {stats?.db_connected ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Atlas Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                    <AlertCircle className="w-3.5 h-3.5" /> Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 truncate">DB: {config.DATABASE_NAME || 'Cluster0'}</p>
            </div>

            <div className="p-5 bg-[#111827] border border-[#1f2937] rounded-xl relative overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 text-xs font-medium">
                <span>Process Status</span>
                <Film className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-lg font-bold text-white mt-3">
                {isRunning ? (
                  <span className="text-green-400">Online & Running</span>
                ) : (
                  <span className="text-gray-400">Offline</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1 truncate">
                Started: {bot?.started_at ? new Date(String(bot.started_at)).toLocaleTimeString() : 'Not Active'}
              </p>
            </div>
          </div>

          {/* Quick Config Summary Card */}
          <div className="p-5 bg-[#111827] border border-[#1f2937] rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Active Bot Configuration</h3>
                <p className="text-xs text-gray-400">Currently active tokens and channel bindings loaded in backend.</p>
              </div>
              <button
                onClick={() => setActiveTab('tokens')}
                className="px-3 py-1.5 bg-[#1f2937] hover:bg-[#374151] rounded-lg text-xs font-medium text-pink-400 transition-colors"
              >
                Edit All Tokens &rarr;
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg flex items-center justify-between">
                <span className="text-gray-400">Telegram Bot Token:</span>
                <span className="font-mono text-gray-200">
                  {config.BOT_TOKEN ? `${config.BOT_TOKEN.slice(0, 10)}...${config.BOT_TOKEN.slice(-4)}` : 'Not Set'}
                </span>
              </div>
              <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg flex items-center justify-between">
                <span className="text-gray-400">Indexed Channels:</span>
                <span className="font-mono text-gray-200 truncate max-w-[200px]" title={config.CHANNELS}>
                  {config.CHANNELS || 'None'}
                </span>
              </div>
              <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg flex items-center justify-between">
                <span className="text-gray-400">Admin User IDs:</span>
                <span className="font-mono text-gray-200">{config.ADMINS || 'None'}</span>
              </div>
              <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg flex items-center justify-between">
                <span className="text-gray-400">Log Channel:</span>
                <span className="font-mono text-gray-200">{config.LOG_CHANNEL || 'None'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BOT TOKENS & CONFIGURATION */}
      {activeTab === 'tokens' && (
        <div className="p-6 bg-[#111827] border border-[#1f2937] rounded-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1f2937] pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-pink-400" />
                Frontend Bot Token & Environment Editor
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Enter your Bot Father token, Telegram API credentials, and database settings here. Changes are saved and immediately available.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveConfig(false)}
                disabled={savingConfig}
                className="flex items-center gap-2 px-4 py-2 bg-[#1f2937] hover:bg-[#374151] text-white rounded-lg text-sm font-medium transition-colors border border-[#374151] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                onClick={() => handleSaveConfig(true)}
                disabled={savingConfig || actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-pink-600/20 disabled:opacity-50"
              >
                <RefreshCcw className="w-4 h-4" />
                Save & Restart Bot
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Telegram Bot Token */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-pink-400" />
                  Telegram BOT_TOKEN (Required from @BotFather)
                </span>
                <button
                  type="button"
                  onClick={() => setShowBotToken(!showBotToken)}
                  className="text-gray-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {showBotToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showBotToken ? 'Hide' : 'Show'}
                </button>
              </label>
              <div className="relative">
                <input
                  type={showBotToken ? 'text' : 'password'}
                  placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  value={config.BOT_TOKEN}
                  onChange={(e) => setConfig({ ...config, BOT_TOKEN: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2.5 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(config.BOT_TOKEN, 'BOT_TOKEN')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  title="Copy token"
                >
                  {copiedKey === 'BOT_TOKEN' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* API_ID */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Telegram API_ID (my.telegram.org)</label>
              <input
                type="text"
                placeholder="e.g. 27672711"
                value={config.API_ID}
                onChange={(e) => setConfig({ ...config, API_ID: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* API_HASH */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Telegram API_HASH</label>
              <input
                type="text"
                placeholder="e.g. 4e7aaf6a6b0ddcb00e05e9234e2e84dd"
                value={config.API_HASH}
                onChange={(e) => setConfig({ ...config, API_HASH: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* ADMINS */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Admin User IDs (Space separated)</label>
              <input
                type="text"
                placeholder="e.g. 6428461234 5821948123"
                value={config.ADMINS}
                onChange={(e) => setConfig({ ...config, ADMINS: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* CHANNELS */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Target Files Channels (Space separated IDs)</label>
              <input
                type="text"
                placeholder="e.g. -1002345678901 -1002987654321"
                value={config.CHANNELS}
                onChange={(e) => setConfig({ ...config, CHANNELS: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* LOG_CHANNEL */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">LOG_CHANNEL ID</label>
              <input
                type="text"
                placeholder="e.g. -1002456789012"
                value={config.LOG_CHANNEL}
                onChange={(e) => setConfig({ ...config, LOG_CHANNEL: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* BIN_CHANNEL */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">BIN_CHANNEL ID (for Streaming)</label>
              <input
                type="text"
                placeholder="e.g. -1002567890123"
                value={config.BIN_CHANNEL}
                onChange={(e) => setConfig({ ...config, BIN_CHANNEL: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* MongoDB DATABASE_URI */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                <span>MongoDB DATABASE_URI</span>
                <button
                  type="button"
                  onClick={() => setShowDbUri(!showDbUri)}
                  className="text-gray-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {showDbUri ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showDbUri ? 'Hide' : 'Show'}
                </button>
              </label>
              <input
                type={showDbUri ? 'text' : 'password'}
                placeholder="mongodb+srv://user:pass@cluster0.mongodb.net/?retryWrites=true&w=majority"
                value={config.DATABASE_URI}
                onChange={(e) => setConfig({ ...config, DATABASE_URI: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* DATABASE_NAME */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">DATABASE_NAME</label>
              <input
                type="text"
                value={config.DATABASE_NAME}
                onChange={(e) => setConfig({ ...config, DATABASE_NAME: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* COLLECTION_NAME */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">COLLECTION_NAME (Movie Data Table)</label>
              <input
                type="text"
                value={config.COLLECTION_NAME}
                onChange={(e) => setConfig({ ...config, COLLECTION_NAME: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* PORT */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Stream Web Server PORT</label>
              <input
                type="text"
                value={config.PORT}
                onChange={(e) => setConfig({ ...config, PORT: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>

            {/* MULTI_TOKEN1 (Optional) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">MULTI_TOKEN1 (Optional Stream Load Balancer)</label>
              <input
                type="text"
                placeholder="Optional second bot token"
                value={config.MULTI_TOKEN1 || ''}
                onChange={(e) => setConfig({ ...config, MULTI_TOKEN1: e.target.value })}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg px-4 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#1f2937] flex justify-end gap-3">
            <button
              onClick={() => handleSaveConfig(false)}
              disabled={savingConfig}
              className="px-5 py-2.5 bg-[#1f2937] hover:bg-[#374151] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {savingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              onClick={() => handleSaveConfig(true)}
              disabled={savingConfig || actionLoading}
              className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-pink-600/20 disabled:opacity-50"
            >
              Save & Restart Bot Now
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SEARCH SANDBOX */}
      {activeTab === 'search' && (
        <div className="p-6 bg-[#111827] border border-[#1f2937] rounded-xl space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-pink-400" />
              Database Movie Search Sandbox
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Query MongoDB collection <code className="text-pink-300">{stats?.collection_name || 'NovemberMovieData2'}</code> directly to verify search filters.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search movie title (e.g. Avatar, Inception, Naruto)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#374151] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="overflow-x-auto border border-[#1f2937] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1f2937]/50 text-gray-400 uppercase font-medium">
                  <tr>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3">File Size</th>
                    <th className="px-4 py-3">Channel ID</th>
                    <th className="px-4 py-3">Message ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937] text-gray-300">
                  {searchResults.map((item) => (
                    <tr key={item._id} className="hover:bg-[#1f2937]/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-white max-w-sm truncate" title={item.file_name}>
                        {item.file_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono">{formatBytes(item.file_size)}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{item.channel_id || '-'}</td>
                      <td className="px-4 py-3 font-mono text-gray-400">{item.message_id || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONSOLE LOGS */}
      {activeTab === 'logs' && (
        <div className="p-6 bg-[#111827] border border-[#1f2937] rounded-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-pink-400" />
                Live NaruHina Console Stream
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Real-time output stream from NaruHina bot background process.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as 'all' | 'error')}
                className="bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="all">All Logs ({logs.length})</option>
                <option value="error">Errors Only</option>
              </select>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  autoScroll
                    ? 'bg-pink-500/10 text-pink-400 border-pink-500/30'
                    : 'bg-[#1f2937] text-gray-400 border-transparent hover:text-white'
                }`}
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => {
                  const fullText = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
                  handleCopy(fullText, 'Console Logs');
                }}
                className="p-2 bg-[#1f2937] hover:bg-[#374151] rounded-lg text-gray-400 hover:text-white"
                title="Copy all logs"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="h-96 overflow-y-auto font-mono text-xs p-4 bg-[#0d1117] rounded-lg border border-[#1f2937] space-y-1.5 scrollbar-thin scrollbar-thumb-gray-800"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-gray-500 italic py-8 text-center">
                No logs recorded yet. Start the bot to begin streaming output.
              </p>
            ) : (
              filteredLogs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-600 select-none shrink-0">
                    {log.timestamp ? new Date(String(log.timestamp)).toLocaleTimeString() : ''}
                  </span>
                  <span
                    className={
                      log.level === 'ERROR'
                        ? 'text-red-400 font-semibold'
                        : log.level === 'WARNING'
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }
                  >
                    {String(log.message || '')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedAction}
        title={confirmAction === 'stop' ? 'Stop NaruHina Filter Bot?' : 'Restart NaruHina Filter Bot?'}
        message={`Are you sure you want to ${confirmAction} NaruHina Bot? Running filter queries and streams may be briefly interrupted.`}
        confirmLabel={confirmAction === 'stop' ? 'Stop Process' : 'Restart Process'}
        variant={confirmAction === 'stop' ? 'danger' : 'warning'}
      />
    </div>
  );
}
