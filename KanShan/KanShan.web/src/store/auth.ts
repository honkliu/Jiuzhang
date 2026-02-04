import { create } from "zustand";
import type { UserDto } from "../types";
import { api } from "../lib/api";

const LS_TOKEN = "kanshan.token";
const LS_USER = "kanshan.user";

type AuthState = {
  token: string | null;
  user: UserDto | null;
  isHydrated: boolean;
  hydrate: () => void;
  register: (params: {
    userName: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  login: (params: { userName: string; password: string }) => Promise<void>;
  devLogin: (params: { userName: string }) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isHydrated: false,

  hydrate: () => {
    const token = localStorage.getItem(LS_TOKEN);
    const userRaw = localStorage.getItem(LS_USER);
    const user = userRaw ? (JSON.parse(userRaw) as UserDto) : null;
    set({ token: token || null, user, isHydrated: true });
  },

  register: async (params) => {
    const res = await api.register(params);
    localStorage.setItem(LS_TOKEN, res.accessToken);
    localStorage.setItem(LS_USER, JSON.stringify(res.user));
    set({ token: res.accessToken, user: res.user });
  },

  login: async (params) => {
    const res = await api.login(params);
    localStorage.setItem(LS_TOKEN, res.accessToken);
    localStorage.setItem(LS_USER, JSON.stringify(res.user));
    set({ token: res.accessToken, user: res.user });
  },

  devLogin: async (params) => {
    const res = await api.devLogin(params);
    localStorage.setItem(LS_TOKEN, res.accessToken);
    localStorage.setItem(LS_USER, JSON.stringify(res.user));
    set({ token: res.accessToken, user: res.user });
  },

  refreshMe: async () => {
    const token = get().token;
    if (!token) return;
    const me = await api.me(token);
    localStorage.setItem(LS_USER, JSON.stringify(me));
    set({ user: me });
  },

  logout: () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    set({ token: null, user: null });
  },
}));
