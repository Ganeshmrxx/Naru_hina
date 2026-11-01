'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Hash, Search, Filter, RefreshCw, ExternalLink, ShieldCheck,
  Radio, Layers, ArrowRightLeft, Film, ShieldAlert, CheckCircle2,
  Trash2, Send
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Weekly / On-Demand Health Scan State
  const [healthStatus, setHealthStatus] = useState<{
    is_running: boolean;
    started_at: string | null;
    completed_at: string | null;
    total_scanned: number;
    accessible_count: number;
    banned_left_count: number;
    current_chat: string | null;
    last_summary: string | null;
  } | null>(null);
  const [startingScan, setStartingScan] = useState(false);

  const fetchHealthStatus = async () => {
    try {
      const s = await api.getHealthScanStatus();
      setHealthStatus(s);
    } catch {
      // silent
    }
  };

  const startScan = async () => {
    try {
      setStartingScan(true);
      const res = await api.startHealthScan('ganeshmrxx');
      toast('success', res.message || 'Health scan started. Report will be sent to @ganeshmrxx');
      fetchHealthStatus();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start health scan');
    } finally {
      setStartingScan(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const data = await api.getChannels();
      setChannels(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchHealthStatus();
    const interval = setInterval(() => {
      fetchHealthStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      const title = (c.title as string || '').toLowerCase();
      const chatId = String(c.chat_id || '');
      const type = (c.type as string || '').toLowerCase();

      const matchesSearch = title.includes(searchQuery.toLowerCase()) || chatId.includes(searchQuery);
      const matchesType = typeFilter === 'all' || type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [channels, searchQuery, typeFilter]);

  if (loading) return <LoadingState message="Loading channels & groups registry..." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Channels & Groups Directory</h1>
          <p className="text-sm text-gray-400 mt-1">
            Aggregated known chats across MongoDB scan queues (<code className="text-blue-300">chats</code>) and routing mappings (<code className="text-purple-300">xDataChannels</code>)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startScan}
            disabled={startingScan || healthStatus?.is_running}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-md transition-all ${
              healthStatus?.is_running
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 ${healthStatus?.is_running ? 'animate-pulse text-amber-300' : ''}`} />
            {healthStatus?.is_running ? 'Scanning Health...' : 'Run Health & Cleaner Scan'}
          </button>
          <button
            onClick={() => {
              setRefreshing(true);
              fetchChannels();
              fetchHealthStatus();
            }}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] text-xs text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Weekly / On-Demand Health Scan Banner */}
      {healthStatus && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2937] pb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${healthStatus.is_running ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <h3 className="text-sm font-bold text-white">
                Weekly Channel Health & Inaccessible Cleaner
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                Reports to: @ganeshmrxx
              </span>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">
              {healthStatus.is_running ? (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Testing live channels (2.5s safe cooldown)...
                </span>
              ) : healthStatus.completed_at ? (
                `Last Scan: ${new Date(healthStatus.completed_at).toLocaleString()}`
              ) : (
                'Auto-runs every 7 days (Safe zero-floodwait)'
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
              <span className="text-gray-400 block text-[11px]">Channels Tested:</span>
              <span className="text-base font-bold text-white mt-1 block">
                {healthStatus.total_scanned}
              </span>
            </div>
            <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
              <span className="text-gray-400 block text-[11px]">Accessible & Active:</span>
              <span className="text-base font-bold text-emerald-400 mt-1 block">
                {healthStatus.accessible_count}
              </span>
            </div>
            <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
              <span className="text-gray-400 block text-[11px]">Banned/Dead Left:</span>
              <span className="text-base font-bold text-rose-400 mt-1 block">
                {healthStatus.banned_left_count}
              </span>
            </div>
            <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
              <span className="text-gray-400 block text-[11px]">Current Progress:</span>
              <span className="text-xs font-mono font-medium text-blue-300 mt-1 block truncate" title={healthStatus.current_chat || 'Idle'}>
                {healthStatus.current_chat || 'Idle'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-[#111827] border border-[#1f2937] rounded-xl p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Channel Title or Telegram ID..."
            className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {['all', 'channel', 'supergroup', 'group'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                typeFilter === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Channels Table */}
      {filteredChannels.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="No Chats Match Your Filter"
          description="Try clearing your search query or adjusting the type filter."
        />
      ) : (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                <tr>
                  <th className="py-3 px-4">Title / Name</th>
                  <th className="py-3 px-4">Telegram ID</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Queue Status</th>
                  <th className="py-3 px-4">Origin / Registry</th>
                  <th className="py-3 px-4">Last Scanned</th>
                  <th className="py-3 px-4 text-right">Media</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {filteredChannels.map((c, i) => {
                  const chatId = c.chat_id as number;
                  const title = (c.title as string) || 'Unknown Chat';
                  const type = (c.type as string) || 'channel';
                  const status = (c.status as string) || 'pending';
                  const source = (c.source as string) || 'queue';
                  const lastScan = c.last_scan ? new Date(c.last_scan as string).toLocaleString() : 'Never';

                  return (
                    <tr key={i} className="hover:bg-[#1f2937]/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">{title}</td>
                      <td className="py-3 px-4 font-mono text-blue-400">{chatId}</td>
                      <td className="py-3 px-4 text-gray-300 capitalize">{type}</td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          status={status === 'mapped' ? 'online' : (status as 'pending' | 'running' | 'done' | 'notnow')}
                          label={status}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0d1117] border border-[#1f2937] text-gray-400">
                          {source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400">{lastScan}</td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href="/media"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 text-xs font-medium transition-colors"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>Gallery</span>
                        </Link>
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
