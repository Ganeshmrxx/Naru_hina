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

  // Errors
  async getErrors(limit: number = 50) {
    return this.request<Record<string, unknown>[]>(`/api/errors?limit=${limit}`);
  }
}

export const api = new ApiClient();
