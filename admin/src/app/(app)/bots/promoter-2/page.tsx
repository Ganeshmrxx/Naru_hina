'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Megaphone, Play, Square, RotateCw, RefreshCw, ArrowLeft,
  AlertTriangle, CheckCircle2, ShieldCheck, ScrollText, Users, Radio
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function Promoter2DetailPage() {
  const botId = 'promoter_2';
  const [bot, setBot] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Dangerous spam toggle confirmation
  const [confirmSpamOpen, setConfirmSpamOpen] = useState(false);
  const [spamAction, setSpamAction] = useState<'enable' | 'disable'>('enable');

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
      toast('success', 'Promoter Bot 2 started');
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start');
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
        toast('info', 'Promoter Bot 2 stopped');
      } else {
        await api.restartBot(botId);
        toast('success', 'Promoter Bot 2 restarted');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmedSpamToggle = async () => {
    setConfirmSpamOpen(false);
    setActionLoading(true);
    try {
      if (spamAction === 'enable') {
        await api.enableSpam(botId);
        toast('warning', 'Group message broadcast loop enabled');
      } else {
        await api.disableSpam(botId);
        toast('info', 'Group message broadcast loop stopped');
      }
      await fetchData();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to toggle spam task');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading Promoter Bot 2 status..." />;

  const isRunning = Boolean(bot?.is_running);
  const isSpamEnabled = Boolean(bot?.spam_enabled);
  const isPromoteEnabled = Boolean(bot?.promote_enabled);

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
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">Promoter Bot 2</h1>
              <StatusBadge status={isRunning ? 'online' : 'offline'} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Pyrogram Userbot (Session 4 / x2) — Secondary account scaling outreach
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

      {/* Background Tasks Control Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Spam Task Card with Warning */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-yellow-400" />
                Group Broadcasting (Spam Task)
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Periodic conversational messages sent to joined groups every 1 to 3 hours (auto-deleted after 5 mins)
              </p>
            </div>
            <StatusBadge status={isSpamEnabled ? 'online' : 'offline'} label={isSpamEnabled ? 'Enabled' : 'Disabled'} />
          </div>

          <div className="p-3 bg-[#0d1117] rounded-lg border border-yellow-500/20 text-xs text-yellow-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              Safety Safeguard
            </p>
            <p>
              Defaults to DISABLED. Always observe Telegram rate limits. Only enable on approved accounts to prevent temporary FloodWait restrictions.
            </p>
          </div>

          <div className="pt-2">
            {isSpamEnabled ? (
              <button
                onClick={() => {
                  setSpamAction('disable');
                  setConfirmSpamOpen(true);
                }}
                disabled={actionLoading}
                className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                Disable Group Broadcasting
              </button>
            ) : (
              <button
                onClick={() => {
                  setSpamAction('enable');
                  setConfirmSpamOpen(true);
                }}
                disabled={actionLoading}
                className="w-full py-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                Enable Group Broadcasting
              </button>
            )}
          </div>
        </div>

        {/* Admin Promotion Card */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-green-400" />
                Auto-Admin Elevation
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Scans owned channels and elevates <code className="text-green-300">@ganeshmrxx</code> to full Administrator
              </p>
            </div>
            <StatusBadge status={isPromoteEnabled ? 'online' : 'offline'} label={isPromoteEnabled ? 'Active' : 'Disabled'} />
          </div>

          <div className="p-3 bg-[#0d1117] rounded-lg border border-[#1f2937] text-xs text-gray-300 space-y-1">
            <p className="font-semibold text-white">Target Administrator</p>
            <p className="font-mono text-green-400">@ganeshmrxx</p>
            <p className="text-[11px] text-gray-500 mt-1">
              Includes permissions: post, edit, delete, invite, restrict, and promote other admins.
            </p>
          </div>
        </div>
      </div>

      {/* DM Funnel Logic Architecture */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          3-Stage Inbound Drip Funnel (configX1.py)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg space-y-1">
            <span className="text-blue-400 font-bold">Stage 1</span>
            <p className="font-semibold text-white">Initial Engagement</p>
            <p className="text-gray-400 text-[11px]">Sends 2 video previews, waits 120s, then sends friendly greeting ("hi").</p>
          </div>
          <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg space-y-1">
            <span className="text-purple-400 font-bold">Stage 2</span>
            <p className="font-semibold text-white">Channel Invitation</p>
            <p className="text-gray-400 text-[11px]">Deletes greeting after 120s and presents invite link to @muvibots.</p>
          </div>
          <div className="p-3 bg-[#0d1117] border border-[#1f2937] rounded-lg space-y-1">
            <span className="text-green-400 font-bold">Stage 3</span>
            <p className="font-semibold text-white">24h Verification</p>
            <p className="text-gray-400 text-[11px]">Checks membership after 24h. If not joined, switches to silent ignore mode.</p>
          </div>
        </div>
      </div>

      {/* Bot Logs Viewer */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-blue-400" />
            Promoter Bot 2 Activity Logs
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

      {/* Bot Stop/Restart Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction === 'stop' ? 'Stop Promoter Bot 2?' : 'Restart Promoter Bot 2?'}
        message={confirmAction === 'stop' 
          ? 'Stopping this userbot will deactivate DM funnels and group broadcasting.'
          : 'Restarting will reconnect the Pyrogram Session 4 client.'
        }
        confirmLabel={confirmAction === 'stop' ? 'Stop Bot' : 'Restart Bot'}
        onConfirm={handleConfirmedBotAction}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Dangerous Spam Toggle Confirm Dialog */}
      <ConfirmDialog
        open={confirmSpamOpen}
        title={spamAction === 'enable' ? 'Enable Group Message Broadcasting?' : 'Disable Group Broadcasting?'}
        message={spamAction === 'enable'
          ? 'Are you sure you want to enable group message broadcasting? The userbot will periodically post conversational messages to all joined groups. Ensure this complies with group rules.'
          : 'Disable group message broadcasting task for Promoter Bot 2?'
        }
        variant={spamAction === 'enable' ? 'warning' : 'info'}
        confirmLabel={spamAction === 'enable' ? 'Enable Broadcasting' : 'Disable'}
        onConfirm={handleConfirmedSpamToggle}
        onCancel={() => setConfirmSpamOpen(false)}
      />
    </div>
  );
}
