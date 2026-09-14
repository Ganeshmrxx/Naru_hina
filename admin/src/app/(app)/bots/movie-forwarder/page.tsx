'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Film, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  CheckCircle2, AlertCircle, Database, ShieldCheck, ScrollText
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function MovieForwarderDetailPage() {
  const botId = 'movie_forwarder';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [dupCount, setDupCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  const fetchData = async () => {
    try {
      const [botData, logsData, dbData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getBotLogs(botId, 30).catch(() => []),
        api.getDatabaseStatus().catch(() => null),
      ]);
      setBot(botData);
      setLogs(logsData);
      const clusterB = (dbData as Record<string, unknown>)?.cluster_b as Record<string, unknown> | undefined;
      const colls = clusterB?.collections as Record<string, { count: number }> | undefined;
      if (colls?.newMovieDatas2) {
        setDupCount(colls.newMovieDatas2.count || 0);
      }
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
      toast('success', 'Movie Forwarder started');
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start');
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
        toast('info', 'Movie Forwarder stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'Movie Forwarder restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading Movie Forwarder details..." />;

  const isRunning = Boolean(bot?.is_running);

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
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">Movie Forwarder Bot</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Pyrogram Userbot (Session 1) — Automatic filter for files exceeding 150MB
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

      {/* Backend Configurations & Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Target Channel ID</p>
          <p className="text-base font-mono font-bold text-white mt-1">-1002059529731</p>
          <p className="text-[11px] text-gray-500 mt-1">Configured in plugins_movie_forwarder</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Minimum File Threshold</p>
          <p className="text-base font-mono font-bold text-purple-400 mt-1">&gt; 150 MB</p>
          <p className="text-[11px] text-gray-500 mt-1">Videos & documents checked</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Unique Files Indexed</p>
          <p className="text-base font-mono font-bold text-green-400 mt-1">{dupCount.toLocaleString()}</p>
          <p className="text-[11px] text-gray-500 mt-1">Stored in MongoDB newMovieDatas2</p>
        </div>
      </div>

      {/* Technical Workflow Guide */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Operating Architecture & Safeguards
        </h2>
        <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
          <p>
            • <strong>Detection Hook:</strong> Listens on <code className="text-gray-400">filters.video | filters.document</code> in all joined channels.
          </p>
          <p>
            • <strong>Deduplication Guard:</strong> Before copying any file, the bot attempts an <code className="text-gray-400">insert_one</code> into MongoDB collection <code className="text-purple-300">newMovieDatas2</code> using <code className="text-gray-400">file_unique_id</code>. If duplicate key error occurs, the message is skipped silently without unnecessary network load.
          </p>
          <p>
            • <strong>Zero Re-encode:</strong> Files are copied directly using Telegram server-side copy (<code className="text-gray-400">message.copy</code>), preserving original video quality and metadata.
          </p>
        </div>
      </div>

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            Recent Activity Logs
          </h2>
          <span className="text-[11px] text-gray-500 font-mono">Last 30 events</span>
        </div>

        <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 font-mono text-xs max-h-64 overflow-y-auto space-y-1">
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
        title={confirmAction === 'stop' ? 'Stop Movie Forwarder?' : 'Restart Movie Forwarder?'}
        message={confirmAction === 'stop' 
          ? 'Stopping this bot will halt automatic 150MB movie filtering until restarted.'
          : 'Restarting will reconnect the Pyrogram Session 1 client.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
