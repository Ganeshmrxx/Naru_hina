import { TelegramFolder, TelegramMediaItem, TelegramChannelStats, UniversalStatusResponse, UniversalQueueItem, GroupedAlbumItem } from './types';

function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    // If running standalone Next.js dev server on port 3000, point to local backend port 8000
    if (window.location.port === '3000') {
      return 'http://localhost:8000';
    }
    // On any production domain (e.g. apps.bot-hosting.cloud) use same-origin relative path
    return '';
  }
  return '';
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `API Error: ${res.status}`);
    }

    return res.json();
  }

  // Auth
  async login(username: string, password: string) {
    const data = await this.request<{ access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(data.access_token);
    return data;
  }

  // Health
  async getHealth() {
    return this.request<{ status: string; uptime: number; bots_running: number }>('/api/health');
  }

  // Stats
  async getStats() {
    return this.request<Record<string, unknown>>('/api/stats');
  }

  async getStatsHistory(days: number = 7) {
    return this.request<Record<string, unknown>[]>(`/api/stats/history?days=${days}`);
  }

  // Bots
  async getBots() {
    return this.request<Record<string, unknown>>('/api/bots');
  }

  async getBotStatus(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/status`);
  }

  async startBot(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/start`, { method: 'POST' });
  }

  async stopBot(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/stop`, { method: 'POST' });
  }

  async restartBot(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/restart`, { method: 'POST' });
  }

  async getBotLogs(botId: string, limit: number = 100) {
    return this.request<Record<string, unknown>[]>(`/api/bots/${botId}/logs?limit=${limit}`);
  }

  async enableSpam(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/spam/enable`, { method: 'POST' });
  }

  async disableSpam(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/spam/disable`, { method: 'POST' });
  }

  // Forwarding
  async getForwardingChats(status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.request<Record<string, unknown>[]>(`/api/forwarding/chats${query}`);
  }

  async updateChatStatus(chatId: number, status: string) {
    return this.request<Record<string, unknown>>(`/api/forwarding/chats/${chatId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  async deleteChat(chatId: number) {
    return this.request<Record<string, unknown>>(`/api/forwarding/chats/${chatId}`, { method: 'DELETE' });
  }

  async getForwardingProgress() {
    return this.request<Record<string, unknown>[]>('/api/forwarding/progress');
  }

  // Universal Forwarder (Folder 5 & 6)
  async getUniversalForwarderStatus() {
    return this.request<UniversalStatusResponse>('/api/forwarding/universal/status');
  }

  async getUniversalForwarderQueue(folder_id?: number, status?: string) {
    const params = new URLSearchParams();
    if (folder_id) params.set('folder_id', folder_id.toString());
    if (status && status !== 'all') params.set('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<UniversalQueueItem[]>(`/api/forwarding/universal/queue${query}`);
  }

  async getUniversalForwarderGrouped(limit: number = 50, channel_id?: number) {
    const params = new URLSearchParams();
    params.set('limit', limit.toString());
    if (channel_id) params.set('channel_id', channel_id.toString());
    return this.request<{ total: number; albums: GroupedAlbumItem[] }>(`/api/forwarding/universal/grouped?${params.toString()}`);
  }

  // Mappings
  async getMappings() {
    return this.request<Record<string, unknown>[]>('/api/mappings');
  }

  async createMapping(data: { source_id: number; source_name: string; target_id: number; target_name: string }) {
    return this.request<Record<string, unknown>>('/api/mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteMapping(sourceId: number) {
    return this.request<Record<string, unknown>>(`/api/mappings/${sourceId}`, { method: 'DELETE' });
  }

  // Channels
  async getChannels() {
    return this.request<Record<string, unknown>[]>('/api/channels');
  }

  // Database
  async getDatabaseStatus() {
    return this.request<Record<string, unknown>>('/api/database/status');
  }

  // TeraBox
  async getTeraboxConfig() {
    return this.request<Record<string, unknown>>('/api/terabox/config');
  }

  // Logs
  async getLogs(params?: { bot_id?: string; level?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.bot_id) searchParams.set('bot_id', params.bot_id);
    if (params?.level) searchParams.set('level', params.level);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request<Record<string, unknown>[]>(`/api/logs${query}`);
  }

  // Forwarding Jobs & Bulk Forward
  async startBulkForward(data: { source_id: number; target_id: number; from_msg_id?: number; to_msg_id?: number }) {
    return this.request<Record<string, unknown>>('/api/forwarding/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getForwardJobs() {
    return this.request<Record<string, unknown>[]>('/api/forwarding/jobs');
  }

  async getForwardJob(jobId: string) {
    return this.request<Record<string, unknown>>(`/api/forwarding/jobs/${jobId}`);
  }

  async stopForwardJob(jobId: string) {
    return this.request<Record<string, unknown>>(`/api/forwarding/jobs/${jobId}/stop`, { method: 'POST' });
  }

  async copyMapping(sourceId: number) {
    return this.request<Record<string, unknown>>(`/api/mappings/${sourceId}/copy`, { method: 'POST' });
  }

  async addForwardingChat(data: { chat_id: number; title: string; type?: string; status?: string }) {
    return this.request<Record<string, unknown>>('/api/forwarding/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin Promote Controls
  async enablePromote(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/promote/enable`, { method: 'POST' });
  }

  async disablePromote(botId: string) {
    return this.request<Record<string, unknown>>(`/api/bots/${botId}/promote/disable`, { method: 'POST' });
  }

  // Collection Data Inspection
  async getCollectionData(name: string, limit: number = 20) {
    return this.request<Record<string, unknown>[]>(`/api/database/collections/${name}?limit=${limit}`);
  }

  // TeraBox Search Test
  async searchTerabox(query: string, limit: number = 5) {
    return this.request<{ success: boolean; results?: unknown; error?: string }>('/api/terabox/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    });
  }

  // Telegram Live Dialogs & Interactive Channel Router
  async getTelegramDialogs(refresh: boolean = false, botId: string = 'backup_forwarder') {
    return this.request<import('./types').TelegramDialog[]>(`/api/telegram/dialogs?bot_id=${botId}&refresh=${refresh}`);
  }

  async setTelegramTarget(data: {
    source_id: number;
    source_name: string;
    target_id: number;
    target_name: string;
    forward_history: boolean;
  }) {
    return this.request<{ success: boolean; mapping: unknown; job?: unknown }>('/api/telegram/set-target', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeTelegramTarget(sourceId: number) {
    return this.request<{ success: boolean; source_id: number }>(`/api/telegram/target/${sourceId}`, {
      method: 'DELETE',
    });
  }

  async syncTelegramHistory(sourceId: number) {
    return this.request<Record<string, unknown>>(`/api/telegram/sync/${sourceId}`, {
      method: 'POST',
    });
  }

  async cleanDeadChannels() {
    return this.request<{ success: boolean; deleted_count: number; remaining_live: number }>('/api/telegram/clean-dead-channels', {
      method: 'POST',
    });
  }

  async addChannelToFolder(chatId: number, folderId: number) {
    return this.request<{ success: boolean; chat_id: number; folder_id: number; error?: string }>('/api/telegram/folders/assign', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, folder_id: folderId }),
    });
  }

  async removeChannelFromFolder(chatId: number, folderId: number) {
    return this.request<{ success: boolean; chat_id: number; folder_id: number; error?: string }>('/api/telegram/folders/remove', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, folder_id: folderId }),
    });
  }

  async clearAllMappings() {
    return this.request<{ success: boolean; deleted_count: number }>('/api/telegram/clear-all-mappings', {
      method: 'POST',
    });
  }

  async setupTelegramFolders() {
    return this.request<{ success: boolean; folders: Array<{ id: number; title: string; count: number; success?: boolean; error?: string }> }>('/api/telegram/setup-folders', {
      method: 'POST',
    });
  }

  // Telegram Live Media & Folders
  async getTelegramFolders() {
    return this.request<TelegramFolder[]>('/api/telegram/folders');
  }

  async getChannelMedia(chatId: number, limit: number = 40) {
    return this.request<TelegramMediaItem[]>(`/api/telegram/channel/${chatId}/media?limit=${limit}`);
  }

  async getChannelStats(chatId: number) {
    return this.request<TelegramChannelStats>(`/api/telegram/channel/${chatId}/stats`);
  }

  async forwardMedia(data: { from_chat_id: number; to_chat_id: number; message_ids: number[] }) {
    return this.request<{ success: boolean; forwarded_count: number }>('/api/telegram/media/forward', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Errors
  async getErrors(limit: number = 50) {
    return this.request<Record<string, unknown>[]>(`/api/errors?limit=${limit}`);
  }

  // Telegram Session Generator
  async sendTelegramSessionCode(data: { phone_number: string; api_id?: number; api_hash?: string }) {
    return this.request<{
      success: boolean;
      auth_id: string;
      phone_number: string;
      phone_code_hash: string;
      timeout: number;
      code_type: string;
      message: string;
    }>('/api/telegram/session/send-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyTelegramSessionCode(data: { auth_id: string; phone_code: string; password?: string }) {
    return this.request<{
      success: boolean;
      need_password?: boolean;
      session_string?: string;
      user?: { id: number; first_name: string; username?: string; phone_number?: string };
      message: string;
    }>('/api/telegram/session/verify-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async applyTelegramSession(data: { target_bot: string; session_string: string }) {
    return this.request<{
      success: boolean;
      target_bot: string;
      session_key: string;
      restart_result: Record<string, unknown>;
      message: string;
    }>('/api/telegram/session/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
