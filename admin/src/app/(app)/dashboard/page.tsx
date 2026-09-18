'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, Bot, ArrowRightLeft, Image, Video, HardDrive, Clock, AlertCircle,
  Play, Square, RotateCw, ExternalLink, RefreshCw
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const BOT_METADATA: Record<string, { name: string; path: string; desc: string }> = {
  movie_forwarder: {
    name: 'Movie Forwarder',
    path: '/bots/movie-forwarder',
    desc: 'Filters & mirrors files >150MB to target channel'
  },
  terabox_modifier: {
    name: 'TeraBox Modifier',
    path: '/bots/terabox',
    desc: 'Rewrites TeraBox URLs & auto-posts videos'
  },
  backup_forwarder: {
    name: 'Backup Forwarder',
    path: '/bots/backup-forwarder',
    desc: 'Channel-to-channel live & bulk forwarder'
  },
  data_modifier: {
    name: 'Data Modifier',
    path: '/bots/data-modifier',
    desc: 'Media modifier with inline delete button'
  },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [bots, setBots] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const fetchData = async () => {
    try {
      const [statsData, botsData] = await Promise.all([
        api.getStats().catch(() => ({})),
        api.getBots().catch(() => ({})),
      ]);
      setStats(statsData);
      setBots(botsData as Record<string, Record<string, unknown>>);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (botId: string) => {
    setActionLoading(botId);
    try {
      await api.startBot(botId);
      toast('success', `Started ${BOT_METADATA[botId]?.name || botId}`);
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start bot');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmStop = (botId: string) => {
    const name = BOT_METADATA[botId]?.name || botId;
    setConfirmState({
      open: true,
      title: `Stop ${name}?`,
      message: `Are you sure you want to stop ${name}? Active tasks running under this bot will be halted.`,
      action: async () => {
        setActionLoading(botId);
        try {
          await api.stopBot(botId);
          toast('info', `Stopped ${name}`);
          await fetchData();
        } catch (e: unknown) {
          toast('error', e instanceof Error ? e.message : 'Failed to stop bot');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const confirmRestart = (botId: string) => {
    const name = BOT_METADATA[botId]?.name || botId;
    setConfirmState({
      open: true,
      title: `Restart ${name}?`,
      message: `Are you sure you want to restart ${name}? The connection will be refreshed.`,
      action: async () => {
        setActionLoading(botId);
        try {
          await api.restartBot(botId);
          toast('success', `Restarted ${name}`);
          await fetchData();
        } catch (e: unknown) {
          toast('error', e instanceof Error ? e.message : 'Failed to restart bot');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  if (loading) return <LoadingState message="Loading dashboard & bot statuses..." />;

  const runningBotsCount = bots ? Object.values(bots).filter((b) => b.is_running).length : 0;
  const totalBotsCount = bots ? Object.keys(bots).length : 4;
  const totalMedia = (stats?.total_media as number) ?? 0;
  const videosCount = (stats?.videos as number) ?? 0;
  const photosCount = (stats?.photos as number) ?? 0;
  const totalSizeBytes = (stats?.total_size as number) ?? 0;
  const totalSizeMB = Math.round(totalSizeBytes / (1024 * 1024));
  const pendingChats = (stats?.pending_chats as number) ?? 0;
  const errorCount = (stats?.errors as number) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time status of AllForward bots, media forwarding, and background tasks
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchData();
          }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] text-sm text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Running Bots"
          value={`${runningBotsCount} / ${totalBotsCount}`}
          icon={Bot}
          color={runningBotsCount > 0 ? 'green' : 'yellow'}
          subtitle={runningBotsCount === totalBotsCount ? 'All bots running' : `${totalBotsCount - runningBotsCount} offline`}
        />
        <StatCard
          title="Media Forwarded Today"
          value={totalMedia.toLocaleString()}
          icon={ArrowRightLeft}
          color="blue"
          subtitle="From active channels"
        />
        <StatCard
          title="Videos Today"
          value={videosCount.toLocaleString()}
          icon={Video}
          color="purple"
          subtitle="Processed video files"
        />
        <StatCard
          title="Photos Today"
          value={photosCount.toLocaleString()}
          icon={Image}
          color="yellow"
          subtitle="Processed images"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Data Processed"
          value={totalSizeMB > 1024 ? `${(totalSizeMB / 1024).toFixed(2)} GB` : `${totalSizeMB} MB`}
          icon={HardDrive}
          color="blue"
          subtitle="Bandwidth transferred"
        />
        <StatCard
          title="Pending Channel Scans"
          value={pendingChats}
          icon={Clock}
          color={pendingChats > 0 ? 'yellow' : 'green'}
          subtitle="Queued in chats DB"
        />
        <StatCard
          title="System Health"
          value={runningBotsCount > 0 ? 'Healthy' : 'Standby'}
          icon={Activity}
          color={runningBotsCount > 0 ? 'green' : 'yellow'}
          subtitle="FastAPI backend connected"
        />
        <StatCard
          title="Logged Errors"
          value={errorCount}
          icon={AlertCircle}
          color={errorCount > 0 ? 'red' : 'green'}
          subtitle={errorCount > 0 ? 'Review in Error log' : 'Zero recent errors'}
        />
      </div>

      {/* Bots Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            Bot Cluster Status
          </h2>
          <span className="text-xs text-gray-500">Auto-refreshes every 10s</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(BOT_METADATA).map(([botId, meta]) => {
            const bot = bots?.[botId] || {};
            const isRunning = Boolean(bot.is_running);
            const startedAt = bot.started_at ? new Date(bot.started_at as string).toLocaleTimeString() : null;
            const lastError = bot.last_error as string | null;
            const isLoading = actionLoading === botId;

            return (
              <div
                key={botId}
                className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 flex flex-col justify-between hover:border-gray-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-semibold text-white">{meta.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
                    </div>
                    <StatusBadge status={isRunning ? 'online' : 'offline'} />
                  </div>

                  <div className="my-4 p-3 bg-[#0d1117] rounded-lg border border-[#1f2937]/60 space-y-1.5 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="text-gray-200 capitalize">{(bot.session_type as string) || 'Userbot'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Started:</span>
                      <span className="text-gray-200">{startedAt || 'Stopped'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Processed:</span>
                      <span className="text-gray-200 font-mono">{(bot.messages_processed as number) || 0} msgs</span>
                    </div>
                    {lastError && (
                      <div className="pt-1 border-t border-red-500/20 text-red-400 truncate">
                        Err: {lastError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#1f2937]">
                  <Link
                    href={meta.path}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                  >
                    Details
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <div className="flex items-center gap-1.5">
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => confirmRestart(botId)}
                          disabled={isLoading}
                          title="Restart Bot"
                          className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                        >
                          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => confirmStop(botId)}
                          disabled={isLoading}
                          title="Stop Bot"
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleStart(botId)}
                        disabled={isLoading}
                        title="Start Bot"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-pulse' : ''}`} />
                        Start
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={async () => {
          setConfirmState((prev) => ({ ...prev, open: false }));
          await confirmState.action();
        }}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
