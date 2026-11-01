'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  Search, ShieldCheck, ScrollText, CheckCircle2, AlertCircle, ExternalLink
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function TeraBoxDetailPage() {
  const botId = 'terabox_modifier';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Search Test Tool
  const [searchQuery, setSearchQuery] = useState('viral');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<unknown[] | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  const fetchData = async () => {
    try {
      const [botData, configData, logsData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getTeraboxConfig().catch(() => ({})),
        api.getBotLogs(botId, 30).catch(() => []),
      ]);
      setBot(botData);
      setConfig(configData);
      setLogs(logsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await api.startBot(botId);
      toast('success', 'TeraBox Modifier started');
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
        toast('info', 'TeraBox Modifier stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'TeraBox Modifier restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setSearchLoading(true);
    try {
      const res = await api.searchTerabox(searchQuery, 4);
      if (res.success && Array.isArray(res.results)) {
        setSearchResults(res.results);
        toast('success', `Found ${res.results.length} video results from API`);
      } else {
        setSearchResults([]);
        toast('warning', 'Search returned no videos or failed');
      }
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Search test failed');
    } finally {
      setSearchLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading TeraBox Modifier configuration..." />;

  const isRunning = Boolean(bot?.is_running);
  const keywords = (config?.keywords as string[]) || [];
  const targetChannels = (config?.target_channels as number[]) || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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
          <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-400">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">TeraBox Modifier Bot</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Telegram Bot Token (<code className="text-gray-300">tokentera</code>) — Automated link rewrite & auto-posting
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
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                Restart
              </button>
              <button
                onClick={() => {
                  setConfirmAction('stop');
                  setConfirmOpen(true);
                }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors disabled:opacity-50"
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
              Start Bot
            </button>
          )}
          <button
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Key Config Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Auto-Post Delay</p>
          <p className="text-base font-mono font-bold text-white mt-1">30 Minutes</p>
          <p className="text-[11px] text-gray-500 mt-1">AUTO_SEND_DELAY: 1800s</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Search Cooldown</p>
          <p className="text-base font-mono font-bold text-blue-400 mt-1">30 Minutes</p>
          <p className="text-[11px] text-gray-500 mt-1">Per-user query throttle</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Auto-Delete Results</p>
          <p className="text-base font-mono font-bold text-yellow-400 mt-1">30 Minutes</p>
          <p className="text-[11px] text-gray-500 mt-1">Cleans search results automatically</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Target Channels</p>
          <p className="text-base font-mono font-bold text-green-400 mt-1">{targetChannels.length} Channels</p>
          <p className="text-[11px] text-gray-500 mt-1">{targetChannels.join(', ')}</p>
        </div>
      </div>

      {/* Target Channels & Keywords Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Target Channels (Auto-Poster)</h2>
          <div className="space-y-2">
            {targetChannels.map((cid, i) => (
              <div key={i} className="flex justify-between items-center p-2.5 bg-[#0d1117] border border-[#1f2937] rounded-lg text-xs font-mono">
                <span className="text-gray-300">Target #{i + 1}</span>
                <span className="text-blue-400">{cid}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            Before posting each 30-min batch, the bot calls <code className="text-gray-400">clear_channel_history</code> to delete up to 100 previous messages.
          </p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Search API Keywords</h2>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
            {keywords.map((kw, i) => (
              <span key={i} className="px-2.5 py-1 rounded bg-[#0d1117] border border-[#1f2937] text-xs font-mono text-gray-300">
                {kw}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            Source API: <code className="text-blue-300">https://playterabox.com/api/search-videos</code>
          </p>
        </div>
      </div>

      {/* Search API Test Console */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400" />
          Interactive TeraBox API Search Test
        </h2>

        <form onSubmit={handleTestSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keyword (e.g. viral, latest, movie)"
            className="flex-1 bg-[#0d1117] border border-[#1f2937] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            {searchLoading ? 'Searching...' : 'Test API'}
          </button>
        </form>

        {searchResults && (
          <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg text-xs font-mono space-y-2 max-h-48 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="text-gray-500">No videos returned for this query</p>
            ) : (
              (searchResults as Record<string, unknown>[]).map((item, idx) => (
                <div key={idx} className="p-2 border-b border-[#1f2937] last:border-b-0 space-y-0.5">
                  <p className="text-white font-medium truncate">{item.title as string || `Video #${idx + 1}`}</p>
                  <p className="text-gray-500 text-[10px] truncate">{item.url as string || item.link as string}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            TeraBox Bot Activity Logs
          </h2>
          <span className="text-[11px] text-gray-500 font-mono">Last 30 events</span>
        </div>

        <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-6">No recent events recorded for this bot</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-gray-300">
                <span className="text-gray-500 text-[10px] flex-shrink-0">
                  {new Date(l.timestamp as string).toLocaleTimeString()}
                </span>
                <span className={`text-[10px] uppercase font-bold flex-shrink-0 ${
                  l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARNING' ? 'text-yellow-400' : 'text-blue-400'
                }`}>
                  [{l.level as string}]
                </span>
                <span className="break-all">{l.message as string}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction === 'stop' ? 'Stop TeraBox Modifier?' : 'Restart TeraBox Modifier?'}
        message={confirmAction === 'stop' 
          ? 'Stopping will halt automatic 30-min scheduled posts and link rewrite listeners.'
          : 'Restarting will reconnect the bot token client and restart the auto_send background task.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
