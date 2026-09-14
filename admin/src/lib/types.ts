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
  target_id: number | null;
  target_name: string | null;
}
