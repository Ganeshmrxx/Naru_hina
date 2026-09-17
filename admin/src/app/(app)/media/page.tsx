'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Film, Image, FileText, Search, Play, ArrowRight,
  RefreshCw, CheckCircle2, Clock, HardDrive, ShieldCheck,
  Send, ExternalLink, X, AlertCircle, Folder, Lock, Globe,
  Users, Link2, Sparkles
} from 'lucide-react';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { TelegramFolder, TelegramFolderChannel, TelegramMediaItem, TelegramChannelStats } from '@/lib/types';

export default function MediaGalleryPage() {
  const [folders, setFolders] = useState<TelegramFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<TelegramFolderChannel | null>(null);
  
  const [mediaItems, setMediaItems] = useState<TelegramMediaItem[]>([]);
  const [channelStats, setChannelStats] = useState<TelegramChannelStats | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'photo' | 'document'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Target DB channels for forwarding
  const [targetChannels, setTargetChannels] = useState<TelegramFolderChannel[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  
  // Active Preview Modal
  const [previewItem, setPreviewItem] = useState<TelegramMediaItem | null>(null);
  const [forwardingId, setForwardingId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [copiedStreamUrl, setCopiedStreamUrl] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setVideoError(null);
    setCopiedStreamUrl(false);
  }, [previewItem]);

  const getStreamUrl = (item: TelegramMediaItem | null) => {
    if (!item) return '';
    const path = item.stream_url || `/api/telegram/media/${item.chat_id}/${item.message_id}/stream`;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${path}`;
    }
    return path;
  };

  const copyStreamUrl = (item: TelegramMediaItem) => {
    const url = getStreamUrl(item);
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
    }
    setCopiedStreamUrl(true);
    toast('success', 'Stream URL copied! Paste into VLC or external player.');
    setTimeout(() => setCopiedStreamUrl(false), 3000);
  };

  const openInVlc = (item: TelegramMediaItem) => {
    const url = getStreamUrl(item);
    window.open(`vlc://${url}`, '_blank');
    toast('info', 'Opening in VLC...');
  };

  // 1. Fetch Folders & Channels
  const fetchFolders = async () => {
    try {
      setLoadingFolders(true);
      const data = await api.getTelegramFolders();
      setFolders(data);
      
      // Extract Target Hub channels (ID 4)
      const targetFolder = data.find((f) => f.id === 4 || f.title.toLowerCase().includes('target'));
      if (targetFolder && targetFolder.channels.length > 0) {
        setTargetChannels(targetFolder.channels);
        setSelectedTargetId(targetFolder.channels[0].chat_id);
      }
      
      // Default to Videos DB1P (5) or Videos DB1U (9) or first folder with channels
      const defaultFolder = data.find((f) => f.id === 5 && f.channels.length > 0)
        || data.find((f) => f.id === 9 && f.channels.length > 0)
        || data.find((f) => f.channels.length > 0);
        
      if (defaultFolder) {
        setSelectedFolderId(defaultFolder.id);
        if (defaultFolder.channels.length > 0) {
          setSelectedChannel(defaultFolder.channels[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load folders:', err);
      toast('error', 'Failed to load Telegram folders');
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // 2. Fetch Media when selected channel changes
  const fetchMedia = async (chatId: number) => {
    try {
      setLoadingMedia(true);
      const items = await api.getChannelMedia(chatId, 50);
      setMediaItems(items);
    } catch (err) {
      console.error('Failed to load channel media:', err);
      toast('error', 'Could not load media from this channel');
      setMediaItems([]);
    } finally {
      setLoadingMedia(false);
    }
  };

  // 2b. Fetch Channel Total Quantities & Stats
  const fetchStats = async (chatId: number) => {
    try {
      setLoadingStats(true);
      const stats = await api.getChannelStats(chatId);
      setChannelStats(stats);
    } catch (err) {
      console.error('Failed to load channel stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (selectedChannel) {
      fetchMedia(selectedChannel.chat_id);
      fetchStats(selectedChannel.chat_id);
    } else {
      setChannelStats(null);
      setMediaItems([]);
    }
  }, [selectedChannel]);

  // Handle Folder Change
  const handleSelectFolder = (fid: number) => {
    setSelectedFolderId(fid);
    const folder = folders.find((f) => f.id === fid);
    if (folder && folder.channels.length > 0) {
      setSelectedChannel(folder.channels[0]);
    } else {
      setSelectedChannel(null);
      setChannelStats(null);
      setMediaItems([]);
    }
  };

  // 3. Forward Single Media Item
  const handleForward = async (item: TelegramMediaItem) => {
    if (!selectedTargetId) {
      toast('warning', 'Please select a Target Hub channel first');
      return;
    }
    
    try {
      setForwardingId(item.message_id);
      const res = await api.forwardMedia({
        from_chat_id: item.chat_id,
        to_chat_id: selectedTargetId,
        message_ids: [item.message_id],
      });
      
      if (res.success) {
        toast('success', `Forwarded ${item.file_name} to Target Hub!`);
        if (previewItem?.message_id === item.message_id) {
          setPreviewItem(null);
        }
      }
    } catch (err) {
      console.error('Forward failed:', err);
      toast('error', 'Forward failed: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setForwardingId(null);
    }
  };

  // Active Channels in selected folder
  const currentFolderChannels = useMemo(() => {
    const f = folders.find((f) => f.id === selectedFolderId);
    return f ? f.channels : [];
  }, [folders, selectedFolderId]);

  // Filtered Media Items
  const filteredMedia = useMemo(() => {
    return mediaItems.filter((item) => {
      const matchesType = typeFilter === 'all' || item.media_type === typeFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q
        || item.file_name.toLowerCase().includes(q)
        || item.caption.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [mediaItems, typeFilter, searchQuery]);

  if (loadingFolders) {
    return <LoadingState message="Loading Telegram folders & channels..." />;
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Film className="w-6 h-6 text-blue-400" />
            Media Gallery & In-Browser Viewer
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Browse posters, videos, photos, and forward single items to Target DB in 1-click.
          </p>
        </div>

        {/* Global Target Hub Selector */}
        {targetChannels.length > 0 && (
          <div className="flex items-center gap-2 bg-[#111827] border border-[#1f2937] p-2 rounded-xl">
            <span className="text-xs text-gray-400 pl-1 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Target Hub:
            </span>
            <select
              value={selectedTargetId || ''}
              onChange={(e) => setSelectedTargetId(Number(e.target.value))}
              className="bg-[#0d1117] border border-[#1f2937] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-medium"
            >
              {targetChannels.map((c) => (
                <option key={c.chat_id} value={c.chat_id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 1. Folder Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {folders.map((f) => {
          const isSelected = f.id === selectedFolderId;
          return (
            <button
              key={f.id}
              onClick={() => handleSelectFolder(f.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-[#111827] border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1a2332]'
              }`}
            >
              <span>{f.emoticon || '📁'}</span>
              <span>{f.title}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-[#0d1117] text-gray-400'
                }`}
              >
                {f.channels_count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Channel Selector Bar */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
            Select Channel:
          </span>
          {currentFolderChannels.length === 0 ? (
            <span className="text-xs text-gray-500 italic">No channels in this folder</span>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin flex-1">
              {currentFolderChannels.map((c) => {
                const isSelected = selectedChannel?.chat_id === c.chat_id;
                return (
                  <button
                    key={c.chat_id}
                    onClick={() => setSelectedChannel(c)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-[#0d1117] border border-[#1f2937] text-gray-300 hover:text-white'
                    }`}
                  >
                    {c.is_public ? (
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-yellow-400" />
                    )}
                    <span className="truncate max-w-[180px]">{c.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedChannel && (
          <button
            onClick={() => {
              fetchMedia(selectedChannel.chat_id);
              fetchStats(selectedChannel.chat_id);
            }}
            disabled={loadingMedia || loadingStats}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#1f2937] text-xs text-gray-300 hover:text-white transition-colors self-end md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loadingMedia || loadingStats) ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* 2.5 Channel Quality & Media Breakdown Banner (Telegram Profile Style) */}
      {selectedChannel && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Channel Info & Value Assessment */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 select-none">
                {selectedChannel.title.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white leading-tight">
                    {selectedChannel.title}
                  </h2>
                  {selectedChannel.is_public ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                      <Globe className="w-3 h-3" />
                      @{selectedChannel.username}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
                      <Lock className="w-3 h-3" />
                      Private
                    </span>
                  )}
                  {channelStats && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                        channelStats.videos_count >= 100
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : channelStats.videos_count >= 20
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : channelStats.documents_count >= 50
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {channelStats.assessment}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  <span className="font-mono text-gray-500">ID: {selectedChannel.chat_id}</span>
                  {channelStats?.members_count !== null && channelStats?.members_count !== undefined && (
                    <span className="flex items-center gap-1 text-gray-300">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {channelStats.members_count.toLocaleString()} subscribers
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 4 Exact Telegram Gallery Metric Counters */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              {/* Videos Counter */}
              <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2937] px-3 py-1.5 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Film className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider">Videos</p>
                  <p className="text-xs sm:text-sm font-bold text-white font-mono">
                    {loadingStats ? (
                      <span className="inline-block w-8 h-3.5 bg-gray-800 animate-pulse rounded" />
                    ) : (
                      channelStats?.videos_count.toLocaleString() ?? '—'
                    )}
                  </p>
                </div>
              </div>

              {/* Photos Counter */}
              <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2937] px-3 py-1.5 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Image className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider">Photos</p>
                  <p className="text-xs sm:text-sm font-bold text-white font-mono">
                    {loadingStats ? (
                      <span className="inline-block w-8 h-3.5 bg-gray-800 animate-pulse rounded" />
                    ) : (
                      channelStats?.photos_count.toLocaleString() ?? '—'
                    )}
                  </p>
                </div>
              </div>

              {/* Files / Documents Counter */}
              <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2937] px-3 py-1.5 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider">Files</p>
                  <p className="text-xs sm:text-sm font-bold text-white font-mono">
                    {loadingStats ? (
                      <span className="inline-block w-8 h-3.5 bg-gray-800 animate-pulse rounded" />
                    ) : (
                      channelStats?.documents_count.toLocaleString() ?? '—'
                    )}
                  </p>
                </div>
              </div>

              {/* Links Counter */}
              <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1f2937] px-3 py-1.5 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Link2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-semibold text-gray-400 tracking-wider">Links</p>
                  <p className="text-xs sm:text-sm font-bold text-white font-mono">
                    {loadingStats ? (
                      <span className="inline-block w-8 h-3.5 bg-gray-800 animate-pulse rounded" />
                    ) : (
                      channelStats?.links_count.toLocaleString() ?? '—'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search & Type Filter Toolbar */}
      {selectedChannel && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111827] border border-[#1f2937] p-3 rounded-xl">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search filename or caption..."
              className="w-full bg-[#0d1117] border border-[#1f2937] rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto overflow-x-auto">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white'
              }`}
            >
              All {channelStats ? `(${channelStats.total_media.toLocaleString()})` : `(${mediaItems.length})`}
            </button>
            <button
              onClick={() => setTypeFilter('video')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === 'video'
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white'
              }`}
            >
              <Film className="w-3 h-3" />
              Videos {channelStats ? `(${channelStats.videos_count.toLocaleString()})` : ''}
            </button>
            <button
              onClick={() => setTypeFilter('photo')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === 'photo'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white'
              }`}
            >
              <Image className="w-3 h-3" />
              Photos {channelStats ? `(${channelStats.photos_count.toLocaleString()})` : ''}
            </button>
            <button
              onClick={() => setTypeFilter('document')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === 'document'
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#0d1117] border border-[#1f2937] text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-3 h-3" />
              Files {channelStats ? `(${channelStats.documents_count.toLocaleString()})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* 4. Media Grid View */}
      {loadingMedia ? (
        <LoadingState message="Fetching recent media posters & thumbnails..." />
      ) : !selectedChannel ? (
        <EmptyState
          icon={Folder}
          title="No Channel Selected"
          description="Choose a folder and channel from above to inspect media files."
        />
      ) : filteredMedia.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No Media Found"
          description="This channel doesn't have any matching media in the latest messages."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredMedia.map((item) => {
            const isVideo = item.media_type === 'video';
            const isPhoto = item.media_type === 'photo';

            return (
              <div
                key={item.message_id}
                className="group bg-[#111827] border border-[#1f2937] hover:border-blue-500/50 rounded-xl overflow-hidden flex flex-col transition-all hover:shadow-xl hover:shadow-blue-500/5"
              >
                {/* Poster / Thumbnail Container */}
                <div
                  className="relative aspect-[3/4] bg-[#0d1117] overflow-hidden cursor-pointer flex items-center justify-center"
                  onClick={() => setPreviewItem(item)}
                >
                  {/* Background Fallback Icon */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2 p-4 text-center">
                    {isVideo ? <Film className="w-10 h-10" /> : isPhoto ? <Image className="w-10 h-10" /> : <FileText className="w-10 h-10" />}
                    <span className="text-[10px] text-gray-500">
                      {item.has_thumb ? 'Loading preview...' : 'No preview available'}
                    </span>
                  </div>

                  {item.has_thumb && item.thumb_url && (
                    <img
                      src={item.thumb_url}
                      alt={item.file_name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}

                  {/* Play Overlay for Video */}
                  {isVideo && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 ml-0.5" />
                      </div>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/70 backdrop-blur-sm text-white uppercase tracking-wider">
                      {item.media_type}
                    </span>
                  </div>

                  {/* Bottom Badges */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-white">
                    {item.file_size_formatted && (
                      <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm">
                        {item.file_size_formatted}
                      </span>
                    )}
                    {item.duration_formatted && (
                      <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm font-semibold text-blue-300">
                        {item.duration_formatted}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Info & Actions */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2 bg-[#111827]">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-200 line-clamp-2 leading-snug" title={item.file_name}>
                      {item.file_name}
                    </h4>
                    {item.caption && (
                      <p className="text-[10px] text-gray-500 line-clamp-1 mt-1">
                        {item.caption}
                      </p>
                    )}
                  </div>

                  {/* One-Click Forward Action */}
                  <button
                    onClick={() => handleForward(item)}
                    disabled={forwardingId === item.message_id}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 hover:border-transparent text-xs font-medium transition-all disabled:opacity-50"
                  >
                    {forwardingId === item.message_id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Forward to DB</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Detailed Preview & Player Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-[#111827] border border-[#1f2937] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#1f2937] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400">
                  {previewItem.media_type}
                </span>
                <span className="text-xs text-gray-400">Msg ID: #{previewItem.message_id}</span>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#1f2937] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Media View */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="relative aspect-video bg-[#0a0a0f] rounded-xl overflow-hidden flex items-center justify-center border border-[#1f2937]">
                {previewItem.media_type === 'video' && isPlaying ? (
                  <video
                    key={previewItem.message_id}
                    src={previewItem.stream_url || `/api/telegram/media/${previewItem.chat_id}/${previewItem.message_id}/stream`}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain bg-black"
                    onLoadedData={() => {
                      setVideoError(null);
                    }}
                    onError={(e) => {
                      const err = e.currentTarget.error;
                      if (err?.code === 4) {
                        setVideoError('Browser Codec Limitation: Your browser cannot decode this video format directly. Use "Open in VLC" or "Download" below to play.');
                      } else if (err?.code === 2) {
                        setVideoError('Network Stream Error: Server connection was interrupted. Please retry or open in VLC.');
                      } else {
                        setVideoError('Playback Error: Could not play video stream directly in browser. Use "Open in VLC" or "Download" below.');
                      }
                    }}
                  >
                    Your browser does not support HTML5 video streaming.
                  </video>
                ) : (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                      <Film className="w-16 h-16" />
                    </div>
                    {previewItem.has_thumb && previewItem.thumb_url && (
                      <img
                        src={previewItem.thumb_url}
                        alt={previewItem.file_name}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    )}
                    {previewItem.media_type === 'video' && (
                      <div
                        className="absolute inset-0 bg-black/40 hover:bg-black/20 flex flex-col items-center justify-center cursor-pointer transition-all group"
                        onClick={() => setIsPlaying(true)}
                      >
                        <div className="w-16 h-16 rounded-full bg-blue-600 group-hover:bg-blue-500 text-white flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
                          <Play className="w-8 h-8 ml-1" />
                        </div>
                        <span className="mt-3 px-3 py-1 rounded-full text-xs font-semibold bg-black/80 text-white backdrop-blur-sm shadow-lg">
                          Click to Play Video
                        </span>
                      </div>
                    )}
                    {previewItem.media_type === 'video' && (
                      <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/80 text-white text-xs font-mono">
                        Duration: {previewItem.duration_formatted || 'N/A'}
                      </div>
                    )}
                  </>
                )}
              </div>

              {videoError && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Browser Codec Limitation</p>
                    <p className="mt-0.5 text-yellow-400/90">{videoError}</p>
                  </div>
                </div>
              )}

              {/* Video Action Toolbar */}
              {previewItem.media_type === 'video' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {!isPlaying && (
                    <button
                      onClick={() => setIsPlaying(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Play in Browser
                    </button>
                  )}
                  <button
                    onClick={() => openInVlc(previewItem)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2937] hover:bg-[#2d3748] text-gray-200 text-xs font-medium border border-[#374151] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                    Open in VLC Player
                  </button>
                  <button
                    onClick={() => copyStreamUrl(previewItem)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2937] hover:bg-[#2d3748] text-gray-200 text-xs font-medium border border-[#374151] transition-colors"
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${copiedStreamUrl ? 'text-green-400' : 'text-gray-400'}`} />
                    {copiedStreamUrl ? 'Copied URL!' : 'Copy Stream Link'}
                  </button>
                  <a
                    href={previewItem.stream_url || `/api/telegram/media/${previewItem.chat_id}/${previewItem.message_id}/stream`}
                    download={previewItem.file_name}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2937] hover:bg-[#2d3748] text-gray-200 text-xs font-medium border border-[#374151] transition-colors"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                    Download Video
                  </a>
                </div>
              )}

              {previewItem.media_type === 'video' && (
                <p className="text-[11px] text-gray-500 italic">
                  💡 Tip: High-bitrate 1080p movies ke smooth playback ke liye <strong>Open in VLC Player</strong> ya <strong>Copy Stream Link</strong> use karein (VLC pre-buffers 10s ahead bina buffering ke).
                </p>
              )}

              {/* Technical Specifications */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-500 block text-[10px]">FILE SIZE</span>
                  <span className="font-semibold text-white mt-0.5 block">{previewItem.file_size_formatted}</span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-500 block text-[10px]">DURATION</span>
                  <span className="font-semibold text-blue-400 mt-0.5 block">{previewItem.duration_formatted || 'N/A'}</span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1f2937]">
                  <span className="text-gray-500 block text-[10px]">POSTED DATE</span>
                  <span className="font-semibold text-gray-300 mt-0.5 block">
                    {previewItem.date ? new Date(previewItem.date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* File Title & Caption */}
              <div>
                <h3 className="font-semibold text-sm text-white">{previewItem.file_name}</h3>
                {previewItem.caption && (
                  <div className="mt-2 p-3 rounded-lg bg-[#0d1117] border border-[#1f2937] text-xs text-gray-300 whitespace-pre-wrap">
                    {previewItem.caption}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer / Dispatch Actions */}
            <div className="p-4 border-t border-[#1f2937] bg-[#0d1117] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-gray-400 flex items-center gap-1.5">
                <span>Dispatch to:</span>
                <span className="text-blue-400 font-semibold">
                  {targetChannels.find((t) => t.chat_id === selectedTargetId)?.title || 'Target Hub'}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setPreviewItem(null)}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-[#1f2937] hover:bg-[#2d3748] text-xs font-medium text-gray-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleForward(previewItem)}
                  disabled={forwardingId === previewItem.message_id}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
                >
                  {forwardingId === previewItem.message_id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Forward Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
