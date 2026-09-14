import { api } from './api';

export function isAuthenticated(): boolean {
  return !!api.getToken();
}

export async function login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.login(username, password);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Invalid credentials' };
  }
}

export function logout() {
  api.clearToken();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
