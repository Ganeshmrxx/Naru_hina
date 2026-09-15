'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  HardDrive, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  Plus, CheckCircle2, AlertCircle, ShieldCheck, ScrollText, Radio,
  ArrowRightLeft, ArrowRight, Search, Users, Edit3, Trash2,
  Send, Zap, Crown, Check, X, AlertTriangle, Sparkles
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
  const [xDataCount, setXDataCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshingDialogs, setRefreshingDialogs] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cleaningDead, setCleaningDead] = useState(false);

  // Search & Filter state - Default to 'live' to show real-time active channels
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'mapped' | 'admin' | 'dead' | 'all'>('live');

  // Target Selection Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<TelegramDialog | null>(null);
  const [targetSearch, setTargetSearch] = useState('');
  const [onlyAdminTargets, setOnlyAdminTargets] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [customTargetId, setCustomTargetId] = useState('');
  const [forwardHistory, setForwardHistory] = useState(true);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Unlink Confirm state
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinkSourceId, setUnlinkSourceId] = useState<number | null>(null);

  // Clean Dead Confirm state
  const [cleanDeadConfirmOpen, setCleanDeadConfirmOpen] = useState(false);

  // Bot Stop/Restart Confirm state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  // Load all data
  const fetchData = async (forceRefreshTelegram: boolean = false) => {
    try {
      if (forceRefreshTelegram) setRefreshingDialogs(true);
      const [botData, dialogsData, jobsData, logsData, dbData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getTelegramDialogs(forceRefreshTelegram).catch(() => []),
        api.getForwardJobs().catch(() => []),
        api.getBotLogs(botId, 30).catch(() => []),
        api.getDatabaseStatus().catch(() => null),
      ]);

      setBot(botData);
      setDialogs(dialogsData || []);
      setJobs(jobsData || []);
      setLogs(logsData || []);

      const clusterB = (dbData as Record<string, unknown>)?.cluster_b as Record<string, unknown> | undefined;
      const colls = clusterB?.collections as Record<string, { count: number }> | undefined;
      if (colls?.xData) {
        setXDataCount(colls.xData.count || 0);
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
      setRefreshingDialogs(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(false), 8000);
    return () => clearInterval(interval);
  }, []);

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

  // Open Target Selection Modal for a channel
  const openTargetModal = (sourceChannel: TelegramDialog) => {
    setSelectedSource(sourceChannel);
    setSelectedTargetId(sourceChannel.target_id || null);
    setCustomTargetId('');
    setTargetSearch('');
    setOnlyAdminTargets(true);
    setForwardHistory(true);
    setModalOpen(true);
  };

  // Submit Target Channel Selection
  const handleSaveTarget = async () => {
    if (!selectedSource) return;

    let targetId: number | null = selectedTargetId;
    let targetName = 'Target Channel';

    if (customTargetId.trim()) {
      const parsed = parseInt(customTargetId.trim());
      if (isNaN(parsed)) {
        toast('warning', 'Please enter a valid numeric Channel ID (e.g. -1001234567890)');
        return;
      }
      targetId = parsed;
      targetName = `Custom (${parsed})`;
    }

    if (!targetId) {
      toast('warning', 'Please select a target channel or enter a custom ID');
      return;
    }

    const matchedTarget = dialogs.find((d) => d.id === targetId);
    if (matchedTarget) {
      targetName = matchedTarget.title;
    }

    setModalSubmitting(true);
    try {
      await api.setTelegramTarget({
        source_id: selectedSource.id,
        source_name: selectedSource.title,
        target_id: targetId,
        target_name: targetName,
        forward_history: forwardHistory,
      });

      toast(
        'success',
        `Target set: ${selectedSource.title} -> ${targetName}.${
          forwardHistory ? ' Historical messages forwarding launched!' : ' Live forwarding active!'
        }`
      );

      setModalOpen(false);
      await fetchData(false);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to set target channel');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Unlink / Remove Mapping
  const handleUnlink = async () => {
    if (!unlinkSourceId) return;
    setUnlinkConfirmOpen(false);
    try {
      await api.removeTelegramTarget(unlinkSourceId);
      toast('info', 'Channel mapping unlinked. Live forwarding stopped for this channel.');
      await fetchData(false);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to remove target mapping');
    } finally {
      setUnlinkSourceId(null);
    }
  };

  // Clean Dead Channels
  const handleCleanDeadChannels = async () => {
    setCleanDeadConfirmOpen(false);
    setCleaningDead(true);
    try {
      const res = await api.cleanDeadChannels();
      toast('success', `Cleaned ${res.deleted_count} dead/stale channels from database!`);
      await fetchData(true);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to clean dead channels');
    } finally {
      setCleaningDead(false);
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

  // Counts
  const liveCount = useMemo(() => dialogs.filter((d) => d.is_live !== false).length, [dialogs]);
  const deadCount = useMemo(() => dialogs.filter((d) => d.is_live === false).length, [dialogs]);
  const mappedCount = useMemo(() => dialogs.filter((d) => d.is_mapped && d.is_live !== false).length, [dialogs]);
  const adminCount = useMemo(() => dialogs.filter((d) => d.is_admin && d.is_live !== false).length, [dialogs]);

  // Filter dialogs for main list
  const filteredDialogs = useMemo(() => {
    return dialogs.filter((d) => {
      // Tab filter
      if (activeTab === 'live' && d.is_live === false) return false;
      if (activeTab === 'mapped' && (!d.is_mapped || d.is_live === false)) return false;
      if (activeTab === 'admin' && (!d.is_admin || d.is_live === false)) return false;
      if (activeTab === 'dead' && d.is_live !== false) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = d.title.toLowerCase().includes(q);
        const idMatch = d.id.toString().includes(q);
        const userMatch = d.username ? d.username.toLowerCase().includes(q) : false;
        const targetMatch = d.target_name ? d.target_name.toLowerCase().includes(q) : false;
        return titleMatch || idMatch || userMatch || targetMatch;
      }
      return true;
    });
  }, [dialogs, activeTab, searchQuery]);

  // Candidates for Target Selection Modal (Exclude dead channels)
  const candidateTargets = useMemo(() => {
    if (!selectedSource) return [];
    return dialogs.filter((d) => {
      // Cannot forward to oneself
      if (d.id === selectedSource.id) return false;
      // Do not allow dead channels as targets
      if (d.is_live === false) return false;
      // Filter by admin if toggled
      if (onlyAdminTargets && !d.is_admin) return false;
      // Search inside modal
      if (targetSearch.trim()) {
        const q = targetSearch.toLowerCase();
        const titleMatch = d.title.toLowerCase().includes(q);
        const idMatch = d.id.toString().includes(q);
        const userMatch = d.username ? d.username.toLowerCase().includes(q) : false;
        return titleMatch || idMatch || userMatch;
      }
      return true;
    });
  }, [dialogs, selectedSource, onlyAdminTargets, targetSearch]);

  if (loading) return <LoadingState message="Loading Telegram channels & routing setup..." />;

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
              <h1 className="text-xl font-bold text-white">Channel Forwarding Dashboard</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Live Telegram channel router powered by Backup Forwarder (<code className="text-blue-300">@ganeshmrxx</code>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Live Telegram Channels</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-white">{liveCount}</span>
            <span className="text-[10px] text-emerald-400 font-medium">Real-Time Verified</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Active in your account</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Active Forwarding Mappings</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-emerald-400">{mappedCount}</span>
            <span className="text-[10px] text-gray-400">Live</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Routing to targets in real-time</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">My Admin / Target Channels</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-mono font-bold text-purple-400">{adminCount}</span>
            <span className="text-[10px] text-amber-300 flex items-center gap-0.5">
              <Crown className="w-2.5 h-2.5" /> Owner
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Channels where you can post</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Dead / Left Channels</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-xl font-mono font-bold ${deadCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              {deadCount}
            </span>
            {deadCount > 0 && <span className="text-[10px] text-red-400">Stale in DB</span>}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Banned/deleted by Telegram</p>
        </div>
      </div>

      {/* Dead / Stale Channels Cleanup Banner */}
      {deadCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                {deadCount} Inaccessible / Dead Channels in MongoDB
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                These channels are saved in MongoDB mappings, but they are no longer in your Telegram account (deleted, banned, or you left them).
              </p>
            </div>
          </div>
          <button
            onClick={() => setCleanDeadConfirmOpen(true)}
            disabled={cleaningDead}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-medium transition-colors whitespace-nowrap shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {cleaningDead ? 'Cleaning...' : `Clean All ${deadCount} Dead Channels`}
          </button>
        </div>
      )}

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
              onClick={() => setActiveTab('mapped')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'mapped' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Active Forwarding ({mappedCount})
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
            {deadCount > 0 && (
              <button
                onClick={() => setActiveTab('dead')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'dead' ? 'bg-red-600 text-white' : 'text-red-400 hover:text-red-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Dead in Telegram ({deadCount})
              </button>
            )}
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

        {/* Telegram-style Channels List */}
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

              return (
                <div
                  key={channel.id}
                  className={`bg-[#0d1117] border rounded-xl p-4 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    !isLive
                      ? 'border-red-500/30 bg-red-950/10'
                      : channel.is_mapped
                      ? 'border-emerald-500/40 hover:border-emerald-500/60 bg-emerald-950/10'
                      : 'border-[#1f2937] hover:border-gray-700'
                  }`}
                >
                  {/* Left: Channel Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Telegram Avatar */}
                    <div
                      className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0 select-none opacity-${isLive ? '100' : '60'}`}
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
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Live on Telegram
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Dead / Left Telegram
                          </span>
                        )}

                        {/* Admin Badge */}
                        {channel.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <Crown className="w-2.5 h-2.5 text-amber-400" />
                            Admin / Owner
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400">
                            Member
                          </span>
                        )}

                        {/* Type Badge */}
                        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-[#111827] text-gray-400 border border-[#1f2937]">
                          {channel.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400 font-mono mt-1">
                        <span>ID: {channel.id}</span>
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

                  {/* Right: Target Status & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1f2937]/50">
                    {!isLive ? (
                      /* Dead Channel State */
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-red-400/80 italic">Channel inaccessible in Telegram</span>
                        <button
                          onClick={() => {
                            setUnlinkSourceId(channel.id);
                            setUnlinkConfirmOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Clean from DB
                        </button>
                      </div>
                    ) : channel.is_mapped ? (
                      /* Active Routing Box */
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <div className="bg-[#111827] border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs text-left">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Forwarding to:
                          </div>
                          <div className="text-white font-semibold truncate max-w-[180px]">
                            {channel.target_name || `ID: ${channel.target_id}`}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <button
                          onClick={() => openTargetModal(channel)}
                          title="Change target channel"
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-medium transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Change
                        </button>

                        <button
                          onClick={() => handleResync(channel.id, channel.title)}
                          title="Re-forward all past messages"
                          className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          Sync Past
                        </button>

                        <button
                          onClick={() => {
                            setUnlinkSourceId(channel.id);
                            setUnlinkConfirmOpen(true);
                          }}
                          title="Remove mapping"
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      /* Unmapped State */
                      <button
                        onClick={() => openTargetModal(channel)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm ml-auto md:ml-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Set Target Channel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Target Channel Selection Modal (Telegram Dialog Picker) */}
      {modalOpen && selectedSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh] space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                  Select Target for &ldquo;{selectedSource.title}&rdquo;
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  All messages posted in this channel will be forwarded to the chosen target.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Filter & Search */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search target channel by name or ID..."
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyAdminTargets}
                    onChange={(e) => setOnlyAdminTargets(e.target.checked)}
                    className="rounded border-[#1f2937] text-blue-600 focus:ring-0 bg-[#0d1117]"
                  />
                  <span>Show Admin Channels only (👑 Recommended)</span>
                </label>
                <span className="text-[11px] text-gray-500 font-mono">
                  {candidateTargets.length} available
                </span>
              </div>
            </div>

            {/* Candidate Target Channels List */}
            <div className="flex-1 overflow-y-auto max-h-56 space-y-2 pr-1">
              {candidateTargets.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-xs">
                  <p>No target channels found matching your criteria</p>
                  <p className="text-[11px] text-gray-600 mt-1">You can type a custom Channel ID below</p>
                </div>
              ) : (
                candidateTargets.map((candidate) => {
                  const isSelected = selectedTargetId === candidate.id && !customTargetId.trim();
                  const initials = getInitials(candidate.title);
                  const gradient = getAvatarGradient(candidate.id);

                  return (
                    <div
                      key={candidate.id}
                      onClick={() => {
                        setSelectedTargetId(candidate.id);
                        setCustomTargetId('');
                      }}
                      className={`cursor-pointer rounded-lg p-3 border transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-[#0d1117] border-[#1f2937] hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{candidate.title}</p>
                          <p className="text-[11px] text-gray-400 font-mono truncate">ID: {candidate.id}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {candidate.is_admin && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Crown className="w-2.5 h-2.5 text-amber-300" />
                            Admin
                          </span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom Target ID Fallback */}
            <div className="pt-2 border-t border-[#1f2937]">
              <label className="text-xs font-medium text-gray-400 block mb-1">
                Or enter custom Target Channel ID:
              </label>
              <input
                type="text"
                placeholder="-1001234567890"
                value={customTargetId}
                onChange={(e) => {
                  setCustomTargetId(e.target.value);
                  setSelectedTargetId(null);
                }}
                className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Forwarding Options */}
            <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 space-y-2 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forwardHistory}
                  onChange={(e) => setForwardHistory(e.target.checked)}
                  className="mt-0.5 rounded border-[#1f2937] text-blue-600 focus:ring-0 bg-[#111827]"
                />
                <div>
                  <span className="font-semibold text-white block">
                    Forward all existing past messages (History Copy)
                  </span>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    Replicates past photos & videos immediately in the background without duplicates.
                  </span>
                </div>
              </label>

              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-1 border-t border-[#1f2937]/50">
                <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Real-time forwarding will be automatically active for all upcoming new posts.</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#0d1117] border border-[#1f2937] hover:bg-[#1f2937] text-xs font-medium text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalSubmitting || (!selectedTargetId && !customTargetId.trim())}
                onClick={handleSaveTarget}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {modalSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Saving Target...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Set Target & Start Forwarding
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Dead Channels Confirm Dialog */}
      <ConfirmDialog
        open={cleanDeadConfirmOpen}
        title={`Clean All ${deadCount} Dead Channels?`}
        message="This will remove all channels from MongoDB that have been banned, deleted, or left by the bot on Telegram. Your active channels and forwarding rules will remain completely intact."
        confirmLabel="Clean Dead Channels"
        variant="danger"
        onConfirm={handleCleanDeadChannels}
        onCancel={() => setCleanDeadConfirmOpen(false)}
      />

      {/* Unlink Mapping Confirm Dialog */}
      <ConfirmDialog
        open={unlinkConfirmOpen}
        title="Unlink / Delete Channel Mapping?"
        message="This will stop automatic forwarding and remove the mapping from the database. Past copied messages in the target channel will remain intact."
        confirmLabel="Remove Mapping"
        variant="danger"
        onConfirm={handleUnlink}
        onCancel={() => {
          setUnlinkConfirmOpen(false);
          setUnlinkSourceId(null);
        }}
      />

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
