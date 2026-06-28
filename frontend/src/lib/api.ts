const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface Subscription {
  id: number;
  user: number;
  product: "DIGITAL" | "PRINT" | "PREMIUM";
  start_date: string;
  end_date: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ActiveSubscription {
  id: number;
  product: "DIGITAL" | "PRINT" | "PREMIUM";
  end_date: string | null;
  revoked_at: string | null;
}

export interface Entitlements {
  user_id: number;
  entitlements: {
    can_read_web: boolean;
    can_receive_print: boolean;
    ad_free: boolean;
  };
  active_subscriptions: ActiveSubscription[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const message =
      typeof body === "object" && body !== null
        ? Object.entries(body)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ")
        : res.statusText;
    throw new Error(message);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export const api = {
  users: {
    list: () => request<User[]>("/users/"),
    get: (id: number) => request<User>(`/users/${id}/`),
    create: (data: { username: string; email: string; password: string }) =>
      request<User>("/users/", { method: "POST", body: JSON.stringify(data) }),
    entitlements: (id: number) => request<Entitlements>(`/users/${id}/entitlements/`),
  },
  subscriptions: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request<Subscription[]>(`/subscriptions/${qs}`);
    },
    create: (data: { user: number; product: string; start_date: string; end_date?: string }) =>
      request<Subscription>("/subscriptions/", { method: "POST", body: JSON.stringify(data) }),
    revoke: (id: number) =>
      request<Subscription>(`/subscriptions/${id}/revoke/`, { method: "PATCH" }),
    delete: (id: number) =>
      request<null>(`/subscriptions/${id}/`, { method: "DELETE" }),
  },
};
