'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Radio, RefreshCw, Square, HardDrive, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function ForwardJobsPage() {
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const data = await api.getForwardJobs();
      setJobs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = async (jobId: string) => {
    try {
      await api.stopForwardJob(jobId);
      toast('info', `Stopped job ${jobId}`);
      await fetchJobs();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to stop job');
    }
  };

  if (loading) return <LoadingState message="Loading forward jobs..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Active & Recent Forwarding Jobs</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time status of history replication and batch copying jobs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/forwarding/bulk"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Launch New Job
          </Link>
          <button
            onClick={() => {
              setRefreshing(true);
              fetchJobs();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No Active or Recent Jobs"
          description="History forwarding jobs triggered from 'Bulk Forwarder' or channel mappings will appear here."
        />
      ) : (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                <tr>
                  <th className="py-3 px-4">Job ID</th>
                  <th className="py-3 px-4">Source ID</th>
                  <th className="py-3 px-4">Target ID</th>
                  <th className="py-3 px-4">Worker Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Processed</th>
                  <th className="py-3 px-4">Current Msg</th>
                  <th className="py-3 px-4">Started At</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {jobs.map((job) => {
                  const jobId = job.job_id as string;
                  const status = job.status as string;
                  const isRunning = status === 'running';
                  const isWorkerBots = job.worker_type === 'worker_bots' || job.is_public === true;

                  return (
                    <tr key={jobId} className="hover:bg-[#1f2937]/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">{jobId}</td>
                      <td className="py-3 px-4 font-mono text-gray-300">
                        {job.source_name ? (
                          <span className="text-yellow-300 font-sans block truncate max-w-[140px]" title={String(job.source_name)}>
                            {String(job.source_name)}
                          </span>
                        ) : null}
                        <span>{job.source_id as number}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-300">{job.target_id as number}</td>
                      <td className="py-3 px-4">
                        {isWorkerBots ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 whitespace-nowrap">
                            🤖 Worker Bot
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                            👤 Userbot
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          status={isRunning ? 'running' : status === 'completed' ? 'done' : status === 'failed' ? 'error' : 'offline'}
                          label={status}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-green-400 font-semibold">{job.processed as number} msgs</td>
                      <td className="py-3 px-4 font-mono text-gray-400">{job.current_msg_id as number}</td>
                      <td className="py-3 px-4 text-gray-400">{new Date(job.started_at as string).toLocaleTimeString()}</td>
                      <td className="py-3 px-4 text-gray-400">{new Date(job.last_activity as string).toLocaleTimeString()}</td>
                      <td className="py-3 px-4 text-right">
                        {isRunning && (
                          <button
                            onClick={() => handleStop(jobId)}
                            className="px-2.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium inline-flex items-center gap-1 transition-colors"
                          >
                            <Square className="w-3 h-3" />
                            Stop
                          </button>
                        )}
                        {job.error ? (
                          <span className="text-[11px] text-red-400 block truncate max-w-[120px]" title={String(job.error)}>
                            {String(job.error)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
