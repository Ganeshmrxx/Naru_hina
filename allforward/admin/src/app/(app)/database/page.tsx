'use client';

import { useState, useEffect } from 'react';
import {
  Database, RefreshCw, CheckCircle2, XCircle, HardDrive, Layers,
  ChevronRight, Eye, ShieldCheck, AlertCircle
} from 'lucide-react';
import { LoadingState } from '@/components/ui/LoadingState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

const COLLECTION_META: Record<string, { cluster: 'A' | 'B'; desc: string; role: string }> = {
  chats: {
    cluster: 'A',
    role: 'Scan Queue',
    desc: 'Telegram channels and supergroups registered for automatic sequential media copying.'
  },
  forward_progress: {
    cluster: 'A',
    role: 'Resumption Tracking',
    desc: 'Highest message ID scanned per chat to prevent re-scanning old messages on reboot.'
  },
  media_store: {
    cluster: 'A',
    role: 'Media Archive Registry',
    desc: 'Indexed file IDs and destination message mappings for all copied videos and photos.'
  },
  daily_summary: {
    cluster: 'A',
    role: 'Daily Metrics',
    desc: 'Aggregate daily counts for total media, video count, photo count, and total transferred bytes.'
  },
  NovemberMovieData2: {
    cluster: 'A',
    role: 'NaruHina Movie Database',
    desc: 'Indexed movies, series, streaming hashes and metadata for Lucia Auto-Filter Bot.'
  },
  xDataChannels: {
    cluster: 'B',
    role: 'Channel Routing Map',
    desc: 'Channel-to-channel routing pairs used by Backup Forwarder Bot.'
  },
  xData: {
    cluster: 'B',
    role: 'Backup Media Registry',
    desc: 'Unique media file registry with target message IDs and callback deletion tracking.'
  },
  newMovieDatas2: {
    cluster: 'B',
    role: 'Movie Deduplication',
    desc: 'Unique video IDs for files >150MB handled by Movie Forwarder Bot.'
  },
  terabotsearch: {
    cluster: 'B',
    role: 'Search & Log Cache',
    desc: 'Cached search entries and channel interaction history for TeraBox modifier.'
  },
};

export default function DatabasePage() {
  const [dbStatus, setDbStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Inspector state
  const [selectedColl, setSelectedColl] = useState<string>('chats');
  const [sampleRecords, setSampleRecords] = useState<Record<string, unknown>[]>([]);
  const [inspectingLoading, setInspectingLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await api.getDatabaseStatus();
      setDbStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const inspectCollection = async (collName: string) => {
    setSelectedColl(collName);
    setInspectingLoading(true);
    try {
      const records = await api.getCollectionData(collName, 15);
      setSampleRecords(records);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to inspect collection');
      setSampleRecords([]);
    } finally {
      setInspectingLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    inspectCollection('chats');
  }, []);

  if (loading) return <LoadingState message="Connecting to MongoDB clusters..." />;

  const clusterA = (dbStatus?.cluster_a as Record<string, unknown>) || {};
  const clusterB = (dbStatus?.cluster_b as Record<string, unknown>) || {};
  const isAConnected = Boolean(clusterA.connected);
  const isBConnected = Boolean(clusterB.connected);

  const collsA = (clusterA.collections as Record<string, { count: number }>) || {};
  const collsB = (clusterB.collections as Record<string, { count: number }>) || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MongoDB Architecture & Collections</h1>
          <p className="text-sm text-gray-400 mt-1">
            Cluster health status, document distribution, and secure document inspector
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchStatus();
            inspectCollection(selectedColl);
          }}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] text-sm text-gray-300 hover:text-white hover:bg-[#1f2937] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Cluster Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Cluster A */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Cluster A (Main Engine)</h2>
                <p className="text-[11px] text-gray-500 font-mono">g3cwork_db_user @ cluster0.lpmpcya</p>
              </div>
            </div>
            <StatusBadge status={isAConnected ? 'online' : 'error'} label={isAConnected ? 'Connected' : 'Offline'} />
          </div>
          <p className="text-xs text-gray-400">
            Stores active scan dialogs, forward resumption markers, daily metrics, and media store.
          </p>
        </div>

        {/* Cluster B */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white text-sm">Cluster B (Plugins & Media)</h2>
                <p className="text-[11px] text-gray-500 font-mono">test @ cluster0.g05zxpa</p>
              </div>
            </div>
            <StatusBadge status={isBConnected ? 'online' : 'error'} label={isBConnected ? 'Connected' : 'Offline'} />
          </div>
          <p className="text-xs text-gray-400">
            Stores backup mappings, 150MB+ deduplication keys, and TeraBox search cache.
          </p>
        </div>
      </div>

      {/* Collections Grid */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3">Database Collections</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Object.entries(COLLECTION_META).map(([collName, meta]) => {
            const count = meta.cluster === 'A'
              ? (collsA[collName]?.count ?? 0)
              : (collsB[collName]?.count ?? 0);
            const isSelected = selectedColl === collName;

            return (
              <button
                key={collName}
                onClick={() => inspectCollection(collName)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500'
                    : 'bg-[#111827] border-[#1f2937] hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-sm text-white">{collName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-[#0d1117] border border-[#1f2937] text-gray-400">
                    Cluster {meta.cluster}
                  </span>
                </div>
                <p className="text-xl font-bold font-mono text-blue-400">{count.toLocaleString()}</p>
                <p className="text-[11px] text-gray-400 mt-1 font-medium">{meta.role}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Collection Inspector */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2937] pb-3">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              <Eye className="w-4 h-4 text-blue-400" />
              Document Inspector: <code className="text-blue-300 font-mono">{selectedColl}</code>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {COLLECTION_META[selectedColl]?.desc}
            </p>
          </div>
          <span className="text-xs text-gray-500">Showing latest 15 records</span>
        </div>

        {inspectingLoading ? (
          <div className="py-12 text-center text-xs text-gray-400">Loading documents...</div>
        ) : sampleRecords.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-500 font-mono">No records found in this collection</div>
        ) : (
          <div className="bg-[#0d1117] border border-[#1f2937] rounded-lg p-3 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {sampleRecords.map((rec, idx) => (
              <pre
                key={idx}
                className="p-3 bg-[#111827] border border-[#1f2937] rounded-lg text-gray-300 text-[11px] overflow-x-auto"
              >
                {JSON.stringify(rec, null, 2)}
              </pre>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
