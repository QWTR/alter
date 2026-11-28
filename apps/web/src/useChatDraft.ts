import { useCallback, useRef, useState, type SetStateAction } from 'react';
import { readDraft, writeDraft, type DraftStorage } from './draftStore';

function storage(): DraftStorage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

/** A draft belongs to its conversation (or new-chat project), not the mounted view.
 * Write on each edit so navigation and reload cannot race a deferred effect. */
export function useChatDraft(key: string): [string, (value: SetStateAction<string>) => void] {
  const [state, setState] = useState(() => ({ key, text: readDraft(storage(), key) }));
  const text = state.key === key ? state.text : readDraft(storage(), key);
  const current = useRef({ key, text });
  current.current = { key, text };
  const setText = useCallback((value: SetStateAction<string>) => {
    // Read the current draft outside React's updater: updater functions must be pure.
    const previous = current.current.key === key ? current.current.text : readDraft(storage(), key);
    const next = typeof value === 'function' ? value(previous) : value;
    writeDraft(storage(), key, next);
    current.current = { key, text: next };
    setState({ key, text: next });
  }, [key]);
  return [text, setText];
}
