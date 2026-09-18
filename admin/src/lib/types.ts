export interface BotStatus {
  bot_id: string;
  name: string;
  is_running: boolean;
  started_at: string | null;
  last_heartbeat: string | null;
  last_error: string | null;
  messages_processed: number;
  session_type: 'userbot' | 'bot_token';
  spam_enabled?: boolean;
  promote_enabled?: boolean;
}

export interface DailySummary {
  date: string;
  total_media: number;
  videos: number;
  photos: number;
  total_size: number;
}

export interface ChatRecord {
  chat_id: number;
  title: string;
  type: string;
  status: string;
  last_scan: string | null;
  added_by: string;
}

export interface ForwardProgress {
  chat_id: number;
  last_msg_id: number;
}

export interface ChannelMapping {
  _id: number;
  source_name: string;
  target: number;
  target_name: string;
}

export interface LogEntry {
  timestamp: string;
  bot_id: string;
  level: string;
  message: string;
}

export interface ErrorEntry {
  timestamp: string;
  bot_id: string;
  error_type: string;
  message: string;
  count: number;
  last_occurrence: string;
}

export interface DatabaseStatus {
  cluster_a: {
    connected: boolean;
    collections: Record<string, { count: number }>;
  };
  cluster_b: {
    connected: boolean;
    collections: Record<string, { count: number }>;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TelegramDialog {
  id: number;
  title: string;
  username: string | null;
  type: 'channel' | 'group' | string;
  is_creator: boolean;
  is_admin: boolean;
  can_post: boolean;
  members_count: number | null;
  is_mapped: boolean;
  folder_id?: number | null;
  folder_name?: string | null;
  target_id: number | null;
  target_name: string | null;
  is_live?: boolean;
  live_status?: 'active' | 'dead' | string;
  sync_status?: 'syncing' | 'completed' | 'idle' | string | null;
  sync_processed?: number;
  sync_total?: number;
  sync_remaining?: number;
  sync_pct?: number;
}

export interface TelegramFolderChannel {
  chat_id: number;
  title: string;
  username: string | null;
  is_public: boolean;
  has_protected_content: boolean;
}

export interface TelegramFolder {
  id: number;
  title: string;
  emoticon: string;
  channels_count: number;
  channels: TelegramFolderChannel[];
}

export interface TelegramMediaItem {
  message_id: number;
  chat_id: number;
  media_type: 'video' | 'photo' | 'document';
  file_name: string;
  file_size: number;
  file_size_formatted: string;
  duration: number | null;
  duration_formatted: string | null;
  caption: string;
  date: string;
  has_thumb: boolean;
  thumb_url: string | null;
  stream_url?: string | null;
}

export interface TelegramChannelStats {
  chat_id: number;
  title: string;
  username: string | null;
  members_count: number | null;
  videos_count: number;
  photos_count: number;
  documents_count: number;
  audio_count: number;
  links_count: number;
  total_media: number;
  assessment: string;
  assessment_badge: string;
}

export interface UniversalForwardProgress {
  chat_id: number;
  source_id?: number;
  source_name: string;
  folder_name: string;
  target_id: number;
  target_name: string;
  last_msg_id: number;
  total_copied: number;
  grouped_copied?: number;
  status: string;
  channel_type: string;
  updated_at?: string;
}

export interface UniversalQueueItem {
  queue_position: number;
  chat_id: number;
  title: string;
  folder_name: string;
  folder_id: number;
  target_id: number;
  target_name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'removed_restricted' | string;
  updated_at?: string;
}

export interface GroupedAlbumItem {
  channel_id: number;
  channel_title: string;
  group_id: string;
  target_id: number;
  items_count: number;
  message_ids: number[];
  copied_at: string;
}

export interface UniversalFolderInfo {
  id: number;
  name: string;
  target: string;
  target_id: number;
  mode_c: boolean;
}

export interface UniversalStatusResponse {
  active_progress: UniversalForwardProgress | null;
  total_queued: number;
  total_completed: number;
  total_restricted_removed: number;
  total_grouped_albums: number;
  folders: UniversalFolderInfo[];
}

export interface ForwardJob {
  job_id: string;
  source_id: number;
  source_name?: string;
  target_id: number;
  status: 'running' | 'queued' | 'completed' | 'failed' | 'stopped' | string;
  is_public?: boolean;
  worker_type?: 'worker_bots' | 'userbot' | string;
  worker_label?: string;
  processed: number;
  total: number;
  skipped: number;
  failed: number;
  remaining?: number;
  progress_pct?: number;
  current_msg_id: number;
  started_at: string;
  last_activity: string;
  error?: string | null;
}

