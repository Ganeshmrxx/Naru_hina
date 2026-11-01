'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ScrollText, RefreshCw, Pause, Play, Download, Trash2,
  Filter, CheckCircle2, AlertCircle, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { LoadingState } from '@/components/ui/LoadingState';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const BOT_OPTIONS = [
  { id: 'all', label: 'All Bots' },
  { id: 'movie_forwarder', label: 'Movie Forwarder' },
  { id: 'terabox_modifier', label: 'TeraBox Modifier' },
  { id: 'backup_forwarder', label: 'Backup Forwarder' },
  { id: 'data_modifier', label: 'Data Modifier' },
];

export default function LiveLogsPage() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [botFilter, setBotFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    if (isPaused) return;
    try {
      const data = await api.getLogs({
        bot_id: botFilter === 'all' ? undefined : botFilter,
        level: levelFilter === 'all' ? undefined : levelFilter,
        limit: 150,
      });
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [isPaused, botFilter, levelFilter]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    const textContent = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${(l.level as string).toUpperCase()}] [${l.bot_id}]: ${l.message}`
      )
      .join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `allforward_logs_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', 'Logs downloaded');
  };

  const handleClearView = () => {
    setLogs([]);
    toast('info', 'Cleared local log viewer');
  };

  if (loading) return <LoadingState message="Connecting to live log stream..." />;

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live System Logs</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time stdout & stderr stream from all 6 Pyrogram clients and background tasks
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isPaused
                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20'
                : 'bg-[#111827] text-gray-300 border-[#1f2937] hover:text-white'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoScroll
                ? 'bg-blue-600/10 text-blue-400 border-blue-500/30'
                : 'bg-[#111827] text-gray-400 border-[#1f2937]'
            }`}
          >
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={handleClearView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white text-xs font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[#111827] border border-[#1f2937] rounded-xl p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">Bot:</span>
          <select
            value={botFilter}
            onChange={(e) => setBotFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#1f2937] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500"
          >
            {BOT_OPTIONS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-medium">Level:</span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#1f2937] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Levels</option>
            <option value="info">INFO</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
          </select>
        </div>

        <span className="ml-auto text-gray-500 font-mono text-[11px]">
          {logs.length} events buffered
        </span>
      </div>

      {/* Terminal View */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-[#0d1117] border border-[#1f2937] rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1 shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
            <ScrollText className="w-8 h-8 mb-2 opacity-50" />
            <p>No log events matching the selected filters.</p>
          </div>
        ) : (
          logs.map((log, idx) => {
            const level = (log.level as string) || 'INFO';
            const botId = (log.bot_id as string) || 'system';
            const timestamp = new Date(log.timestamp as string).toLocaleTimeString();
            const message = (log.message as string) || '';

            return (
              <div key={idx} className="flex items-start gap-2 hover:bg-[#111827]/60 py-0.5 px-1 rounded">
                <span className="text-gray-500 text-[11px] select-none flex-shrink-0">{timestamp}</span>
                <span className="text-purple-400 text-[11px] font-semibold flex-shrink-0 font-mono">
                  [{botId}]
                </span>
                <span
                  className={`text-[11px] font-bold flex-shrink-0 ${
                    level === 'ERROR'
                      ? 'text-red-400'
                      : level === 'WARNING'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}
                >
                  [{level}]
                </span>
                <span className="text-gray-200 break-all leading-relaxed">{message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
