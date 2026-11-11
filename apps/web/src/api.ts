import type { Config, Health, Message, Profile } from "./types";

export async function login(token: string): Promise<void> {
  await request<{ ok: boolean }>("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
export async function logout(): Promise<void> {
  await request<{ ok: boolean }>("/api/session", { method: "DELETE" });
}
function headers(json = false): HeadersInit {
  return json ? { "content-type": "application/json" } : {};
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}

export const api = {
  config: () => request<Config>("/api/config"),
  profile: (id: string) => request<Profile & { wsUrl: string; accessToken: string }>(`/api/profiles/${encodeURIComponent(id)}`, { headers: headers() }),
  login,
  logout,
  health: () => request<Health>("/api/health"),
  messages: (profile: string, conversation: "private" | "group", targetId: string) =>
    request<Message[]>(`/api/messages?profile=${encodeURIComponent(profile)}&conversation=${conversation}&targetId=${encodeURIComponent(targetId)}`, { headers: headers() }),
  testProfile: (profile: Partial<Profile> & { accessToken?: string; wsUrl: string }) =>
    request<{ ok: boolean; detail: string }>("/api/profiles/test", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ profile }),
    }),
  addProfile: (profile: Partial<Profile> & { accessToken?: string; wsUrl: string }) =>
    request<{ ok: boolean; profile: Profile }>("/api/profiles", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ profile }),
    }),
};
