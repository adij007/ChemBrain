import { create } from "zustand";
import type { AppRole } from "@/lib/rbac";
import { apiFetch } from "@/api/http";

type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

interface AuthState {
  user: AuthUser | null;
  roles: AppRole[];
  loading: boolean;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

type SessionPayload = {
  user: AuthUser;
  roles: AppRole[];
};

async function fetchSession(): Promise<SessionPayload> {
  return apiFetch<SessionPayload>("/api/auth/session");
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  roles: [],
  loading: true,

  initialize: () => {
    fetchSession()
      .then((data) => {
        set({ user: data.user, roles: data.roles, loading: false });
      })
      .catch(() => {
        set({ user: null, roles: [], loading: false });
      });
    return () => {};
  },

  signIn: async (email, password) => {
    const data = await apiFetch<SessionPayload>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    set({ user: data.user, roles: data.roles });
  },

  signUp: async (email, password, displayName) => {
    const data = await apiFetch<SessionPayload>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    });
    set({ user: data.user, roles: data.roles });
  },

  signOut: async () => {
    await apiFetch<{ ok: boolean }>("/api/auth/signout", { method: "POST" });
    set({ user: null, roles: [] });
  },

  resetPassword: async (email) => {
    await apiFetch<{ ok: boolean }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  updatePassword: async (password) => {
    await apiFetch<{ ok: boolean }>("/api/auth/update-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
}));
