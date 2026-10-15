import { create } from "zustand";

export type ChatAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  isBot?: boolean;
};

export type ChatAttachment = {
  url: string;
  name: string;
  mime: string;
};

export type ChatReaction = {
  emoji: string;
  count: number;
  me: boolean;
  users: string[];
};

export type ChatMessage = {
  id: string;
  content: string;
  channelId?: string;
  conversationId?: string;
  edited: boolean;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
  tempId?: string;
  author: ChatAuthor;
  replyTo?: {
    id: string;
    content: string;
    author: { id: string; username: string; displayName: string };
    attachments?: ChatAttachment[];
  } | null;
  reactions: ChatReaction[];
  attachments: ChatAttachment[];
};

type ChatState = {
  // key: channelId or dmId
  messages: Record<string, ChatMessage[]>;
  typing: Record<string, { userId: string; displayName: string }[]>;
  setMessages: (key: string, msgs: ChatMessage[]) => void;
  addMessage: (key: string, msg: ChatMessage) => void;
  updateMessage: (key: string, id: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (key: string, id: string) => void;
  replaceTemp: (key: string, tempId: string, real: ChatMessage) => void;
  setTyping: (key: string, list: { userId: string; displayName: string }[]) => void;
  clearKey: (key: string) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messages: {},
  typing: {},
  setMessages: (key, msgs) => set((s) => ({ messages: { ...s.messages, [key]: msgs } })),
  addMessage: (key, msg) =>
    set((s) => {
      const existing = s.messages[key] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      // Server echo carries the optimistic tempId but a real id: drop the
      // temp echo and store the real message WITHOUT tempId so the
      // "sending…" pill clears.
      if (msg.tempId) {
        const filtered = existing.filter((m) => m.tempId !== msg.tempId && m.id !== msg.tempId);
        return { messages: { ...s.messages, [key]: [...filtered, { ...msg, tempId: undefined }] } };
      }
      return { messages: { ...s.messages, [key]: [...existing, msg] } };
    }),
  updateMessage: (key, id, patch) =>
    set((s) => ({
      messages: { ...s.messages, [key]: (s.messages[key] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) },
    })),
  removeMessage: (key, id) =>
    set((s) => ({
      messages: { ...s.messages, [key]: (s.messages[key] ?? []).filter((m) => m.id !== id) },
    })),
  replaceTemp: (key, tempId, real) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [key]: (s.messages[key] ?? []).map((m) => (m.tempId === tempId ? { ...real, tempId } : m)),
      },
    })),
  setTyping: (key, list) => set((s) => ({ typing: { ...s.typing, [key]: list } })),
  clearKey: (key) =>
    set((s) => {
      const messages = { ...s.messages };
      const typing = { ...s.typing };
      delete messages[key];
      delete typing[key];
      return { messages, typing };
    }),
}));
