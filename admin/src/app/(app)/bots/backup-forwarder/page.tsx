'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  HardDrive, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  Plus, CheckCircle2, ShieldCheck, ScrollText, Radio,
  Search, Users, Trash2, Folder, Film, Database,
  ArrowRight, Zap, Crown, Check, X, Sparkles, FolderCheck, MinusCircle, Globe,
  Loader2, Clock
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { TelegramDialog } from '@/lib/types';

// Deterministic color palette for Telegram-like channel avatars
const AVATAR_GRADIENTS = [
  'from-blue-600 to-indigo-700',
  'from-purple-600 to-pink-700',
  'from-emerald-600 to-teal-700',
  'from-amber-600 to-orange-700',
  'from-cyan-600 to-blue-700',
  'from-rose-600 to-red-700',
];

function getAvatarGradient(id: number): string {
  const hash = Math.abs(id) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[hash];
}

function getInitials(title: string): string {
  if (!title) return 'TG';
  const parts = title.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return title.slice(0, 2).toUpperCase();
}

export default function BackupForwarderDetailPage() {
  const botId = 'backup_forwarder';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingDialogs, setRefreshingDialogs] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [folderActionLoading, setFolderActionLoading] = useState<number | null>(null);

  // Search & Filter state - Default to 'live' to show real-time active channels
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'videodb' | 'teradb' | 'publichub' | 'unassigned' | 'admin' | 'all'>('live');

  // Bot Stop/Restart Confirm state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  // Clear legacy mappings state
  const [clearingLegacy, setClearingLegacy] = useState(false);
  const [cleaningFolders, setCleaningFolders] = useState(false);

  // Load all data
  const fetchData = async (forceRefreshTelegram: boolean = false) => {
    try {
      if (forceRefreshTelegram) setRefreshingDialogs(true);
      const [botData, dialogsData, jobsData, logsData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getTelegramDialogs(forceRefreshTelegram).catch(() => []),
        api.getForwardJobs().catch(() => []),
        api.getBotLogs(botId, 30).catch(() => []),
      ]);

      setBot(botData);
      setDialogs(dialogsData || []);
      setJobs(jobsData || []);
      setLogs(logsData || []);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
      setRefreshingDialogs(false);
    }
  };

  const autoSyncedRef = useRef(false);

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(false), 8000);
    return () => clearInterval(interval);
  }, []);

  // When bot is online and live channels is 0, auto-sync from Telegram once
  useEffect(() => {
    if (bot && bot.is_running && !autoSyncedRef.current) {
      const hasLive = dialogs.some((d) => d.is_live);
      if (!hasLive) {
        autoSyncedRef.current = true;
        fetchData(true);
      }
    }
  }, [bot, dialogs]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await api.startBot(botId);
      toast('success', 'Backup Forwarder userbot started');
      await fetchData(true);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmedBotAction = async () => {
    setConfirmOpen(false);
    setActionLoading(true);
    try {
      if (confirmAction === 'stop') {
        await api.stopBot(botId);
        toast('info', 'Backup Forwarder stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'Backup Forwarder restarted');
      }
      await fetchData(true);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Bot action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Re-sync Past Messages
  const handleResync = async (sourceId: number, sourceTitle: string) => {
    try {
      await api.syncTelegramHistory(sourceId);
      toast('success', `History sync job started for ${sourceTitle}!`);
      await fetchData(false);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to launch history sync');
    }
  };

  // Stop active bulk job
  const handleStopJob = async (jobId: string) => {
    try {
      await api.stopForwardJob(jobId);
      toast('info', `Job ${jobId} stopped`);
      await fetchData(false);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to stop job');
    }
  };



  // Assign channel to a Telegram Folder (Folder 5 videoDB, Folder 6 TeraDB, or Folder 4 public hub)
  const handleAssignFolder = async (chatId: number, folderId: number, folderName: string) => {
    setFolderActionLoading(chatId);
    try {
      const res = await api.addChannelToFolder(chatId, folderId);
      if (res.success) {
        const targetDesc = folderId === 5 ? 'DBXVideos' : folderId === 6 ? 'DBXTera' : 'public hub';
        toast('success', `Added to ${folderName}! Target: ${targetDesc}`);
        await fetchData(true);
      } else {
        toast('error', res.error || `Failed to add to ${folderName}`);
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFolderActionLoading(null);
    }
  };

  // Remove channel from Telegram Folder
  const handleRemoveFolder = async (chatId: number, folderId: number, folderName: string) => {
    setFolderActionLoading(chatId);
    try {
      const res = await api.removeChannelFromFolder(chatId, folderId);
      if (res.success) {
        toast('info', `Removed from ${folderName}`);
        await fetchData(true);
      } else {
        toast('error', res.error || `Failed to remove from ${folderName}`);
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setFolderActionLoading(null);
    }
  };

  // Clean extra folders and keep only videoDB, TeraDB, and public hub
  const handleCleanupFolders = async () => {
    setCleaningFolders(true);
    try {
      const res = await api.cleanupTelegramFoldersToThree();
      if (res.success) {
        toast('success', res.message || 'Kept videoDB, TeraDB, and public hub! Removed extra folders.');
        await fetchData(true);
      } else {
        toast('error', res.error || 'Failed to cleanup folders');
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to cleanup folders');
    } finally {
      setCleaningFolders(false);
    }
  };

  // Clear all old database mappings
  const handleClearLegacyMappings = async () => {
    setClearingLegacy(true);
    try {
      const res = await api.clearAllMappings();
      toast('success', `Cleared ${res.deleted_count} old database mappings!`);
      await fetchData(true);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to clear old mappings');
    } finally {
      setClearingLegacy(false);
    }
  };

  // Folder-based Counts
  const liveCount = useMemo(() => dialogs.filter((d) => d.is_live !== false).length, [dialogs]);
  const videoDBCount = useMemo(() => dialogs.filter((d) => d.folder_id === 5 && d.is_live !== false).length, [dialogs]);
  const teraDBCount = useMemo(() => dialogs.filter((d) => d.folder_id === 6 && d.is_live !== false).length, [dialogs]);
  const publicHubCount = useMemo(() => dialogs.filter((d) => d.folder_id === 4 && d.is_live !== false).length, [dialogs]);
  const unassignedCount = useMemo(() => dialogs.filter((d) => !d.folder_id && d.is_live !== false).length, [dialogs]);
  const adminCount = useMemo(() => dialogs.filter((d) => d.is_admin && d.is_live !== false).length, [dialogs]);

  // Filter dialogs for main list
  const filteredDialogs = useMemo(() => {
    return dialogs.filter((d) => {
      // Tab filter
      if (activeTab === 'live' && d.is_live === false) return false;
      if (activeTab === 'videodb' && (d.folder_id !== 5 || d.is_live === false)) return false;
      if (activeTab === 'teradb' && (d.folder_id !== 6 || d.is_live === false)) return false;
      if (activeTab === 'publichub' && (d.folder_id !== 4 || d.is_live === false)) return false;
      if (activeTab === 'unassigned' && (d.folder_id || d.is_live === false)) return false;
      if (activeTab === 'admin' && (!d.is_admin || d.is_live === false)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = d.title.toLowerCase().includes(q);
        const idMatch = d.id.toString().includes(q);
        const userMatch = d.username ? d.username.toLowerCase().includes(q) : false;
        const targetMatch = d.target_name ? d.target_name.toLowerCase().includes(q) : false;
        const folderMatch = d.folder_name ? d.folder_name.toLowerCase().includes(q) : false;
        return titleMatch || idMatch || userMatch || targetMatch || folderMatch;
      }
      return true;
    });
  }, [dialogs, activeTab, searchQuery]);

  if (loading) return <LoadingState message="Loading Telegram channels & folder routing..." />;

  const isRunning = Boolean(bot?.is_running);
  const runningJobs = jobs.filter((j) => j.status === 'running');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back Link */}
      <Link
        href="/bots"
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Bot Cluster
      </Link>

      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400">
            <HardDrive className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">Folder-Based Forwarding Router</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Target channels are automatically determined by Telegram Folders (<code className="text-blue-300">@ganeshmrxx</code>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isRunning ? (
            <>
              <button
                onClick={() => {
                  setConfirmAction('restart');
                  setConfirmOpen(true);
                }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                Restart Userbot
              </button>
              <button
                onClick={() => {
                  setConfirmAction('stop');
                  setConfirmOpen(true);
                }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              Start Userbot
            </button>
          )}

          <button
            onClick={() => fetchData(true)}
            disabled={refreshingDialogs}
            title="Perform live real-time query to Telegram servers"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#1f2937] text-gray-300 hover:text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingDialogs ? 'animate-spin text-blue-400' : ''}`} />
            <span>Live Telegram Sync</span>
          </button>

          <button
            onClick={handleCleanupFolders}
            disabled={cleaningFolders}
            title="Keep only videoDB, TeraDB, and public hub. Delete all other Telegram folders."
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 hover:bg-teal-500/20 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <FolderCheck className={`w-3.5 h-3.5 ${cleaningFolders ? 'animate-spin' : ''}`} />
            <span>{cleaningFolders ? 'Cleaning...' : 'Clean Extra Folders (Keep 3)'}</span>
          </button>

          <button
            onClick={handleClearLegacyMappings}
            disabled={clearingLegacy}
            title="Remove all legacy per-channel database records from MongoDB"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-400" />
            <span>{clearingLegacy ? 'Clearing...' : 'Clear Old DB Mappings'}</span>
          </button>
        </div>
      </div>

      {/* Target Routing Rule Explainer Banner */}
      <div className="bg-gradient-to-r from-blue-900/20 via-indigo-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 flex-shrink-0">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">
              100% Automatic Telegram Folder Forwarder & Auto-History Sync Active
            </h4>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Channels in <strong className="text-blue-300">videoDB (Folder 5)</strong> auto-forward all past media & live posts to <strong className="text-emerald-400">DBXVideos (-1004401442087)</strong>. Channels in <strong className="text-amber-300">TeraDB (Folder 6)</strong> auto-forward to <strong className="text-amber-400">DBXTera (-1004337870091)</strong>. Past messages are synced automatically in the background — no manual clicking needed!
            </p>
          </div>
        </div>

        <Link
          href="/forwarding"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition-colors whitespace-nowrap"
        >
          <span>Universal Forwarder Monitor</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-3.5">
          <p className="text-xs text-gray-400">Total Live Channels</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-white">{liveCount}</span>
            <span className="text-[10px] text-emerald-400 font-medium">Real-Time</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Active in Telegram</p>
        </div>

        <div className="bg-[#111827] border border-blue-500/30 rounded-xl p-3.5 bg-blue-950/10">
          <div className="flex items-center justify-between">
            <p className="text-xs text-blue-300 font-medium">videoDB (Folder 5)</p>
            <Film className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-blue-400">{videoDBCount}</span>
            <span className="text-[10px] text-gray-400">➔ DBXVideos</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Target: -1004401442087</p>
        </div>

        <div className="bg-[#111827] border border-amber-500/30 rounded-xl p-3.5 bg-amber-950/10">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-300 font-medium">TeraDB (Folder 6)</p>
            <Database className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-amber-400">{teraDBCount}</span>
            <span className="text-[10px] text-gray-400">➔ DBXTera</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Target: -1004337870091</p>
        </div>

        <div className="bg-[#111827] border border-teal-500/30 rounded-xl p-3.5 bg-teal-950/10">
          <div className="flex items-center justify-between">
            <p className="text-xs text-teal-300 font-medium">TARGEThub (Folder 4)</p>
            <Globe className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-teal-400">{publicHubCount}</span>
            <span className="text-[10px] text-gray-400">➔ TARGEThub</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Folder: TARGEThub</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Unassigned</p>
            <Folder className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-gray-300">{unassignedCount}</span>
            <span className="text-[10px] text-gray-500">Not in folder</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Assign via 1-click</p>
        </div>
      </div>

      {/* Active History Jobs Banner (if any running) */}
      {runningJobs.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
              <Zap className="w-4 h-4 animate-pulse" />
              Active History Forwarding in Progress ({runningJobs.length})
            </h3>
            <span className="text-xs text-gray-400">Replicating historical media</span>
          </div>
          <div className="space-y-2">
            {runningJobs.map((j) => (
              <div
                key={j.job_id as string}
                className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 flex items-center justify-between gap-4 text-xs font-mono"
              >
                <div>
                  <span className="text-gray-400">Job {j.job_id as string}:</span>{' '}
                  <span className="text-white font-bold">{j.source_id as number}</span> ➔{' '}
                  <span className="text-emerald-400 font-bold">{j.target_id as number}</span>
                  <span className="ml-3 text-gray-400">
                    Copied: <strong className="text-green-400">{j.processed as number}</strong> | Skipped:{' '}
                    {j.skipped as number}
                  </span>
                </div>
                <button
                  onClick={() => handleStopJob(j.job_id as string)}
                  className="px-2.5 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[11px] font-medium transition-colors"
                >
                  Stop Job
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telegram Channel Router Main Area */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-4">
        {/* Search & Tabs Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] border border-[#1f2937] rounded-lg text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setActiveTab('live')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'live' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live Channels ({liveCount})
            </button>

            <button
              onClick={() => setActiveTab('videodb')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'videodb' ? 'bg-blue-600/80 text-white border border-blue-500/40' : 'text-blue-400 hover:text-white'
              }`}
            >
              <Film className="w-3 h-3" />
              videoDB ({videoDBCount})
            </button>

            <button
              onClick={() => setActiveTab('teradb')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'teradb' ? 'bg-amber-600/80 text-white border border-amber-500/40' : 'text-amber-400 hover:text-white'
              }`}
            >
              <Database className="w-3 h-3" />
              TeraDB ({teraDBCount})
            </button>

            <button
              onClick={() => setActiveTab('publichub')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'publichub' ? 'bg-teal-600/80 text-white border border-teal-500/40' : 'text-teal-400 hover:text-white'
              }`}
            >
              <Globe className="w-3 h-3" />
              TARGEThub ({publicHubCount})
            </button>

            <button
              onClick={() => setActiveTab('unassigned')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'unassigned' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Unassigned ({unassignedCount})
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'admin' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Crown className="w-3 h-3 text-amber-300" />
              My Admin Targets ({adminCount})
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'all' ? 'bg-[#1f2937] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              All ({dialogs.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, ID, @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Telegram Channels List */}
        {filteredDialogs.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs">
            <Radio className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            <p>No Telegram channels matched your filter</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredDialogs.map((channel) => {
              const gradient = getAvatarGradient(channel.id);
              const initials = getInitials(channel.title);
              const isLive = channel.is_live !== false;
              const isFolder5 = channel.folder_id === 5;
              const isFolder6 = channel.folder_id === 6;
              const isFolder4 = channel.folder_id === 4;
              const isBusy = folderActionLoading === channel.id;

              return (
                <div
                  key={channel.id}
                  className={`bg-[#0d1117] border rounded-xl p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isFolder5
                      ? 'border-blue-500/40 bg-blue-950/10 hover:border-blue-500/60'
                      : isFolder6
                      ? 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/60'
                      : isFolder4
                      ? 'border-teal-500/40 bg-teal-950/10 hover:border-teal-500/60'
                      : 'border-[#1f2937] hover:border-gray-700'
                  }`}
                >
                  {/* Left: Channel Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Telegram Avatar */}
                    <div
                      className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0 select-none`}
                    >
                      {initials}
                    </div>

                    {/* Title & Metadata */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white truncate max-w-[280px] sm:max-w-md">
                          {channel.title}
                        </h3>

                        {/* Real-time Status Badge */}
                        {isLive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Live on Telegram
                          </span>
                        )}

                        {/* Role / Type Badge */}
                        {channel.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            <Crown className="w-2.5 h-2.5 text-amber-300" />
                            Admin / Owner
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400">
                            Member
                          </span>
                        )}

                        <span className="text-[10px] uppercase tracking-wider text-gray-500">
                          {channel.type}
                        </span>
                      </div>

                      {/* ID and Handle */}
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 font-mono flex-wrap">
                        <span>ID: <code className="text-gray-300">{channel.id}</code></span>
                        {channel.username && (
                          <span className="text-blue-400 font-sans">@{channel.username}</span>
                        )}
                        {channel.members_count && (
                          <span className="text-gray-500 font-sans flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {channel.members_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Folder-Based Target Status & 1-Click Action Buttons */}
                  <div className="flex items-center justify-between md:justify-end gap-2.5 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1f2937]/50 flex-wrap">
                    {isFolder5 ? (
                      /* videoDB (Folder 5) Active State */
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="bg-[#111827] border border-blue-500/40 rounded-lg px-3 py-1.5 text-xs text-left">
                          <div className="flex items-center gap-1.5 text-blue-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            📁 videoDB ➔ DBXVideos
                          </div>
                          <div className="text-[11px] text-gray-400">Target: -1004401442087</div>
                        </div>

                        {channel.sync_status === 'syncing' ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Syncing ({channel.sync_processed || 0})</span>
                          </div>
                        ) : channel.sync_status === 'completed' ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Past Synced ({channel.sync_processed || 0})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Auto-Sync Queued</span>
                          </div>
                        )}

                        <button
                          onClick={() => handleResync(channel.id, channel.title)}
                          title="Force re-sync past messages"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Re-Sync</span>
                        </button>

                        <button
                          onClick={() => handleRemoveFolder(channel.id, 5, 'videoDB')}
                          disabled={isBusy}
                          title="Remove from videoDB folder"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ) : isFolder6 ? (
                      /* TeraDB (Folder 6) Active State */
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="bg-[#111827] border border-amber-500/40 rounded-lg px-3 py-1.5 text-xs text-left">
                          <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            📦 TeraDB ➔ DBXTera
                          </div>
                          <div className="text-[11px] text-gray-400">Target: -1004337870091</div>
                        </div>

                        {channel.sync_status === 'syncing' ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Syncing ({channel.sync_processed || 0})</span>
                          </div>
                        ) : channel.sync_status === 'completed' ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Past Synced ({channel.sync_processed || 0})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Auto-Sync Queued</span>
                          </div>
                        )}

                        <button
                          onClick={() => handleResync(channel.id, channel.title)}
                          title="Force re-sync past messages"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Re-Sync</span>
                        </button>

                        <button
                          onClick={() => handleRemoveFolder(channel.id, 6, 'TeraDB')}
                          disabled={isBusy}
                          title="Remove from TeraDB folder"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ) : isFolder4 ? (
                      /* TARGEThub (Folder 4) Active State */
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="bg-[#111827] border border-teal-500/40 rounded-lg px-3 py-1.5 text-xs text-left">
                          <div className="flex items-center gap-1.5 text-teal-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                            🎯 TARGEThub
                          </div>
                          <div className="text-[11px] text-gray-400">Folder: TARGEThub</div>
                        </div>

                        <button
                          onClick={() => handleResync(channel.id, channel.title)}
                          title="Re-forward past messages"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Sync Past</span>
                        </button>

                        <button
                          onClick={() => handleRemoveFolder(channel.id, 4, 'TARGEThub')}
                          disabled={isBusy}
                          title="Remove from TARGEThub folder"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ) : (
                      /* Unassigned Channel: Quick 1-Click Assign to videoDB, TeraDB, or TARGEThub */
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-gray-500 italic mr-1">Not in folder:</span>
                        <button
                          onClick={() => handleAssignFolder(channel.id, 5, 'videoDB')}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ videoDB</span>
                        </button>

                        <button
                          onClick={() => handleAssignFolder(channel.id, 6, 'TeraDB')}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ TeraDB</span>
                        </button>

                        <button
                          onClick={() => handleAssignFolder(channel.id, 4, 'TARGEThub')}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/30 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ TARGEThub</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bot Stop/Restart Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction === 'stop' ? 'Stop Backup Forwarder?' : 'Restart Backup Forwarder?'}
        message={
          confirmAction === 'stop'
            ? 'Stopping this userbot will disable real-time forwarding event listeners and bulk replication.'
            : 'Restarting will reconnect the Pyrogram Session 2 client.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedBotAction}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            Backup Forwarder Logs
          </h2>
          <span className="text-[11px] text-gray-500 font-mono">Last 30 events</span>
        </div>

        <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No recent events recorded for this bot</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-gray-300">
                <span className="text-gray-500 text-[10px] flex-shrink-0">
                  {new Date(l.timestamp as string).toLocaleTimeString()}
                </span>
                <span
                  className={`text-[10px] uppercase font-bold flex-shrink-0 ${
                    l.level === 'ERROR'
                      ? 'text-red-400'
                      : l.level === 'WARNING'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}
                >
                  [{l.level as string}]
                </span>
                <span className="break-all">{l.message as string}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
