import type {
  AuthResponse,
  ConversationDto,
  ConversationSummaryDto,
  MessageDto,
  UserDto,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!res.ok) {
    const message =
      (data as any)?.error ||
      (data as any)?.message ||
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  async register(params: {
    userName: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return readJsonOrThrow<AuthResponse>(res);
  },

  async login(params: { userName: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return readJsonOrThrow<AuthResponse>(res);
  },

  async devLogin(params: { userName: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return readJsonOrThrow<AuthResponse>(res);
  },

  async me(token: string): Promise<UserDto> {
    const res = await fetch(`${API_BASE_URL}/api/users/me`, {
      headers: { ...authHeaders(token) },
    });
    return readJsonOrThrow<UserDto>(res);
  },

  async searchUsers(token: string, q: string): Promise<UserDto[]> {
    const res = await fetch(
      `${API_BASE_URL}/api/users/search?q=${encodeURIComponent(q)}`,
      { headers: { ...authHeaders(token) } },
    );
    return readJsonOrThrow<UserDto[]>(res);
  },

  async listUsers(token: string, params?: { limit?: number }): Promise<UserDto[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));

    const res = await fetch(`${API_BASE_URL}/api/users?${qs.toString()}`, {
      headers: { ...authHeaders(token) },
    });
    return readJsonOrThrow<UserDto[]>(res);
  },

  async listConversations(token: string): Promise<ConversationSummaryDto[]> {
    const res = await fetch(`${API_BASE_URL}/api/chats`, {
      headers: { ...authHeaders(token) },
    });
    return readJsonOrThrow<ConversationSummaryDto[]>(res);
  },

  async getConversation(token: string, conversationId: string): Promise<ConversationDto> {
    const res = await fetch(`${API_BASE_URL}/api/chats/${conversationId}`, {
      headers: { ...authHeaders(token) },
    });
    return readJsonOrThrow<ConversationDto>(res);
  },

  async getMessages(
    token: string,
    conversationId: string,
    params?: { before?: string; limit?: number },
  ): Promise<MessageDto[]> {
    const qs = new URLSearchParams();
    if (params?.before) qs.set("before", params.before);
    if (params?.limit) qs.set("limit", String(params.limit));

    const res = await fetch(
      `${API_BASE_URL}/api/chats/${conversationId}/messages?${qs.toString()}`,
      { headers: { ...authHeaders(token) } },
    );
    return readJsonOrThrow<MessageDto[]>(res);
  },

  async createDirect(token: string, otherUserId: string): Promise<ConversationDto> {
    const res = await fetch(`${API_BASE_URL}/api/chats/direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ otherUserId }),
    });
    return readJsonOrThrow<ConversationDto>(res);
  },

  async createGroup(
    token: string,
    title: string,
    memberUserIds: string[],
  ): Promise<ConversationDto> {
    const res = await fetch(`${API_BASE_URL}/api/chats/group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ title, memberUserIds }),
    });
    return readJsonOrThrow<ConversationDto>(res);
  },

  async deleteConversation(token: string, conversationId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/chats/${conversationId}`, {
      method: "DELETE",
      headers: { ...authHeaders(token) },
    });
    await readJsonOrThrow<any>(res);
  },

  async uploadImage(token: string, file: File): Promise<{ url: string; path: string }> {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE_URL}/api/uploads/image`, {
      method: "POST",
      headers: { ...authHeaders(token) },
      body: form,
    });

    return readJsonOrThrow<{ url: string; path: string }>(res);
  },
};
