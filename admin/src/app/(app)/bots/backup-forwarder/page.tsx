'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HardDrive, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  Plus, CheckCircle2, AlertCircle, ShieldCheck, ScrollText, Radio, ArrowRightLeft
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function BackupForwarderDetailPage() {
  const botId = 'backup_forwarder';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [mappings, setMappings] = useState<Record<string, unknown>[]>([]);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [xDataCount, setXDataCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Quick /addnew form state
  const [srcId, setSrcId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [forwardStarting, setForwardStarting] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  const fetchData = async () => {
    try {
      const [botData, mappingsData, jobsData, logsData, dbData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getMappings().catch(() => []),
        api.getForwardJobs().catch(() => []),
        api.getBotLogs(botId, 30).catch(() => []),
        api.getDatabaseStatus().catch(() => null),
      ]);
      setBot(botData);
      setMappings(mappingsData);
      setJobs(jobsData);
      setLogs(logsData);
      const clusterB = (dbData as Record<string, unknown>)?.cluster_b as Record<string, unknown> | undefined;
      const colls = clusterB?.collections as Record<string, { count: number }> | undefined;
      if (colls?.xData) {
        setXDataCount(colls.xData.count || 0);
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
      toast('success', 'Backup Forwarder started');
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
        toast('info', 'Backup Forwarder stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'Backup Forwarder restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // UI equivalent of /addnew command
  const handleAddNewForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!srcId || !targetId) {
      toast('warning', 'Source ID and Target ID are required');
      return;
    }
    setForwardStarting(true);
    try {
      // 1. Create mapping
      await api.createMapping({
        source_id: parseInt(srcId),
        source_name: `Source ${srcId}`,
        target_id: parseInt(targetId),
        target_name: `Target ${targetId}`,
      });
      // 2. Launch bulk copy
      await api.copyMapping(parseInt(srcId));
      toast('success', `Mapping created & history forward launched for ${srcId} -> ${targetId}`);
      setSrcId('');
      setTargetId('');
      await fetchData();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to execute history forward');
    } finally {
      setForwardStarting(false);
    }
  };

  if (loading) return <LoadingState message="Loading Backup Forwarder details..." />;

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
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">Backup Forwarder Bot</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Pyrogram Userbot (Session 2 / userClient1) — Mapped channel mirroring & duplicate protection
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

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Active Routing Mappings</p>
          <p className="text-base font-mono font-bold text-blue-400 mt-1">{mappings.length} Mappings</p>
          <p className="text-[11px] text-gray-500 mt-1">Configured in xDataChannels</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Unique Media Records</p>
          <p className="text-base font-mono font-bold text-green-400 mt-1">{xDataCount.toLocaleString()}</p>
          <p className="text-[11px] text-gray-500 mt-1">Stored in MongoDB xData registry</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Active Forwarding Jobs</p>
          <p className="text-base font-mono font-bold text-yellow-400 mt-1">
            {jobs.filter((j) => j.status === 'running').length} Running
          </p>
          <p className="text-[11px] text-gray-500 mt-1">History replication tasks</p>
        </div>
      </div>

      {/* Quick Action: /addnew Form */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-400" />
            Quick Start History Forward (Equivalent to /addnew)
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Replaces manual Telegram command <code className="text-blue-300">/addnew &lt;srcID&gt; &lt;targetID&gt;</code>. Creates mapping in database and launches media replication.
          </p>
        </div>

        <form onSubmit={handleAddNewForward} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1">Source Channel ID</label>
            <input
              type="text"
              placeholder="-1001234567890"
              value={srcId}
              onChange={(e) => setSrcId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1">Target Channel ID</label>
            <input
              type="text"
              placeholder="-1009876543210"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={forwardStarting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 px-4 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 h-[34px]"
            >
              <Play className="w-3.5 h-3.5" />
              {forwardStarting ? 'Starting...' : 'Start History Forward'}
            </button>
          </div>
        </form>
      </div>

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            Backup Forwarder Logs
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
        title={confirmAction === 'stop' ? 'Stop Backup Forwarder?' : 'Restart Backup Forwarder?'}
        message={confirmAction === 'stop' 
          ? 'Stopping this userbot will disable real-time mapping event listeners and bulk replication.'
          : 'Restarting will reconnect the Pyrogram Session 2 client.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
