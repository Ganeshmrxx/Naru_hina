'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  ShieldCheck, ScrollText, AlertCircle, CheckCircle2, Trash2
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function DataModifierDetailPage() {
  const botId = 'data_modifier';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart'>('stop');

  const fetchData = async () => {
    try {
      const [botData, logsData] = await Promise.all([
        api.getBotStatus(botId).catch(() => ({})),
        api.getBotLogs(botId, 30).catch(() => []),
      ]);
      setBot(botData);
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
      toast('success', 'General Data Modifier started');
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
        toast('info', 'General Data Modifier stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'General Data Modifier restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading Data Modifier details..." />;

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
          <div className="p-3 rounded-xl bg-green-500/10 text-green-400">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">General Data Modifier Bot</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Telegram Bot Token (<code className="text-gray-300">xmodify1</code>) — Interactive media copy with inline deletion buttons
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

      {/* Backend Configurations */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Target Channel ID</p>
          <p className="text-base font-mono font-bold text-white mt-1">-1003457671077</p>
          <p className="text-[11px] text-gray-500 mt-1">Configured destination channel</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Authorized Operator ID</p>
          <p className="text-base font-mono font-bold text-green-400 mt-1">5886109249</p>
          <p className="text-[11px] text-gray-500 mt-1">ALLOWED_USER_ID security filter</p>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <p className="text-xs text-gray-400">Interactive Delete Feature</p>
          <p className="text-base font-mono font-bold text-red-400 mt-1">Active</p>
          <p className="text-[11px] text-gray-500 mt-1">Inline &apos;Remove&apos; button attached</p>
        </div>
      </div>

      {/* Architectural Documentation */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Interactive Remove Button Mechanism
        </h2>
        <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
          <p>
            • <strong>Media Modification:</strong> When media is forwarded by this bot, it attaches an inline keyboard button labeled <code className="text-red-400">❌ Remove</code> with callback data format <code className="text-gray-400">del:&#123;channel_id&#125;:&#123;message_id&#125;</code>.
          </p>
          <p>
            • <strong>Dual Synchronization:</strong> Clicking the remove button executes <code className="text-gray-400">client.delete_messages</code> to purge the message from the Telegram channel, and simultaneously removes the record from MongoDB collection <code className="text-purple-300">xData</code>.
          </p>
        </div>
      </div>

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            Data Modifier Bot Activity Logs
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
        title={confirmAction === 'stop' ? 'Stop General Data Modifier?' : 'Restart General Data Modifier?'}
        message={confirmAction === 'stop' 
          ? 'Stopping this bot will disable inline deletion callbacks and interactive media copy.'
          : 'Restarting will reconnect the Pyrogram bot token client.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
