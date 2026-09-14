import { api } from './api';

export function isAuthenticated(): boolean {
  return !!api.getToken();
}

export async function login(username: string, password: string): Promise<boolean> {
  try {
    await api.login(username, password);
    return true;
  } catch {
    return false;
  }
}

export function logout() {
  api.clearToken();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
