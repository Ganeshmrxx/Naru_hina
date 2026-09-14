'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bot, Film, Zap, Megaphone, HardDrive, Settings, Play, Square,
  RotateCw, ExternalLink, RefreshCw, AlertCircle
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const BOTS_INFO: Record<string, {
  name: string;
  session: string;
  icon: typeof Bot;
  path: string;
  desc: string;
  features: string[];
}> = {
  movie_forwarder: {
    name: 'Movie Forwarder Bot',
    session: 'Session 3 (userbot)',
    icon: Film,
    path: '/bots/movie-forwarder',
    desc: 'Monitors incoming channel posts and copies movies/documents >150MB to target archive.',
    features: ['150MB File Size Filter', 'MongoDB Deduplication (newMovieDatas2)', 'Auto Target Forwarding']
  },
  terabox_modifier: {
    name: 'TeraBox Modifier Bot',
    session: 'xmodify1terastring (bot token)',
    icon: Zap,
    path: '/bots/terabox',
    desc: 'Bypasses and rewrites TeraBox links to playtera.in player, with search and auto-poster.',
    features: ['Link Rewriter & Bypasser', 'Inline Search Pagination', '30-Min Auto-Poster with History Clear']
  },
  promoter_1: {
    name: 'Promoter Bot 1',
    session: 'Session 3 / session_gen (userbot)',
    icon: Megaphone,
    path: '/bots/promoter-1',
    desc: 'Automated 3-step drip conversion funnel for private DMs and periodic group broadcasting.',
    features: ['3-Stage Private DM Funnel', 'Periodic Group Message Broadcaster', 'Auto-Admin Elevation for @ganeshmrxx']
  },
  promoter_2: {
    name: 'Promoter Bot 2',
    session: 'Session 4 / x2 (userbot)',
    icon: Megaphone,
    path: '/bots/promoter-2',
    desc: 'High-volume parallel userbot account executing identical promotional funnels.',
    features: ['Independent Session4 Credentials', 'Group Spam Broadcaster', 'Auto-Admin Elevation']
  },
  backup_forwarder: {
    name: 'Backup Forwarder Bot',
    session: 'Session 2 / userClient1 (userbot)',
    icon: HardDrive,
    path: '/bots/backup-forwarder',
    desc: 'High-performance channel mirroring utility with duplicate protection and bulk command execution.',
    features: ['Direct xDataChannels Routing', 'xData Media Duplicate Registry', 'Bulk History Replication Engine']
  },
  data_modifier: {
    name: 'General Data Modifier Bot',
    session: 'xmodify1 (bot token)',
    icon: Settings,
    path: '/bots/data-modifier',
    desc: 'Interactive data modifier bot supporting inline "❌ Remove" buttons to delete media across chats.',
    features: ['Interactive Callback Deletion', 'Source Message Synchronization', 'Restricted User Access Control']
  },
};

export default function BotsOverviewPage() {
  const [bots, setBots] = useState<Record<string, Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const fetchBots = async () => {
    try {
      const data = await api.getBots();
      setBots(data as Record<string, Record<string, unknown>>);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (botId: string) => {
    setActionLoading(botId);
    try {
      await api.startBot(botId);
      toast('success', `Started ${BOTS_INFO[botId]?.name || botId}`);
      await fetchBots();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start bot');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmStop = (botId: string) => {
    const name = BOTS_INFO[botId]?.name || botId;
    setConfirmState({
      open: true,
      title: `Stop ${name}?`,
      message: `Are you sure you want to stop ${name}? Active Telegram listeners will disconnect.`,
      action: async () => {
        setActionLoading(botId);
        try {
          await api.stopBot(botId);
          toast('info', `Stopped ${name}`);
          await fetchBots();
        } catch (e: unknown) {
          toast('error', e instanceof Error ? e.message : 'Failed to stop bot');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const confirmRestart = (botId: string) => {
    const name = BOTS_INFO[botId]?.name || botId;
    setConfirmState({
      open: true,
      title: `Restart ${name}?`,
      message: `Restart ${name} now? This will cycle the Pyrogram client connection.`,
      action: async () => {
        setActionLoading(botId);
        try {
          await api.restartBot(botId);
          toast('success', `Restarted ${name}`);
          await fetchBots();
        } catch (e: unknown) {
          toast('error', e instanceof Error ? e.message : 'Failed to restart bot');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  if (loading) return <LoadingState message="Loading bot cluster..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bot Cluster Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Control the 6 independent Pyrogram clients operating across the AllForward network
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchBots();
          }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] text-sm text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Object.entries(BOTS_INFO).map(([botId, info]) => {
          const bot = bots?.[botId] || {};
          const isRunning = Boolean(bot.is_running);
          const startedAt = bot.started_at ? new Date(bot.started_at as string).toLocaleString() : null;
          const lastError = bot.last_error as string | null;
          const isLoading = actionLoading === botId;
          const Icon = info.icon;

          return (
            <div
              key={botId}
              className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 flex flex-col justify-between hover:border-gray-700 transition-colors shadow-lg"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white text-base">{info.name}</h2>
                      <span className="text-[11px] font-mono text-gray-400">{info.session}</span>
                    </div>
                  </div>
                  <StatusBadge status={isRunning ? 'online' : 'offline'} />
                </div>

                <p className="text-xs text-gray-300 mb-4 leading-relaxed">{info.desc}</p>

                {/* Features Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {info.features.map((f, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-[#0d1117] border border-[#1f2937] text-[10px] text-gray-400"
                    >
                      {f}
                    </span>
                  ))}
                </div>

                {/* Live Runtime Metrics */}
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#1f2937] space-y-1.5 text-xs text-gray-400 mb-4">
                  <div className="flex justify-between">
                    <span>Active State:</span>
                    <span className={isRunning ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {isRunning ? 'Connected & Listening' : 'Stopped / Standby'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Started:</span>
                    <span className="text-gray-200">{startedAt || 'Not active'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Messages Processed:</span>
                    <span className="text-gray-200 font-mono font-semibold">
                      {(bot.messages_processed as number) || 0}
                    </span>
                  </div>
                  {lastError && (
                    <div className="pt-1.5 border-t border-red-500/20 text-red-400 flex items-start gap-1 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="truncate">{lastError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-[#1f2937]">
                <Link
                  href={info.path}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1.5"
                >
                  Configure & Logs
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => confirmRestart(botId)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        Restart
                      </button>
                      <button
                        onClick={() => confirmStop(botId)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleStart(botId)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-pulse' : ''}`} />
                      Start Bot
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
