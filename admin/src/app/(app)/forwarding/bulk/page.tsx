'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HardDrive, Play, Square, ArrowRight, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, Radio
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function BulkForwardPage() {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [fromMsgId, setFromMsgId] = useState('0');
  const [toMsgId, setToMsgId] = useState('0');
  const [starting, setStarting] = useState(false);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchJobs = async () => {
    try {
      const data = await api.getForwardJobs();
      setJobs(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartConfirm = async () => {
    setConfirmOpen(false);
    setStarting(true);
    try {
      const res = await api.startBulkForward({
        source_id: parseInt(sourceId),
        target_id: parseInt(targetId),
        from_msg_id: parseInt(fromMsgId) || 0,
        to_msg_id: parseInt(toMsgId) || 0,
      });
      toast('success', `Bulk forward job initiated (Job ID: ${res.job_id || 'active'})`);
      await fetchJobs();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to launch bulk forward job');
    } finally {
      setStarting(false);
    }
  };

  const handleStopJob = async (jobId: string) => {
    try {
      await api.stopForwardJob(jobId);
      toast('info', `Stopped job ${jobId}`);
      await fetchJobs();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to stop job');
    }
  };

  const activeJob = jobs.find((j) => j.status === 'running');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bulk Channel History Forwarder</h1>
          <p className="text-sm text-gray-400 mt-1">
            Replicate channel history between Telegram chats with automatic FloodWait avoidance
          </p>
        </div>
        <Link
          href="/forwarding/jobs"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] hover:bg-[#1f2937] text-gray-300 hover:text-white text-sm font-medium transition-colors self-start sm:self-auto"
        >
          <Radio className="w-4 h-4 text-blue-400" />
          All Jobs
        </Link>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-blue-200">Safe Forwarding Engine</p>
          <p>
            The backend forwards media sequentially with a safe 1.5s delay to strictly comply with Telegram API rate limits. 
            If Telegram issues a FloodWait, the bot automatically pauses and sleeps until the window expires.
          </p>
        </div>
      </div>

      {/* Active Job Progress Banner */}
      {activeJob && (
        <div className="bg-[#111827] border border-blue-500/30 rounded-xl p-5 space-y-4 shadow-lg shadow-blue-500/5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
              <h3 className="font-semibold text-white">Active Forwarding Job: {activeJob.job_id as string}</h3>
            </div>
            <button
              onClick={() => handleStopJob(activeJob.job_id as string)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Job
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#0d1117] rounded-lg text-xs">
            <div>
              <p className="text-gray-400">Source ID</p>
              <p className="font-mono text-white mt-0.5">{activeJob.source_id as number}</p>
            </div>
            <div>
              <p className="text-gray-400">Target ID</p>
              <p className="font-mono text-white mt-0.5">{activeJob.target_id as number}</p>
            </div>
            <div>
              <p className="text-gray-400">Processed</p>
              <p className="font-mono text-green-400 font-bold mt-0.5">{activeJob.processed as number} msgs</p>
            </div>
            <div>
              <p className="text-gray-400">Current Msg ID</p>
              <p className="font-mono text-blue-400 mt-0.5">{activeJob.current_msg_id as number}</p>
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] text-gray-500">
            <span>Started: {new Date(activeJob.started_at as string).toLocaleTimeString()}</span>
            <span>Last Activity: {new Date(activeJob.last_activity as string).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Bulk Forward Setup Form */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Configure New History Forward Job</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!sourceId || !targetId) {
              toast('warning', 'Please provide Source ID and Target ID');
              return;
            }
            setConfirmOpen(true);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">Source Channel ID</label>
              <input
                type="text"
                placeholder="e.g. -1001234567890"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1">Must be accessible by the running userbot account</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">Target Channel ID</label>
              <input
                type="text"
                placeholder="e.g. -1009876543210"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-[11px] text-gray-500 mt-1">Bot or userbot must have write/post permissions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">From Message ID (Optional)</label>
              <input
                type="number"
                placeholder="0 = Latest message"
                value={fromMsgId}
                onChange={(e) => setFromMsgId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-500 mt-1">Leave 0 to start from the top of the channel</p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1.5">To Message ID (Optional)</label>
              <input
                type="number"
                placeholder="0 = Full history"
                value={toMsgId}
                onChange={(e) => setToMsgId(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[11px] text-gray-500 mt-1">Stop copying when this message ID is reached</p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#1f2937] flex justify-end">
            <button
              type="submit"
              disabled={starting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {starting ? 'Initiating...' : 'Start History Forward'}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Start History Forwarding Job?"
        message={`You are about to start a history forwarding job from ${sourceId} to ${targetId}. This may process a large number of Telegram messages across multiple hours.`}
        confirmLabel="Start Forwarding"
        onConfirm={handleStartConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
