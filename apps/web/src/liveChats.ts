// Which chats are being answered right now (shown as a spinner in the sidebar).
import { useSyncExternalStore } from 'react';

let running: string[] = [];
const subs = new Set<() => void>();
export function setRunningChats(ids: string[]) {
  if (ids.join() === running.join()) return;
  running = ids;
  subs.forEach((f) => f());
}
export const useRunningChats = () => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => running);
