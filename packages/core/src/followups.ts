// Messages the user sends while an answer is still running. A steerable provider (Claude) takes them in
// mid-answer; for the others the app queues them and sends them as the next message.
import type { Inbox } from './providers/types.ts';

const listeners = new Map<string, Set<(text: string) => void>>();

/** The inbox a run in this chat listens to. */
export function inboxFor(conversationId: string): Inbox {
  return {
    listen(cb) {
      let set = listeners.get(conversationId);
      if (!set) listeners.set(conversationId, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
        if (!set!.size) listeners.delete(conversationId);
      };
    },
  };
}

/** true = the running answer took it in; false = nothing is listening (the app queues it instead). */
export function sendFollowUp(conversationId: string, text: string): boolean {
  const set = listeners.get(conversationId);
  if (!set?.size) return false;
  for (const cb of set) cb(text);
  return true;
}

export const acceptsFollowUps = (conversationId: string) => !!listeners.get(conversationId)?.size;
