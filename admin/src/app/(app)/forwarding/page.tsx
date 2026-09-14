'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft, Plus, Trash2, Play, RefreshCw, Layers, CheckCircle2,
  AlertTriangle, Filter, ExternalLink, Radio
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';

export default function ForwardingPage() {
  const [mappings, setMappings] = useState<Record<string, unknown>[]>([]);
  const [chats, setChats] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

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

  const fetchData = async () => {
    try {
      const [mappingsData, chatsData] = await Promise.all([
        api.getMappings().catch(() => []),
        api.getForwardingChats(statusFilter === 'all' ? undefined : statusFilter).catch(() => []),
      ]);
      setMappings(mappingsData);
      setChats(chatsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

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
      await fetchData();
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
          await fetchData();
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
      await fetchData();
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
      await fetchData();
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
          await fetchData();
        } catch (err: unknown) {
          toast('error', err instanceof Error ? err.message : 'Failed to delete chat');
        }
      },
    });
  };

  if (loading) return <LoadingState message="Loading forwarding mappings & queue..." />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telegram Forwarding Hub</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage channel-to-channel routing (Cluster B) and automatic scan queues (Cluster A)
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
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors"
            title="Refresh tables"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Visual Telegram Router Callout */}
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
              Browse all Telegram channels in your account, see which ones you are Admin in, and click to set or change target channels with automatic real-time and historical forwarding!
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

      {/* SECTION 1: Channel Mappings */}
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

      {/* SECTION 2: Auto-Scan Queue (Cluster A chats) */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f2937] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-green-400" />
              Forwarding Scan Queue (Main Engine)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Channels queued for sequential scan in MongoDB <code className="text-green-300">chats</code> collection
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1 bg-[#0d1117] p-1 border border-[#1f2937] rounded-lg self-start sm:self-auto text-xs">
            {['all', 'pending', 'running', 'done', 'notnow'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                  statusFilter === st
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
            title={`No ${statusFilter === 'all' ? '' : statusFilter} chats in queue`}
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
