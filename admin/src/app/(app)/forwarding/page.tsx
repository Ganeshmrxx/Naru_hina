'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft, Plus, Trash2, Play, RefreshCw, Layers, CheckCircle2,
  AlertTriangle, Radio, Film, Database,
  Images, ShieldAlert, Sparkles, Clock
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { UniversalStatusResponse, UniversalQueueItem, GroupedAlbumItem } from '@/lib/types';

export default function ForwardingPage() {
  const [activeTab, setActiveTab] = useState<'universal' | 'legacy'>('universal');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Universal Forwarder State
  const [universalStatus, setUniversalStatus] = useState<UniversalStatusResponse | null>(null);
  const [queueItems, setQueueItems] = useState<UniversalQueueItem[]>([]);
  const [groupedData, setGroupedData] = useState<{ total: number; albums: GroupedAlbumItem[] }>({
    total: 0,
    albums: [],
  });
  const [folderFilter, setFolderFilter] = useState<number | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>('all');

  // Legacy State
  const [mappings, setMappings] = useState<Record<string, unknown>[]>([]);
  const [chats, setChats] = useState<Record<string, unknown>[]>([]);
  const [legacyStatusFilter, setLegacyStatusFilter] = useState('all');

  // Mapping Form State
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [targetName, setTargetName] = useState('');
  const [creatingMapping, setCreatingMapping] = useState(false);

  // Add Queue Chat Form State
  const [newChatId, setNewChatId] = useState('');
  const [newChatTitle, setNewChatTitle] = useState('');
  const [newChatType, setNewChatType] = useState('channel');
  const [addingChat, setAddingChat] = useState(false);

  // Confirmation dialog
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const fetchUniversalData = useCallback(async () => {
    try {
      const [statusRes, queueRes, groupedRes] = await Promise.all([
        api.getUniversalForwarderStatus().catch(() => null),
        api.getUniversalForwarderQueue(folderFilter || undefined, queueStatusFilter).catch(() => []),
        api.getUniversalForwarderGrouped(30).catch(() => ({ total: 0, albums: [] })),
      ]);
      setUniversalStatus(statusRes);
      setQueueItems(queueRes);
      setGroupedData(groupedRes);
    } catch (e) {
      console.error('Error loading universal data:', e);
    }
  }, [folderFilter, queueStatusFilter]);

  const fetchLegacyData = useCallback(async () => {
    try {
      const [mappingsData, chatsData] = await Promise.all([
        api.getMappings().catch(() => []),
        api.getForwardingChats(legacyStatusFilter === 'all' ? undefined : legacyStatusFilter).catch(() => []),
      ]);
      setMappings(mappingsData);
      setChats(chatsData);
    } catch (e) {
      console.error('Error loading legacy data:', e);
    }
  }, [legacyStatusFilter]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchUniversalData(), fetchLegacyData()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchUniversalData, fetchLegacyData]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    toast('info', 'Forwarding data refreshed');
  };

  // Legacy Mapping Handlers
  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) {
      toast('warning', 'Source ID and Target ID are required');
      return;
    }
    setCreatingMapping(true);
    try {
      await api.createMapping({
        source_id: parseInt(sourceId),
        source_name: sourceName || `Channel ${sourceId}`,
        target_id: parseInt(targetId),
        target_name: targetName || `Channel ${targetId}`,
      });
      toast('success', 'Channel mapping created successfully');
      setSourceId('');
      setSourceName('');
      setTargetId('');
      setTargetName('');
      await fetchLegacyData();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to create mapping');
    } finally {
      setCreatingMapping(false);
    }
  };

  const handleDeleteMapping = (source_id: number, name: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Mapping?',
      message: `Are you sure you want to remove mapping for "${name}" (${source_id})? Real-time automatic forwarding for this channel will stop.`,
      action: async () => {
        try {
          await api.deleteMapping(source_id);
          toast('info', 'Mapping deleted');
          await fetchLegacyData();
        } catch (err: unknown) {
          toast('error', err instanceof Error ? err.message : 'Failed to delete mapping');
        }
      },
    });
  };

  const handleTriggerCopy = async (source_id: number, target_id: number, name: string) => {
    try {
      toast('info', `Starting copy job for ${name}...`);
      await api.copyMapping(source_id);
      toast('success', `Forwarding job launched! Check 'Forward Jobs' page for live progress.`);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to start forward job');
    }
  };

  const handleAddChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatId || !newChatTitle) {
      toast('warning', 'Chat ID and Title are required');
      return;
    }
    setAddingChat(true);
    try {
      await api.addForwardingChat({
        chat_id: parseInt(newChatId),
        title: newChatTitle,
        type: newChatType,
        status: 'pending',
      });
      toast('success', `Added "${newChatTitle}" to scan queue`);
      setNewChatId('');
      setNewChatTitle('');
      await fetchLegacyData();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to add chat');
    } finally {
      setAddingChat(false);
    }
  };

  const handleUpdateChatStatus = async (chatId: number, newStatus: string) => {
    try {
      await api.updateChatStatus(chatId, newStatus);
      toast('success', `Status updated to ${newStatus}`);
      await fetchLegacyData();
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to update chat status');
    }
  };

  const handleDeleteChat = (chatId: number, title: string) => {
    setConfirmState({
      open: true,
      title: 'Remove from Queue?',
      message: `Delete "${title}" (${chatId}) and its forward progress records from Cluster A?`,
      action: async () => {
        try {
          await api.deleteChat(chatId);
          toast('info', 'Chat removed from database');
          await fetchLegacyData();
        } catch (err: unknown) {
          toast('error', err instanceof Error ? err.message : 'Failed to delete chat');
        }
      },
    });
  };

  if (loading) return <LoadingState message="Loading forwarding engine data & status..." />;

  const activeProg = universalStatus?.active_progress;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-blue-400 animate-pulse" />
            Telegram Forwarding Hub
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Universal Folder Routing (videoDB & TeraDB), Live Queue & Media Album Backups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/forwarding/bulk"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Bulk Forwarder
          </Link>
          <Link
            href="/forwarding/jobs"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111827] border border-[#1f2937] hover:bg-[#1f2937] text-gray-300 hover:text-white text-sm font-medium transition-colors"
          >
            Active Jobs
          </Link>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors"
            title="Refresh tables"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-[#1f2937] gap-4">
        <button
          onClick={() => setActiveTab('universal')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'universal'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-blue-400" />
          Universal Forwarder (Folder 5 & 6)
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Active System
          </span>
        </button>

        <button
          onClick={() => setActiveTab('legacy')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'legacy'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 text-gray-400" />
          Legacy Mappings & Scanner Queue
        </button>
      </div>

      {/* ========================================================================= */}
      {/* UNIVERSAL FORWARDER TAB CONTENT */}
      {/* ========================================================================= */}
      {activeTab === 'universal' && (
        <div className="space-y-6">
          {/* Quick Info Banner */}
          <div className="bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-emerald-900/20 border border-blue-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="font-semibold text-white">2-Hour Folder Auto-Sync & Real-Time Live Listener:</span>
                <p className="text-gray-400 mt-0.5">
                  Universal Forwarder scans Folder 5 and Folder 6 every 2 hours (7200s). New incoming posts are copied immediately by the live listener.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Engine Ready
              </span>
            </div>
          </div>

          {/* Folder Routing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Folder 5: videoDB */}
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 hover:border-blue-500/40 transition-all space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Film className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      videoDB
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1f2937] text-purple-300">
                        Folder ID: 5
                      </span>
                    </h3>
                    <p className="text-xs text-gray-400">Target Channel: <span className="text-white font-medium">DBXVideos</span> (-1004401442087)</p>
                  </div>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                  Mode C Off
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block mb-0.5">Media Filter:</span>
                  <span className="text-emerald-400 font-medium">Videos & Albums Only</span>
                  <span className="text-gray-500 text-[10px] block">(Single photos skipped)</span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block mb-0.5">Restricted Policy:</span>
                  <span className="text-amber-400 font-medium">Auto-Remove From Folder</span>
                  <span className="text-gray-500 text-[10px] block">(0 disk usage constraint)</span>
                </div>
              </div>
            </div>

            {/* Folder 6: TeraDB */}
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 hover:border-blue-500/40 transition-all space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      TeraDB
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1f2937] text-blue-300">
                        Folder ID: 6
                      </span>
                    </h3>
                    <p className="text-xs text-gray-400">Target Channel: <span className="text-white font-medium">DBXTera</span> (-1004337870091)</p>
                  </div>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Mode C Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block mb-0.5">Content Type:</span>
                  <span className="text-blue-400 font-medium">TeraBox Links & Previews</span>
                  <span className="text-gray-500 text-[10px] block">(Full album copy allowed)</span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block mb-0.5">Restricted Engine:</span>
                  <span className="text-emerald-400 font-medium">Download & Upload</span>
                  <span className="text-gray-500 text-[10px] block">(via Userbot SESSION2)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <span className="text-xs text-gray-400 block">Channels Queued</span>
              <span className="text-xl font-bold text-amber-400 mt-1 block">
                {universalStatus?.total_queued ?? 0}
              </span>
            </div>
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <span className="text-xs text-gray-400 block">Completed Channels</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                {universalStatus?.total_completed ?? 0}
              </span>
            </div>
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <span className="text-xs text-gray-400 block">Restricted Removed</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block">
                {universalStatus?.total_restricted_removed ?? 0}
              </span>
            </div>
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <span className="text-xs text-gray-400 block">Grouped Albums Copied</span>
              <span className="text-xl font-bold text-purple-400 mt-1 block">
                {universalStatus?.total_grouped_albums ?? groupedData.total}
              </span>
            </div>
          </div>

          {/* Active Forwarding Progress Card */}
          {activeProg ? (
            <div className="bg-[#111827] border border-blue-500/40 rounded-xl p-5 sm:p-6 space-y-4 shadow-lg shadow-blue-500/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2937] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                    <h3 className="text-base font-bold text-white">
                      Active Channel: {activeProg.source_name || `Channel ${activeProg.chat_id}`}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    ID: <code className="text-blue-300 font-mono">{activeProg.chat_id}</code> | Folder:{' '}
                    <span className="text-purple-300 font-medium">{activeProg.folder_name}</span> ➔ Target:{' '}
                    <span className="text-emerald-300 font-medium">{activeProg.target_name}</span>
                  </p>
                </div>
                <StatusBadge status={activeProg.status || 'in_progress'} label={activeProg.status || 'In Progress'} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block">Current Message ID:</span>
                  <span className="text-base font-mono font-semibold text-white mt-1 block">
                    #{activeProg.last_msg_id}
                  </span>
                </div>
                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block">Total Messages Copied:</span>
                  <span className="text-base font-semibold text-emerald-400 mt-1 block">
                    {activeProg.total_copied}
                  </span>
                </div>
                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-400 block">Grouped Albums Copied:</span>
                  <span className="text-base font-semibold text-purple-400 mt-1 block">
                    {activeProg.grouped_copied ?? 0}
                  </span>
                </div>
              </div>

              {activeProg.updated_at && (
                <div className="text-[11px] text-gray-500 text-right">
                  Checkpoint saved: {new Date(activeProg.updated_at).toLocaleString()} (Auto-saves every 10 messages)
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Universal Forwarder is idle or awaiting next queue item. Live message listener is active.
            </div>
          )}

          {/* Queue Table (forward_queue) */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f2937] pb-4">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-400" />
                  Forward Queue (MongoDB <code className="text-amber-300">forward_queue</code>)
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Ordered backlog channels from Folder 5 and Folder 6
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Folder filter */}
                <div className="flex items-center gap-1 bg-[#0d1117] p-1 border border-[#1f2937] rounded-lg">
                  <button
                    onClick={() => setFolderFilter(null)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      folderFilter === null ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    All Folders
                  </button>
                  <button
                    onClick={() => setFolderFilter(5)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      folderFilter === 5 ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    videoDB (5)
                  </button>
                  <button
                    onClick={() => setFolderFilter(6)}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      folderFilter === 6 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    TeraDB (6)
                  </button>
                </div>

                {/* Status filter */}
                <select
                  value={queueStatusFilter}
                  onChange={(e) => setQueueStatusFilter(e.target.value)}
                  className="bg-[#0d1117] border border-[#1f2937] text-gray-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="removed_restricted">Removed Restricted</option>
                </select>
              </div>
            </div>

            {/* Queue Table */}
            {queueItems.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No channels in queue"
                description="Universal Forwarder will auto-populate this queue on its next 2-hour scan cycle or when channels are detected in folders."
              />
            ) : (
              <div className="overflow-x-auto border border-[#1f2937] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                    <tr>
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">Channel Title</th>
                      <th className="py-3 px-4">Chat ID</th>
                      <th className="py-3 px-4">Folder</th>
                      <th className="py-3 px-4">Target Destination</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {queueItems.map((q) => (
                      <tr key={`${q.chat_id}-${q.queue_position}`} className="hover:bg-[#1f2937]/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-gray-400 font-bold">{q.queue_position}</td>
                        <td className="py-3 px-4 font-medium text-white">{q.title || `Chat ${q.chat_id}`}</td>
                        <td className="py-3 px-4 font-mono text-gray-400">{q.chat_id}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                              q.folder_id === 5
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            }`}
                          >
                            {q.folder_name} ({q.folder_id})
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300">
                          {q.target_name} <span className="text-gray-500 text-[10px]">({q.target_id})</span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={q.status} label={q.status} />
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-right">
                          {q.updated_at ? new Date(q.updated_at).toLocaleString() : 'Just now'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Grouped Messages (Albums) Section */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2937] pb-4">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Images className="w-5 h-5 text-purple-400" />
                  Grouped Messages & Albums Log (MongoDB <code className="text-purple-300">grouped_messages</code>)
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Track every multi-item album copied intact across folders
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono self-start sm:self-auto">
                {groupedData.total} Total Albums Logged
              </span>
            </div>

            {groupedData.albums.length === 0 ? (
              <EmptyState
                icon={Images}
                title="No grouped albums copied yet"
                description="When albums containing photos/videos are copied, their media group IDs and item counts will appear here."
              />
            ) : (
              <div className="overflow-x-auto border border-[#1f2937] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                    <tr>
                      <th className="py-3 px-4">Source Channel</th>
                      <th className="py-3 px-4">Group ID</th>
                      <th className="py-3 px-4">Items in Album</th>
                      <th className="py-3 px-4">Message IDs</th>
                      <th className="py-3 px-4 text-right">Copied At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {groupedData.albums.map((alb) => (
                      <tr key={alb.group_id} className="hover:bg-[#1f2937]/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-white">
                          {alb.channel_title} <span className="text-gray-500 text-[10px]">({alb.channel_id})</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-purple-300">{alb.group_id}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold text-[11px]">
                            {alb.items_count} media items
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-400 text-[11px]">
                          {alb.message_ids?.slice(0, 5).join(', ')}
                          {alb.message_ids?.length > 5 ? ` +${alb.message_ids.length - 5} more` : ''}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-right">
                          {alb.copied_at ? new Date(alb.copied_at).toLocaleString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEGACY MAPPINGS & SCANNER TAB CONTENT */}
      {/* ========================================================================= */}
      {activeTab === 'legacy' && (
        <div className="space-y-6">
          {/* Visual Channel Router Callout */}
          <div className="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/30 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400">
                <Radio className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  Telegram-Style Visual Channel Router
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Interactive UI
                  </span>
                </h2>
                <p className="text-xs text-gray-300 mt-1">
                  Browse all Telegram channels in your account, see which ones you are Admin in, and set custom target channels.
                </p>
              </div>
            </div>
            <Link
              href="/bots/backup-forwarder"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-lg flex-shrink-0"
            >
              Open Visual Channel Router &rarr;
            </Link>
          </div>

          {/* Direct Channel Mappings */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2937] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-blue-400" />
                  Direct Channel Mappings
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Source to Target mappings stored in MongoDB <code className="text-blue-300">xDataChannels</code> (Backup Forwarder)
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 self-start sm:self-auto font-mono">
                {mappings.length} Mappings
              </span>
            </div>

            {/* Create Mapping Form */}
            <form onSubmit={handleCreateMapping} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-[#0d1117] border border-[#1f2937] rounded-lg">
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Source Chat ID</label>
                <input
                  type="text"
                  placeholder="-100123456789"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Source Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Movies HD"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Target Chat ID</label>
                <input
                  type="text"
                  placeholder="-100987654321"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Target Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Backup Archive"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingMapping}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 h-[34px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creatingMapping ? 'Saving...' : 'Add Mapping'}
                </button>
              </div>
            </form>

            {/* Mappings Table */}
            {mappings.length === 0 ? (
              <EmptyState
                icon={ArrowRightLeft}
                title="No Channel Mappings Configured"
                description="Add source and target channels above to start routing messages."
              />
            ) : (
              <div className="overflow-x-auto border border-[#1f2937] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                    <tr>
                      <th className="py-3 px-4">Source Channel</th>
                      <th className="py-3 px-4">Source ID</th>
                      <th className="py-3 px-4">Target Channel</th>
                      <th className="py-3 px-4">Target ID</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {mappings.map((m) => {
                      const sId = m.source_id as number;
                      const tId = m.target as number;
                      const sName = (m.source_name as string) || 'Source Channel';
                      const tName = (m.target_name as string) || 'Target Channel';

                      return (
                        <tr key={sId} className="hover:bg-[#1f2937]/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{sName}</td>
                          <td className="py-3 px-4 font-mono text-gray-400">{sId}</td>
                          <td className="py-3 px-4 font-medium text-white">{tName}</td>
                          <td className="py-3 px-4 font-mono text-gray-400">{tId}</td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => handleTriggerCopy(sId, tId, sName)}
                              className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 font-medium inline-flex items-center gap-1 transition-colors"
                              title="Trigger full media copy"
                            >
                              <Play className="w-3 h-3" />
                              Start Copy
                            </button>
                            <button
                              onClick={() => handleDeleteMapping(sId, sName)}
                              className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 font-medium inline-flex items-center gap-1 transition-colors"
                              title="Delete mapping"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Scanner Queue (Cluster A chats) */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f2937] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-green-400" />
                  Scanner Queue (MongoDB <code className="text-green-300">chats</code>)
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Channels configured for general sequential scan in Cluster A
                </p>
              </div>

              {/* Filter Bar */}
              <div className="flex items-center gap-1 bg-[#0d1117] p-1 border border-[#1f2937] rounded-lg self-start sm:self-auto text-xs">
                {['all', 'pending', 'running', 'done', 'notnow'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setLegacyStatusFilter(st)}
                    className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                      legacyStatusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Add to Queue Form */}
            <form onSubmit={handleAddChat} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-[#0d1117] border border-[#1f2937] rounded-lg">
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Chat ID</label>
                <input
                  type="text"
                  placeholder="-1001234567890"
                  value={newChatId}
                  onChange={(e) => setNewChatId(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Channel / Group Title</label>
                <input
                  type="text"
                  placeholder="e.g. Anime Hub"
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 block mb-1">Type</label>
                <select
                  value={newChatType}
                  onChange={(e) => setNewChatType(e.target.value)}
                  className="w-full bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="channel">Channel</option>
                  <option value="supergroup">Supergroup</option>
                  <option value="group">Group</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingChat}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 h-[34px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {addingChat ? 'Adding...' : 'Add to Queue'}
                </button>
              </div>
            </form>

            {/* Chats Table */}
            {chats.length === 0 ? (
              <EmptyState
                icon={Layers}
                title={`No ${legacyStatusFilter === 'all' ? '' : legacyStatusFilter} chats in queue`}
                description="Add channels to the queue using the form above."
              />
            ) : (
              <div className="overflow-x-auto border border-[#1f2937] rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0d1117] text-gray-400 uppercase tracking-wider font-semibold border-b border-[#1f2937]">
                    <tr>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Chat ID</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Scanned</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {chats.map((c) => {
                      const cId = c.chat_id as number;
                      const cTitle = (c.title as string) || 'Unknown';
                      const cType = (c.type as string) || 'channel';
                      const cStatus = (c.status as string) || 'pending';
                      const lastScan = c.last_scan ? new Date(c.last_scan as string).toLocaleString() : 'Never';

                      return (
                        <tr key={cId} className="hover:bg-[#1f2937]/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{cTitle}</td>
                          <td className="py-3 px-4 font-mono text-gray-400">{cId}</td>
                          <td className="py-3 px-4 text-gray-300 capitalize">{cType}</td>
                          <td className="py-3 px-4">
                            <StatusBadge
                              status={cStatus as 'pending' | 'running' | 'done' | 'notnow'}
                              label={cStatus}
                            />
                          </td>
                          <td className="py-3 px-4 text-gray-400">{lastScan}</td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            {cStatus !== 'pending' && (
                              <button
                                onClick={() => handleUpdateChatStatus(cId, 'pending')}
                                className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-[11px] font-medium transition-colors"
                              >
                                Queue (Pending)
                              </button>
                            )}
                            {cStatus !== 'notnow' && (
                              <button
                                onClick={() => handleUpdateChatStatus(cId, 'notnow')}
                                className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 text-[11px] font-medium transition-colors"
                              >
                                Skip (NotNow)
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteChat(cId, cTitle)}
                              className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[11px] font-medium transition-colors"
                              title="Delete from database"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={async () => {
          setConfirmState((prev) => ({ ...prev, open: false }));
          await confirmState.action();
        }}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
