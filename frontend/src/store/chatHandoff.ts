import { create } from "zustand";

/**
 * One-shot handoff for "send to chat" actions elsewhere in the app
 * (Crons/Scripts pages today): a page composes a draft message, stashes it
 * here, and navigates to /chat, which consumes it on mount to pre-fill the
 * composer. Not persisted -- this is purely an in-memory relay between two
 * route renders in the same session.
 */
interface ChatHandoffState {
  draft: string | null;
  setDraft: (draft: string) => void;
  consumeDraft: () => string | null;
}

export const useChatHandoffStore = create<ChatHandoffState>((set, get) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  consumeDraft: () => {
    const draft = get().draft;
    set({ draft: null });
    return draft;
  },
}));
