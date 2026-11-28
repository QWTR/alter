export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const prefix = 'altter.chat.draft:';
export function readDraft(storage: DraftStorage | undefined, key: string): string {
  try { return storage?.getItem(prefix + key) ?? ''; } catch { return ''; }
}
export function writeDraft(storage: DraftStorage | undefined, key: string, text: string): void {
  try {
    if (text) storage?.setItem(prefix + key, text);
    else storage?.removeItem(prefix + key);
  } catch { /* Private mode or a full quota must not prevent typing. */ }
}
