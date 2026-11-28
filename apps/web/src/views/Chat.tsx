import { AnimatePresence, motion } from 'motion/react';
import { ConnectCard } from '../components/ConnectKey';
import { SendContext } from '../components/RichBlocks';
import { ArrowDown, ArrowUp, AudioLines, Mic, Crosshair, ListChecks, Undo2, WandSparkles, Eye, FileText, Film, FolderKanban, Menu, MessageCircle, MonitorPlay, Music, Paperclip, Plus, Search, Settings2, Square, Terminal, Trash2, Upload, Wrench, X, Clock, CornerDownRight, Copy, Check, RotateCcw, Pencil, ShieldCheck, Zap } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ProviderPicker, getPref } from '../components/ProviderPicker';
import { AccessPicker, PlusMenu, ProjectPicker } from '../components/ComposerMenus';
import { MentionMenu, useMentions } from '../components/Mentions';
import { PluginTagMenu, usePluginTags } from '../components/PluginTags';
import { ensureLocalVoice, useVoice, VoiceBars, VoiceStrip } from '../components/Voice';
import { getLang } from '../i18n';
import { Robot } from '../components/Robot';
import { AgentDrawer, agentName } from '../components/agentKit';
import { LimitDialog, type LimitHit } from '../components/LimitDialog';
import { api, clientId, guest, invalidate, setCached, streamChat, uploadFile, useData, type Attachment, type Author, type ChatError, type Access, type Agent, type Conversation, type Draft, type Message, type Preview, type Project, type ProviderStatus, type RenderProgress, type Status } from '../api';
import { Markdown } from '../components/Markdown';
import { AnswerWithProposals } from '../components/Proposal';
import { CrewBoard } from '../components/CrewBoard';
import { MediaResults, ProgressBar } from '../components/Media';
import { ChatsPanel } from '../components/SidePanels';
import { PromptPicker } from '../components/PromptPicker';
import { LivePreview, type Pick, type RemoteInPage } from '../components/LivePreview';
import { CursorLayer, MemberDot, Members, ShareButton, TypingGhosts, usePointerShare, useRoom, type RunHandler } from '../components/Presence';
import { Logo, PALETTES, Segmented, ease, softSpring, spring, toast } from '../components/ui';
import { useT, type Key } from '../i18n';
import { navigate, useRoute } from '../router';
import { setRunningChats } from '../liveChats';
import { commandSummary } from '../commandSummary';

let pending: string | null = null;
let pendingExtra: SendExtra | undefined;
/** Sent with a message started from elsewhere (Studio briefs): access + files. */
export interface SendExtra { access?: Access; attachments?: Attachment[]; plan?: boolean }
/** Lets other screens (Home's prompt) open a new chat with a message already sent. */
export const setPendingMessage = (m: string, extra?: SendExtra) => {
  pending = m;
  pendingExtra = extra;
};

interface Live {
  user: string;
  text: string;
  steps: string[];
  provider?: string;
  startedAt: number;
  done: boolean;
  attachments?: Attachment[];
  /** Asked by someone else in an online session (their answer streams in here). */
  remote?: boolean;
  author?: Author | null;
  /** A render / Studio install running right now. */
  progress?: RenderProgress | null;
  /** Messages sent while this answer was running (the AI took them in), at the text length when sent. */
  followUps?: { text: string; at: number; author?: Author | null }[];
}

/** A file being attached in the composer (uploads right away, in the background). */
interface Pending {
  key: string;
  name: string;
  type: string;
  size: number;
  thumb?: string;
  progress: number;
  att?: Attachment;
  error?: string;
  abort: AbortController;
}

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fileIcon = (type: string) => (type.startsWith('video/') ? Film : type.startsWith('audio/') ? Music : FileText);

/** Tool activity → a short human sentence ("Creating index.html"). */
function useStepLabel() {
  const t = useT();
  return (s: string | undefined): string => {
    if (!s || s === 'Thinking') return t('chat.step.thinking');
    const m = s.match(/^([\w]+)(?::\s*(.*))?$/);
    const tool = m?.[1] ?? '';
    const arg = (m?.[2] ?? '').trim();
    const file = arg.split(/[\\/]/).pop() ?? arg;
    switch (tool) {
      case 'Write': return t('chat.step.writing', { file });
      case 'Edit': case 'MultiEdit': case 'NotebookEdit': return t('chat.step.editing', { file });
      case 'Read': return t('chat.step.reading', { file });
      case 'Bash': case 'PowerShell': case 'Shell': {
        // Studio commands read better as what they do
        const v = arg.match(/render\.mjs"?\s+(\S+)/);
        if (v) return t('chat.step.rendering', { file: v[1].split(/[\\/]/).pop()!.replace(/["']/g, '') });
        if (/ff\.mjs"?\s+probe/.test(arg)) return t('chat.step.probing');
        if (/ff\.mjs/.test(arg)) return t('chat.step.editingVideo');
        return t('chat.step.running', { cmd: commandSummary(arg) });
      }
      case 'Glob': case 'Grep': return t('chat.step.searching');
      case 'WebSearch': return t('chat.step.web', { q: arg.slice(0, 60) });
      case 'WebFetch': return t('chat.step.fetching', { url: arg.replace(/^https?:\/\//, '').slice(0, 50) });
      case 'TodoWrite': return t('chat.step.planning');
      case 'mcp__alter_hands__blender': return t('chat.step.blender', { what: arg || '…' });
      case 'mcp__alter_hands__find_asset': return t('chat.step.findAsset', { text: arg.slice(0, 60) });
      case 'mcp__alter_hands__add_asset': return t('chat.step.addAsset', { text: arg.slice(0, 60) });
      case 'mcp__alter_hands__generate_model': return t('chat.step.generate', { text: arg.slice(0, 70) });
      case 'mcp__alter_hands__blender_look': return t('chat.step.look', { what: arg });
      case 'mcp__alter_hands__screenshot': return t('chat.step.screen');
      case 'mcp__alter_hands__team_note': return t('chat.step.note', { text: arg });
      case 'mcp__alter_hands__team_plan': return t('chat.step.plan', { text: arg });
      case 'mcp__alter_hands__team_board': return t('chat.step.board');
      case 'mcp__alter_hands__wait_team': return t('chat.step.waitTeam');
      case 'mcp__alter_hands__say': return '💬 ' + arg;
      case 'mcp__alter_hands__show_page': return t('chat.step.page', { file });
      case 'mcp__alter_hands__open': return t('chat.step.open', { what: file });
      case 'mcp__alter_hands__click': case 'mcp__alter_hands__move': case 'mcp__alter_hands__drag': case 'mcp__alter_hands__scroll': return t('chat.step.mouse');
      case 'mcp__alter_hands__type': return t('chat.step.typing', { text: arg.slice(0, 60) });
      case 'mcp__alter_hands__key': return t('chat.step.key', { text: arg });
      case 'mcp__alter_hands__wait': return t('chat.step.wait');
      default: return s.slice(0, 80);
    }
  };
}

const PAGE_RE = /(?:[A-Za-z]:[\\/])?[^\s`'"<>|*?()[\]]+\.html?\b/g;

const PICKS_MARK = '<!--alter:picks-->';

/** Computer-size layout (the preview sits next to the chat, the composer stays visible). */
const wide = () => typeof matchMedia === 'undefined' || matchMedia('(min-width: 821px)').matches;

/** Elements picked in the preview travel with the message (the AI gets selector + HTML; the bubble shows chips). */
function withPicks(text: string, picks: Pick[]): string {
  if (!text || !picks.length) return text;
  const path = picks[0].file;
  const list = picks
    .map((p, i) => `${i + 1}. \`${p.selector}\` (${p.label})${p.text ? ` — "${p.text.slice(0, 100).replace(/"/g, "'")}"` : ''}\n\`\`\`html\n${p.html}\n\`\`\``)
    .join('\n');
  return `${text}\n\n${PICKS_MARK}\nElements I selected in the preview of ${path} — apply my request to exactly these:\n${list}`;
}

function splitPicks(content: string): { text: string; picks: { selector: string; label: string; text: string }[] } {
  const at = content.indexOf(PICKS_MARK);
  if (at < 0) return { text: content, picks: [] };
  const picks = [...content.slice(at).matchAll(/^\d+\. `([^`]+)` \(([^)]*)\)(?: — "(.*)")?$/gm)].map((m) => ({ selector: m[1], label: m[2], text: m[3] ?? '' }));
  return { text: content.slice(0, at).trim(), picks };
}

export function ChatView() {
  const t = useT();
  const route = useRoute();
  const stepLabel = useStepLabel();
  // the same chat lives under /chat/<id> and, for agents, under /agents/<agentId>/<id>
  const inAgents = route.section === 'agents';
  // inside a workspace (#/workspace/<project>/<chat>): the chat belongs to that project
  const inWs = route.section === 'workspace' && !guest;
  const wsBase = inWs ? `/workspace/${route.parts[1]}` : '';
  // a guest from a share link sees exactly one chat, nothing else of the host's ALTTER
  const routeId = guest ? guest.conversationId : inWs ? (route.parts[2] && route.parts[2] !== 'new' ? route.parts[2] : null) : inAgents ? route.parts[2] ?? null : route.parts[1] && route.parts[1] !== 'new' ? route.parts[1] : null;
  // phones: the "Chats" tab (/chat) opens on the list of chats; /chat/new and /chat/<id> on the chat itself
  const [listOpen, setListOpen] = useState(() => !wide() && route.section === 'chat' && !route.parts[1]);
  useEffect(() => {
    if (route.section === 'chat' && !route.parts[1] && !wide()) setListOpen(true);
    else setListOpen(false);
  }, [route.section, route.parts[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectFromQuery = guest ? null : inWs ? route.parts[1] : route.query.get('project');
  const host = !guest;
  const { data: convs } = useData<Conversation[]>(host ? '/api/conversations' : null);
  const { data: projects } = useData<Project[]>(host ? '/api/projects' : null);
  const { data: providers } = useData<ProviderStatus[]>(host ? '/api/providers' : null, 10_000);
  const { data: status } = useData<Status>(host ? '/api/status' : null, 15_000);
  const { data: conv } = useData<Conversation & { messages: Message[] }>(routeId ? `/api/conversations/${routeId}` : null, 2000);
  // guests and workspace members get no live events: refresh the chat now and then, so team boards, answers
  // from the others and a team created on the host's screen show up without reopening the chat
  useEffect(() => {
    if (!guest || !routeId) return;
    const id = setInterval(() => { if (!document.hidden) invalidate(`/api/conversations/${routeId}`); }, 3000);
    return () => clearInterval(id);
  }, [routeId]);
  const [filter, setFilter] = useState('');

  const projectId = conv?.project_id ?? projectFromQuery ?? null;
  const project = projects?.find((p) => p.id === projectId);
  const { data: agents } = useData<Agent[]>(host ? '/api/agents' : null);
  const agentId = (inAgents ? route.parts[1] : routeId ? conv?.agent_id : route.query.get('agent')) ?? null;
  const agent = agents?.find((a) => a.id === agentId);
  const [drawer, setDrawer] = useState(false);
  const base = inWs ? wsBase : inAgents && agentId ? `/agents/${agentId}` : '/chat';
  const newHref = inWs ? `${wsBase}/new` : inAgents && agentId ? base : projectFromQuery ? `/chat/new?project=${projectFromQuery}` : '/chat/new';

  const [narrow, setNarrow] = useState(() => !wide());
  useEffect(() => {
    const mq = matchMedia('(max-width: 820px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [accessState, setAccessState] = useState<Access>('chat');
  // a new chat starts with the access you used last (so "Full control" sticks once you picked it)
  const setAccess = useCallback((a: Access) => {
    setAccessState(a);
    try { localStorage.setItem('altter.access', a); } catch {}
    if (!guest) void api('/api/settings', { method: 'PUT', body: { defaultAccess: a } }).then(() => invalidate('/api/status')).catch(() => {});
  }, [guest]);
  const [planMode, setPlanMode] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [beforeEnhance, setBeforeEnhance] = useState<string | null>(null);
  const enhance = async () => {
    if (enhancing || input.trim().length < 6) return;
    setEnhancing(true);
    try {
      const r = await api<{ text: string }>('/api/prompt/enhance', { method: 'POST', body: { text: input } });
      setBeforeEnhance(input);
      setInput(r.text);
      requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; ta.focus(); } });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setEnhancing(false);
    }
  };
  const access = accessState;
  const [provider, setProvider] = useState('default');
  const [limitHit, setLimitHit] = useState<LimitHit | null>(null);
  const [input, setInput] = useState('');
  /** Editing an earlier message: sending replaces it and everything after it. */
  const [editFrom, setEditFrom] = useState<number | null>(null);
  // one live answer per conversation ('new' until the server names it) — several can run at once
  const [lives, setLives] = useState<Record<string, Live>>({});
  const aborts = useRef<Record<string, AbortController>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [picking, setPicking] = useState(false);
  const previewUrl = useRef<string | null>(null);
  previewUrl.current = preview?.url ?? null;
  const [, tick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // the text box grows with what is in it (typed, pasted, dictated or restored) up to ~45% of the window, then scrolls
  const fitBox = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const max = Math.max(160, Math.round(window.innerHeight * 0.45));
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, max) + 'px';
    ta.style.overflowY = ta.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }, []);
  const [bigFile, setBigFile] = useState<string | null>(null);
  const threadRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const key = routeId ?? 'new';
  const live = lives[key];
  const [queued, setQueued] = useState<Record<string, string[]>>({});

  // ---------- attachments: paste (Ctrl+V), drop, or the paperclip ----------
  const addFiles = useCallback((list: File[] | FileList) => {
    for (const file of [...list].slice(0, 20)) {
      const p: Pending = {
        key: Math.random().toString(36).slice(2),
        name: file.name || `${t('chat.pasted')}.${(file.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')}`,
        type: file.type || 'application/octet-stream',
        size: file.size,
        thumb: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        progress: 0,
        abort: new AbortController(),
      };
      const named = file.name ? file : new File([file], p.name, { type: file.type });
      setFiles((all) => [...all, p]);
      const patch = (x: Partial<Pending>) => setFiles((all) => all.map((f) => (f.key === p.key ? { ...f, ...x } : f)));
      uploadFile(named, (progress) => patch({ progress }), p.abort.signal)
        .then((att) => patch({ att, progress: 1 }))
        .catch((e) => e.name !== 'AbortError' && (patch({ error: e.message }), toast(`${p.name}: ${e.message}`, 'error')));
    }
    if (wide()) taRef.current?.focus();
  }, [t]);
  const dropFile = (k: string) =>
    setFiles((all) => {
      const f = all.find((x) => x.key === k);
      f?.abort.abort();
      if (f?.thumb) URL.revokeObjectURL(f.thumb);
      return all.filter((x) => x.key !== k);
    });
  const uploading = files.some((f) => !f.att && !f.error);

  // Ctrl+V anywhere in the chat (not only in the text box) attaches pasted files / screenshots
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const list = [...(e.clipboardData?.files ?? [])];
      if (!list.length) return;
      const tgt = e.target as HTMLElement;
      const inField = tgt.closest?.('input, textarea, [contenteditable]');
      if (inField && inField !== taRef.current) return;
      // copying from an office app gives both a picture and the text: keep the text, attach nothing
      if (inField && e.clipboardData?.getData('text/plain')) return;
      e.preventDefault();
      addFiles(list);
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  }, [addFiles]);

  useEffect(() => {
    const remembered = status?.settings.defaultAccess;
    if (conv) {
      // "Full control" once = always: older chats are lifted to the remembered level (agents keep their own)
      setAccessState(!conv.agent_id && remembered && RANK[remembered] > RANK[conv.access] ? remembered : conv.access);
      setProvider(conv.provider ?? 'default');
    } else if (!routeId) {
      let last: Access | null = null;
      try { last = localStorage.getItem('altter.access') as Access | null; } catch {}
      setAccessState(agent?.access ?? remembered ?? (last && ['chat', 'read', 'full'].includes(last) ? last : 'chat'));
      setProvider('default');
    }
  }, [conv?.id, routeId, agent?.id, status?.settings.defaultAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // a fresh chat starts without the previous chat's preview
  useEffect(() => {
    if (!routeId) {
      setPreview(null);
      setDraft(null);
      setPicks([]);
      setPicking(false);
      setFiles([]);
    }
  }, [routeId]);

  useEffect(() => {
    if (wide()) taRef.current?.focus();
    if (pending && !routeId) {
      const m = pending;
      const x = pendingExtra;
      pending = null;
      pendingExtra = undefined;
      if (x?.access) setAccess(x.access);
      send(m, undefined, x);
    }
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // @agent / @group in the composer
  useLayoutEffect(fitBox, [input, fitBox]);
  useEffect(() => { window.addEventListener('resize', fitBox); return () => window.removeEventListener('resize', fitBox); }, [fitBox]);
  const mentions = useMentions(input, setInput, taRef, host);
  // #plugin: tell the AI which plugin to use for this message
  const ptags = usePluginTags(input, setInput, taRef, host);
  // ---------- voice: dictation + hands-free conversation ----------
  const voice = useVoice(getLang());
  const [talk, setTalk] = useState(false);
  const talkRef = useRef(false);
  talkRef.current = talk;
  const dictate = async () => {
    if (voice.state === 'listening') return voice.stop();
    if (!(await ensureLocalVoice(t))) return;
    try {
      const text = await voice.listen();
      if (text) setInput((v) => (v.trim() ? v.trimEnd() + ' ' : '') + text);
      requestAnimationFrame(() => taRef.current?.focus());
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const toggleTalk = async () => {
    if (talk) { setTalk(false); voice.cancel(); return; }
    if (!(await ensureLocalVoice(t))) return;
    setTalk(true);
  };
  // the loop: listen → send → (answer arrives) → read it out → listen again
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!talk || (!!live && !live.done) || voice.state !== 'idle') return;
    let gone = false;
    (async () => {
      const text = await voice.listen({ autoStop: true }).catch((e) => { toast((e as Error).message, 'error'); setTalk(false); return ''; });
      if (gone || !talkRef.current) return;
      if (text) send(text);
      else if (talkRef.current) setTalk((v) => v); // nothing heard: listen again
    })();
    return () => { gone = true; };
  }, [talk, !!live && !live.done, voice.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!talk || !live?.done || !live.text || spokenFor.current === live.text) return;
    spokenFor.current = live.text;
    voice.speak(live.text);
  }, [talk, live?.done, live?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => voice.cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** "+" → tag an agent: puts "@" at the caret and opens the list. */
  const insertAt = (ch: '@' | '#' = '@') => {
    const ta = taRef.current;
    const pos = ta?.selectionStart ?? input.length;
    const before = input.slice(0, pos);
    const ins = (before && !/\s$/.test(before) ? ' ' : '') + ch;
    setInput(before + ins + input.slice(pos));
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const p = pos + ins.length;
      ta.setSelectionRange(p, p);
      (ch === '#' ? ptags : mentions).reopen();
    });
  };

  // a group clicked in the menu opens a new chat starting with "@Group "
  // text handed over from the Prompts page (once, into a new chat)
  const [library, setLibrary] = useState(false);
  useEffect(() => {
    if (routeId) return;
    let v: string | null = null;
    try { v = sessionStorage.getItem('altter.compose'); if (v) sessionStorage.removeItem('altter.compose'); } catch {}
    if (v) {
      setInput(v);
      requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; } });
    }
  }, [routeId]);
  const mentionQ = route.query.get('mention');
  useEffect(() => {
    if (!mentionQ || routeId) return;
    setInput((v) => (v.includes('@' + mentionQ) ? v : `@${mentionQ} ${v}`));
    requestAnimationFrame(() => taRef.current?.focus());
  }, [mentionQ, routeId]);

  // "Try it in a chat" (Settings → Integrations): a new chat opens with an example already typed
  useEffect(() => {
    if (routeId) return;
    let d: string | null = null;
    try { d = sessionStorage.getItem('alter.chatDraft'); sessionStorage.removeItem('alter.chatDraft'); } catch {}
    if (!d) return;
    setInput(d);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      // select the <…> placeholder (e.g. "<paste the link…>") so typing or pasting replaces it
      const a = d!.indexOf('<'), b = d!.indexOf('>', a);
      if (a >= 0 && b > a) ta.setSelectionRange(a, b + 1);
      else ta.setSelectionRange(d!.length, d!.length);
    });
  }, [routeId]);

  // plan cards (and other in-chat buttons) send through the open chat
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; access?: Access; plan?: boolean; draft?: boolean };
      if (d.draft) {
        if (d.plan) setPlanMode(true);
        setInput(d.text);
        requestAnimationFrame(() => {
          const ta = taRef.current;
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        });
        return;
      }
      sendRef.current(d.text, undefined, { access: d.access, plan: d.plan, attachments: [] });
    };
    window.addEventListener('alter:chat-send', h);
    return () => window.removeEventListener('alter:chat-send', h);
  }, []);

  // "Fix" tapped on a phone notification → the alert chat opens with ?do=fix: send it once
  const fixAsked = route.query.get('do') === 'fix';
  const fixDone = useRef<string | null>(null);
  useEffect(() => {
    if (!fixAsked || !routeId || !conv?.messages || fixDone.current === routeId) return;
    fixDone.current = routeId;
    const last = [...conv.messages].reverse().find((m) => m.content.includes('```alter-alert'));
    let name = conv.title.replace(/^🔔\s*/, '');
    let msg = '';
    try {
      const a = JSON.parse(last!.content.split('```alter-alert')[1].split('```')[0]);
      name = a.name ?? name;
      msg = String(a.message ?? '').slice(0, 200);
    } catch {}
    navigate(`${base}/${routeId}`);
    sendRef.current(t('alert.fixMsg', { name, msg }), undefined, { access: 'full', plan: false, attachments: [] });
  }, [fixAsked, routeId, conv?.messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // elapsed-time counter while something is running
  const anyRunning = Object.values(lives).some((l) => !l.done);
  useEffect(() => setRunningChats(Object.entries(lives).filter(([, l]) => !l.done).map(([k]) => k).sort()), [lives]);
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const messages = conv && conv.id === routeId ? conv.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const showLive = !!live && !(live.done && messages.some((m) => m.role === 'assistant' && m.content === live.text));

  // follow the answer only while you are at the bottom; scroll up to read and it stays where you are
  const stick = useRef(true);
  const lastTop = useRef(0);
  const [away, setAway] = useState(false);
  const toBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    setAway(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < 60) stick.current = true;
    else if (el.scrollTop < lastTop.current - 2) stick.current = false; // moved up: that is the reader, not new text
    lastTop.current = el.scrollTop;
    setAway(!stick.current && gap > 200);
  };
  // another chat, or my own new message: back to the bottom
  const mine = messages.length ? messages[messages.length - 1].role === 'user' : false;
  useEffect(() => { stick.current = true; lastTop.current = 0; setAway(false); requestAnimationFrame(() => toBottom(false)); }, [routeId]);
  useEffect(() => { if (mine) toBottom(); }, [messages.length, mine]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: live && !live.done ? 'auto' : 'smooth' });
  }, [messages.length, live?.text, live?.steps.length]);

  const patchLive = (k: string, f: (l: Live) => Live) => setLives((all) => (all[k] ? { ...all, [k]: f(all[k]) } : all));

  // the page being built: same handling for my own answers and for answers someone else in the session asked for
  const showPreview = (p: Preview) => {
    previewUrl.current = p.url;
    setPreview(p);
    setPreviewKey((n) => n + 1);
  };
  const showDraft = (d: Draft) => {
    if (d.kind === 'html' && previewUrl.current !== d.url) showPreview({ url: d.url, file: d.file, root: '' });
    setDraft(d);
  };

  // a teammate's page (crew on the screen) opens in this chat's preview too
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.conversationId && d.conversationId === routeId && d.preview) showPreview(d.preview);
    };
    window.addEventListener('alter:crew-preview', on);
    return () => window.removeEventListener('alter:crew-preview', on);
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- online session ----------
  const myName = guest ? guest.name : status?.settings.userName || t('session.host');
  const onRun: RunHandler = ({ ev, data }) => {
    if (!routeId) return;
    const k = routeId;
    if (ev === 'snapshot' || ev === 'start') {
      setLives((all) => ({ ...all, [k]: { user: data.user, author: data.author, attachments: data.attachments, text: data.text ?? '', steps: data.steps ?? [], provider: data.provider, startedAt: data.startedAt ?? Date.now(), done: false, remote: true } }));
      invalidate(`/api/conversations/${k}`);
    } else if (ev === 'meta') patchLive(k, (l) => ({ ...l, provider: data.provider }));
    else if (ev === 'delta') patchLive(k, (l) => ({ ...l, text: l.text + data.text }));
    else if (ev === 'activity') patchLive(k, (l) => ({ ...l, steps: [...l.steps, data.text] }));
    else if (ev === 'preview') showPreview(data);
    else if (ev === 'draft') showDraft(data);
    else if (ev === 'progress') patchLive(k, (l) => ({ ...l, progress: data }));
    else if (ev === 'followup') {
      if (data.cid !== clientId) patchLive(k, (l) => ({ ...l, followUps: [...(l.followUps ?? []), { text: data.text, at: l.text.length, author: data.author }] }));
    } else if (ev === 'done' || ev === 'error') {
      patchLive(k, (l) => ({ ...l, done: true, text: ev === 'done' ? data.text : l.text || `⚠️ ${data.message}` }));
      invalidate(`/api/conversations/${k}`, '/api/conversations');
      if (ev === 'done') setTimeout(() => setLives((all) => (all[k]?.remote && all[k].done ? (({ [k]: _, ...rest }) => rest)(all) : all)), 2500);
    }
  };
  const room = useRoom(routeId, myName, onRun);
  usePointerShare(threadRef, room.send, room.others.length > 0);
  const me = room.members.find((m) => m.cid === clientId);
  useEffect(() => {
    room.send({ picks: picks.map((p) => ({ selector: p.selector, label: p.label, text: p.text.slice(0, 80) })) });
  }, [picks, room.send]);
  const remoteInPage: RemoteInPage[] = room.others.map((m) => {
    const s = room.states[m.cid] ?? {};
    return { cid: m.cid, name: m.name, color: m.color, cursor: s.cursor?.a === 'preview' && s.cursor.sel ? { sel: s.cursor.sel, fx: s.cursor.fx, fy: s.cursor.fy } : null, picks: (s.picks ?? []).map((p) => p.selector) };
  });

  async function send(text: string, via?: string, extra?: SendExtra) {
    const useProvider = via ?? provider;
    const access = extra?.access ?? accessState;
    const plan = extra?.plan ?? planMode;
    if (extra?.access) setAccess(extra.access);
    if (extra?.plan === false) setPlanMode(false);
    text = text.trim();
    const ready = extra?.attachments ?? (via ? [] : files.filter((f) => f.att).map((f) => f.att!));
    if (!via && live && !live.done && text && !ready.length) return followUp(text);
    if ((!text && !ready.length) || (live && !live.done) || (!via && uploading)) return;
    if (!via && editFrom != null && routeId) {
      const from = editFrom;
      setEditFrom(null);
      await api(`/api/conversations/${routeId}/messages/from/${from}`, { method: 'DELETE' }).catch(() => {});
    }
    if (guest && !guest.guestsCanSend) return;
    if (!via) {
      text = withPicks(text, picks);
      setPicks([]);
      setPicking(false);
      files.forEach((f) => f.thumb && URL.revokeObjectURL(f.thumb));
      setFiles([]);
    }
    setInput('');
    setBeforeEnhance(null);
    room.send({ typing: '', picks: [] });
    if (taRef.current) taRef.current.style.height = 'auto';
    const ctrl = new AbortController();
    let k = key;
    aborts.current[k] = ctrl;
    setLives((all) => ({ ...all, [k]: { user: text, attachments: ready, author: guest && me ? { name: me.name, color: me.color } : null, text: '', steps: [], startedAt: Date.now(), done: false } }));
    const resolved = useProvider === 'default' ? providers?.find((p) => p.isDefault)?.id : useProvider;
    const pref = resolved ? getPref(resolved) : { model: '', effort: '' };
    try {
      const res = await streamChat(
        guest
          ? { conversationId: routeId, message: text, attachments: ready.map((a) => a.id), cid: clientId, name: myName, ...(guest.member ? { access, plan: plan || undefined } : {}) }
          : { conversationId: routeId, projectId, agentId, message: text, attachments: ready.map((a) => a.id), cid: clientId, name: myName, provider: useProvider === 'default' ? undefined : useProvider, access, plan: plan || undefined, model: pref.model || undefined, effort: pref.effort || undefined },
        {
          meta: (m) => {
            // name the chat right away: "New chat" is free again and the list shows it while it works
            if (k === 'new') {
              const id = m.conversationId;
              setLives((all) => {
                const { new: cur, ...rest } = all;
                return cur ? { ...rest, [id]: { ...cur, provider: m.provider } } : all;
              });
              aborts.current[id] = ctrl;
              delete aborts.current.new;
              k = id;
              invalidate('/api/conversations');
              navigate(`${base}/${id}`, true);
            } else patchLive(k, (l) => ({ ...l, provider: m.provider }));
            if (m.switchedFrom) toast(t('limit.switched', { from: providerName(m.switchedFrom), to: providerName(m.provider) }), 'info');
          },
          delta: (d) => patchLive(k, (l) => ({ ...l, text: l.text + d })),
          activity: (s) => patchLive(k, (l) => ({ ...l, steps: [...l.steps, s] })),
          preview: showPreview,
          // the page as it is being typed: open the preview right away and let it build live
          draft: showDraft,
          progress: (p) => patchLive(k, (l) => ({ ...l, progress: p })),
        },
        ctrl.signal,
      );
      const now = new Date().toISOString();
      setCached<Conversation & { messages: Message[] }>(`/api/conversations/${res.conversationId}`, (prev) => ({
        ...(prev ?? { id: res.conversationId, title: text.slice(0, 60), provider: null, project_id: projectId, access, created_at: now, updated_at: now }),
        messages: [...(prev?.messages ?? []).filter((m) => !(m.role === 'user' && m.content === text)), { id: Date.now(), role: 'user', content: text, attachments: ready, author: guest && me ? { name: me.name, color: me.color } : null, provider: null, created_at: now }, { id: Date.now() + 1, role: 'assistant', content: res.text, provider: res.provider, created_at: now }],
      }));
      invalidate(`/api/conversations/${res.conversationId}`);
      setLives((all) => {
        const { [k]: _, ...rest } = all;
        return rest;
      });
      invalidate('/api/conversations', '/api/status', '/api/usage');
    } catch (e) {
      const err = e as ChatError;
      if (err.code === 'limit') {
        setLimitHit({ provider: err.provider!, until: err.until ?? null, alternatives: err.alternatives ?? [], text });
        setLives((all) => {
          const { [k]: _, ...rest } = all;
          return rest;
        });
        setInput(text);
        return;
      }
      if (err.name !== 'AbortError') toast(err.message, 'error');
      patchLive(k, (l) => ({ ...l, done: true, text: l.text || `⚠️ ${(err as Error).message}` }));
      invalidate('/api/conversations');
    } finally {
      delete aborts.current[k];
    }
  }

  /** A message while the answer is running: Claude takes it in right away, other AIs get it as the next message. */
  async function followUp(raw: string) {
    const text = withPicks(raw.trim(), picks);
    if (!text) return;
    setPicks([]);
    setPicking(false);
    setInput('');
    room.send({ typing: '', picks: [] });
    if (taRef.current) taRef.current.style.height = 'auto';
    const k = key;
    const queue = () => setQueued((q) => ({ ...q, [k]: [...(q[k] ?? []), text] }));
    if (!routeId) return queue();
    try {
      const r = await api<{ delivered: boolean }>(`/api/conversations/${routeId}/followup`, { method: 'POST', body: { message: text, cid: clientId, name: myName } });
      if (r.delivered) patchLive(k, (l) => ({ ...l, followUps: [...(l.followUps ?? []), { text, at: l.text.length, author: guest && me ? { name: me.name, color: me.color } : null }] }));
      else queue();
    } catch {
      queue();
    }
  }

  // the answer is done: send what was queued, as one message
  const waiting = queued[key];
  const answering = !!live && !live.done;
  useEffect(() => {
    if (answering || !waiting?.length) return;
    const text = waiting.join('\n\n');
    setQueued((q) => {
      const { [key]: _, ...rest } = q;
      return rest;
    });
    send(text);
  }, [answering, waiting, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPreview = async (path: string) => {
    try {
      setPreview(await api<Preview>('/api/preview', { method: 'POST', body: { path, conversationId: routeId } }));
      setPreviewKey((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const groups = useMemo(() => {
    const list = (convs ?? []).filter((c) => !filter || c.title.toLowerCase().includes(filter.toLowerCase()));
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    const g: Record<string, Conversation[]> = {};
    for (const c of list) {
      const d = new Date(c.updated_at).toDateString();
      const k = d === today ? 'chat.today' : d === yest ? 'chat.yesterday' : 'chat.older';
      (g[k] ??= []).push(c);
    }
    return (['chat.today', 'chat.yesterday', 'chat.older'] as Key[]).filter((k) => g[k]).map((k) => ({ k, items: g[k] }));
  }, [convs, filter]);

  const providerName = (id: string) => providers?.find((p) => p.id === id)?.name ?? id;
  const busy = !!live && !live.done;
  const remove = async () => {
    if (!routeId || !confirm(t('common.confirmDelete'))) return;
    await api(`/api/conversations/${routeId}`, { method: 'DELETE' });
    invalidate('/api/conversations');
    navigate(newHref);
  };
  const userInitial = (guest ? guest.host : status?.settings.userName || 'You').slice(0, 1).toUpperCase();
  const canSend = !guest || guest.guestsCanSend;
  const stop = () => (live?.remote ? api(`/api/room/${routeId}/stop`, { method: 'POST' }).catch(() => {}) : aborts.current[key]?.abort());
  /** Interrupt and send this now (like a queued message in Claude Code). */
  const sendNow = (text?: string) => {
    if (text) setQueued((q) => ({ ...q, [key]: [text, ...(q[key] ?? []).filter((x) => x !== text)] }));
    stop();
  };
  const lastStep = live?.steps[live.steps.length - 1];
  const writingFile = busy && draft && !draft.done ? draft.file.split(/[\\/]/).pop() : undefined;
  const elapsed = live ? Math.max(0, Math.round((Date.now() - live.startedAt) / 1000)) : 0;
  const toolSteps = (live?.steps ?? []).filter((s) => s !== 'Thinking' && !s.startsWith('Follow-up:'));

  return (
    <div className={`chat${listOpen ? ' list-open' : ''}${preview ? ' with-preview' : ''}${guest ? ' guest' : ''}`}>
      <LimitDialog
        hit={limitHit}
        name={providerName}
        onClose={() => setLimitHit(null)}
        onSwitch={(id) => {
          const text = limitHit!.text;
          setLimitHit(null);
          setProvider(id);
          send(text, id);
        }}
      />
      {agent && <AgentDrawer agentId={drawer ? agent.id : null} onClose={() => setDrawer(false)} />}
      <PromptPicker open={library} onClose={() => setLibrary(false)} onPick={(text) => { setInput((v) => (v.trim() ? v.trimEnd() + '\n\n' : '') + text); requestAnimationFrame(() => { const ta = taRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 320) + 'px'; } }); }} />
      {/* on phones the chat list lives here; on the computer it is the sidebar */}
      <aside
        className="chat-list"
        onClick={(e) => {
          // picking a chat (or "new chat") closes the list, also when it is the chat already open
          if ((e.target as HTMLElement).closest('.nav-item, .btn.primary')) setListOpen(false);
        }}
      >
        {listOpen && (
          <div className="side-panel chat-list-panel">
            <ChatsPanel onBack={() => (routeId || route.parts[1] === 'new' ? setListOpen(false) : navigate('/'))} />
          </div>
        )}
      </aside>

      <section
        className="thread"
        ref={threadRef}
        onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files') && canSend) { e.preventDefault(); setDragging(true); } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files') && canSend) e.preventDefault(); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div className="drop-zone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <motion.div initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }} transition={softSpring}><Upload size={34} /><b>{t('chat.dropFiles')}</b><span className="muted small">{t('chat.dropHint')}</span></motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <CursorLayer root={threadRef} others={room.others} states={room.states} />
        <div className="thread-head" data-anchor="head">
          {host && <button className="btn ghost icon sm only-mobile" onClick={() => setListOpen(true)}><Menu /></button>}
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="truncate row" style={{ gap: 8 }}>{agent && <Robot avatar={agent.avatar} size={26} running={busy} />}{conv && routeId ? conv.title : agent ? t('chat.withAgent', { name: agentName(agent, t) }) : t('chat.new')}</h2>
            {project && (
              <button className="small muted row" style={{ border: 0, background: 'none', padding: 0, gap: 6 }} onClick={() => navigate(`/projects/${project.id}`)}>
                <FolderKanban size={13} /> {project.name}
              </button>
            )}
          </div>
          <Members members={room.members} />
          {host && routeId && conv && <ShareButton conv={conv} members={room.members} />}
          {host && routeId && <button className="btn ghost icon sm" title={t('chat.new')} onClick={() => navigate(newHref)}><Plus /></button>}
          {preview === null && messages.some((m) => m.role === 'assistant' && !!(m.pages ?? m.content.match(PAGE_RE) ?? []).length) && (
            <button className="btn ghost sm" onClick={() => { const m = [...messages].reverse().find((x) => x.role === 'assistant' && (x.pages ?? x.content.match(PAGE_RE) ?? []).length); const p = (m?.pages ?? m?.content.match(PAGE_RE))?.[0]; if (p) openPreview(p); }}><MonitorPlay />{t('preview.open')}</button>
          )}
          {agent && <button className="btn ghost icon sm" title={t('agents.edit')} onClick={() => setDrawer(true)}><Settings2 /></button>}
          {host && routeId && <button className="btn ghost icon sm" title={t('chat.delete')} onClick={remove}><Trash2 /></button>}
        </div>

        <div className="messages" ref={scrollRef} onScroll={onScroll}>
          <div className="messages-inner" data-anchor="list">
            {!messages.length && !showLive && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} style={{ textAlign: 'center', paddingTop: '9vh' }}>
                <motion.div initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={softSpring} style={{ display: 'inline-block', filter: 'drop-shadow(0 16px 40px rgba(124,92,255,.4))' }}>
                  {agent ? <Robot avatar={agent.avatar} size={84} /> : <Logo size={64} />}
                </motion.div>
                <h2 style={{ fontSize: 24, margin: '18px 0 6px', letterSpacing: '-0.02em' }}>{agent ? agentName(agent, t) : t('chat.empty.title')}</h2>
                <p className="muted" style={{ margin: '0 0 24px' }}>{agent ? (agent.templateId ? t(`tpl.${agent.templateId}.desc` as Key) : agent.description) || t('chat.empty.lead') : project ? project.name : t('chat.empty.lead')}</p>
                <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  {(['chat.suggest1', 'chat.suggest2', 'chat.suggest3', 'chat.suggest4'] as Key[]).map((k, i) => (
                    <motion.button key={k} className="btn sm" onClick={() => send(t(k))} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05 }}>
                      {t(k)}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            {messages.map((m, i) => {
              const mine = host && m.role === 'user' && !m.author;
              const lastAnswer = m.role === 'assistant' && i === messages.length - 1 && !busy;
              const asked = lastAnswer ? [...messages.slice(0, i)].reverse().find((x) => x.role === 'user' && !x.author) : undefined;
              return (
                <Bubble key={m.id} m={m} userInitial={userInitial} agent={agent} onPreview={openPreview} conversationId={conv?.id}
                  onNeedsFull={host && asked && !busy && access !== 'full' ? async () => { setAccess('full'); await api(`/api/conversations/${routeId}/messages/from/${asked.id}`, { method: 'DELETE' }).catch(() => {}); void send(asked.content, undefined, { access: 'full', attachments: [] }); } : undefined}
                  onRetry={host && asked && !busy ? async () => { await api(`/api/conversations/${routeId}/messages/from/${asked.id}`, { method: 'DELETE' }).catch(() => {}); void send(asked.content); } : undefined}
                  onSend={lastAnswer && host ? (text) => void send(text) : undefined}
                  onEdit={mine && !busy ? () => { setEditFrom(m.id); setInput(m.content); setTimeout(() => taRef.current?.focus(), 30); } : undefined} />
              );
            })}
            {routeId && <CrewBoard crew={conv?.parent_id || routeId} />}
            {showLive && live && (
              <>
                {!(lastUser && lastUser.content === live.user) && <Bubble m={{ id: -1, role: 'user', content: live.user, attachments: live.attachments, author: live.author, provider: null, created_at: '' }} userInitial={userInitial} animate />}
                <motion.div className="msg assistant" data-anchor="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
                  <div className="who-av">{agent ? <Robot avatar={agent.avatar} size={32} running={!live.done} /> : <Logo size={30} />}</div>
                  <div className="bubble">
                    <div className="meta">{agent ? agentName(agent, t) : 'ALTTER'}{live.provider ? ` · ${providerName(live.provider)}` : ''}</div>
                    {!live.done && (
                      <div className="live-status">
                        <span className="spinner" />
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span key={writingFile ?? lastStep ?? '-'} className="truncate" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                            {writingFile ? t('preview.writing', { file: writingFile }) : live.text && !lastStep ? t('chat.step.writingAnswer') : stepLabel(lastStep)}
                          </motion.span>
                        </AnimatePresence>
                        <span className="faint live-elapsed">· {elapsed < 60 ? `${elapsed} s` : `${Math.floor(elapsed / 60)} min ${elapsed % 60} s`}</span>
                      </div>
                    )}
                    {!!toolSteps.length && (
                      <div className="steps">
                        <AnimatePresence initial={false}>
                          {toolSteps.slice(-6).map((s, i) => (
                            <motion.details key={`${toolSteps.length - 6 + i}-${s}`} className="step tool-detail" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                              <summary><Wrench /> <span className="truncate">{stepLabel(s)}</span></summary>
                              <pre>{s}</pre>
                            </motion.details>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                    <AnimatePresence>{live.progress && !live.done && <ProgressBar key="p" p={live.progress} />}</AnimatePresence>
                    {live.text || live.followUps?.length ? (
                      <LiveAnswer text={live.text} followUps={live.followUps ?? []} onSendNow={!live.done ? sendNow : undefined} />
                    ) : live.done ? null : <span className="typing-dots"><i /><i /><i /></span>}
                  </div>
                </motion.div>
              </>
            )}
            <TypingGhosts others={room.others} states={room.states} />
          </div>
        </div>

        <div className="composer">
          <AnimatePresence>
            {away && (
              <motion.button key="jump" type="button" className="jump-latest" onClick={() => toBottom()} initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }} transition={{ duration: 0.16 }}>
                <ArrowDown size={15} />{showLive && live && !live.done ? t('chat.jumpLive') : t('chat.jumpLatest')}
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {editFrom != null && (
              <motion.div className="queued-list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                <span className="queued-item"><Pencil size={13} /><span className="truncate">{t('chat.editing')}</span><button type="button" className="btn ghost icon sm" title={t('common.cancel')} onClick={() => { setEditFrom(null); setInput(''); }}><X size={13} /></button></span>
              </motion.div>
            )}
            {!!waiting?.length && (
              <motion.div className="queued-list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                {waiting.map((q, i) => (
                  <span key={i} className="queued-item">
                    <Clock size={13} />
                    <span className="truncate">{q}</span>
                    <button type="button" className="queued-now" title={t('chat.sendNowHint')} onClick={() => sendNow()}><ArrowUp size={12} />{t('chat.sendNow')}</button>
                    <button type="button" className="btn ghost icon sm" title={t('common.remove')} onClick={() => setQueued((all) => ({ ...all, [key]: (all[key] ?? []).filter((_, j) => j !== i) }))}><X size={13} /></button>
                  </span>
                ))}
                <span className="small faint">{t('chat.queuedHint')}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <form className="composer-box" data-anchor="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <MentionMenu m={mentions} />
            <PluginTagMenu m={ptags} />
            <VoiceStrip state={voice.state} level={voice.level} interim={voice.interim} conversation={talk} onStop={voice.stop} onCancel={() => { setTalk(false); voice.cancel(); }} />
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
            <AnimatePresence initial={false}>
              {files.length > 0 && (
                <motion.div className="attach-row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <AnimatePresence initial={false}>
                    {files.map((f) => {
                      const Icon = fileIcon(f.type);
                      return (
                        <motion.div key={f.key} layout className={`attach-chip${f.error ? ' err' : ''}${f.thumb ? ' has-thumb' : ''}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring} title={f.error ?? f.name}>
                          {f.thumb ? <img src={f.thumb} alt={f.name} onClick={() => setBigFile(f.thumb!)} /> : <span className="attach-ic"><Icon size={18} /></span>}
                          {!f.thumb && (
                            <span className="attach-txt">
                              <b className="truncate">{f.name}</b>
                              <span className="faint">{f.error ? t('chat.uploadFailed') : fmtSize(f.size)}</span>
                            </span>
                          )}
                          {!f.att && !f.error && <span className="attach-progress" style={{ ['--p' as string]: f.progress }} />}
                          <button type="button" onClick={() => dropFile(f.key)} aria-label={t('common.remove')}><X size={12} /></button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {bigFile && createPortal(<div className="attach-big" onClick={() => setBigFile(null)}><img src={bigFile} alt="" /></div>, document.body)}
            <AnimatePresence initial={false}>
              {picks.length > 0 && (
                <motion.div className="pick-chips" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <AnimatePresence initial={false}>
                    {picks.map((p, i) => (
                      <motion.span key={p.id} layout className="pick-chip" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring} title={p.selector}>
                        <b>{i + 1}</b>
                        <code className="truncate">{p.label}</code>
                        {p.text && <span className="truncate faint">{p.text}</span>}
                        <button type="button" onClick={() => setPicks((all) => all.filter((x) => x.id !== p.id))} aria-label={t('common.remove')}><X size={12} /></button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              placeholder={!canSend ? t('session.watchOnly') : busy ? t('chat.followupPlaceholder') : planMode ? t('plan.placeholder') : picks.length ? t('chat.placeholderPicks') : files.length ? t('chat.placeholderFiles') : agent ? t('chat.placeholderAgent', { name: agentName(agent, t) }) : project ? t('chat.placeholderProject', { project: project.name }) : t('chat.placeholder')}
              onSelect={() => { mentions.track(); ptags.track(); }}
              onChange={(e) => {
                setInput(e.target.value);
                mentions.track();
                ptags.track();
                room.send({ typing: e.target.value });
              }}
              onKeyDown={(e) => {
                if (mentions.onKey(e) || ptags.onKey(e)) return;
                if (e.key === 'Escape' && busy) { e.preventDefault(); stop(); return; }
                if (e.key === 'Escape' && editFrom != null) { setEditFrom(null); setInput(''); return; }
                if (e.key === 'ArrowUp' && !input && lastUser && !lastUser.author) { e.preventDefault(); setInput(lastUser.content); return; }
                if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(max-width: 820px)').matches) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <div className="composer-tools">
              {canSend && <button type="button" className="btn ghost icon sm" title={t('chat.attach')} onClick={() => fileRef.current?.click()}><Paperclip /></button>}
              {canSend && (
                <motion.button type="button" className={`btn ghost icon sm mic-btn${voice.state === 'listening' && !talk ? ' rec' : ''}`} title={t('voice.dictate')} onClick={dictate} whileTap={{ scale: 0.9 }} disabled={talk}>
                  {voice.state !== 'idle' && !talk ? <VoiceBars level={voice.level} state={voice.state} /> : <Mic />}
                </motion.button>
              )}
              {host && (
                <motion.button type="button" className={`btn ghost icon sm talk-btn${talk ? ' on' : ''}`} onClick={toggleTalk} title={t('voice.talkHint')} whileTap={{ scale: 0.9 }} aria-pressed={talk}>
                  <AudioLines />
                </motion.button>
              )}
              {host && (
                <PlusMenu
                  planMode={planMode}
                  onPlan={() => setPlanMode((v) => !v)}
                  canEnhance={input.trim().length >= 6}
                  enhancing={enhancing}
                  onEnhance={enhance}
                  onMention={() => insertAt('@')}
                  onPlugins={host ? () => insertAt('#') : undefined}
                  onLibrary={() => setLibrary(true)}
                />
              )}
              {host && <ProviderPicker value={provider} onChange={setProvider} />}
              {(host || guest?.member) && <AccessPicker value={access} onChange={setAccess} />}
              {host && (
                <ProjectPicker
                  projects={projects}
                  value={projectId}
                  locked={!!routeId}
                  onChange={(id) => navigate(`${inAgents && agentId ? base : '/chat/new'}${id ? `?project=${id}` : ''}`)}
                />
              )}
              {host && beforeEnhance !== null && (
                <motion.button type="button" className="mini-chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} onClick={() => { setInput(beforeEnhance); setBeforeEnhance(null); }} title={t('enhance.undo')}>
                  <Undo2 size={13} /><span>{t('enhance.undo')}</span>
                </motion.button>
              )}
              {host && enhancing && <span className="mini-chip busy"><WandSparkles size={13} className="spin-slow" /><span>{t('enhance.busy')}</span></span>}
              {host && planMode && (
                <motion.button type="button" className="mini-chip on" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} onClick={() => setPlanMode(false)} title={t('plan.toggleHint')}>
                  <ListChecks size={13} /><span>{t('plan.toggle')}</span><X size={12} />
                </motion.button>
              )}
              {guest && !guest.member && <span className="small faint">{t('session.guestIn', { host: guest.host })}</span>}
              <span className="grow" />
              {busy ? (
                <>
                  {/* always there while it works: a follow-up goes in at once, no need to wait */}
                  <motion.button className="send" title={t('chat.followupSend')} aria-label={t('chat.followupSend')} disabled={!canSend || !input.trim()} initial={{ scale: 0.8 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}>
                    <ArrowUp />
                  </motion.button>
                  <motion.button type="button" className="send" title={t('chat.stop')} onClick={stop} initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                    <Square size={14} fill="currentColor" />
                  </motion.button>
                </>
              ) : (
                <motion.button className="send" disabled={!canSend || uploading || (!input.trim() && !files.some((f) => f.att))} whileTap={{ scale: 0.9 }}>
                  <ArrowUp />
                </motion.button>
              )}
            </div>
          </form>
        </div>
      </section>

      <AnimatePresence>
        {preview && (
          <LivePreview
            preview={preview}
            reloadKey={previewKey}
            draft={draft}
            busy={busy}
            step={stepLabel(lastStep)}
            picking={picking}
            picks={picks}
            onPicking={(on) => {
              setPicking(on);
              if (on && wide()) taRef.current?.focus();
            }}
            onPick={(p) => {
              setPicks((all) => (all.some((x) => x.id === p.id) ? all : [...all, p]));
              if (wide()) taRef.current?.focus();
            }}
            onAsk={narrow ? (text) => send(text) : undefined}
            onUnpick={(id) => setPicks((all) => all.filter((x) => x.id !== id))}
            onReload={() => setPreviewKey((n) => n + 1)}
            remote={remoteInPage}
            onPointer={(p) => room.send({ cursor: p ? { a: 'preview', ...p } : null })}
            onClose={() => {
              setPreview(null);
              setPicking(false);
              setPicks([]);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UserText({ content }: { content: string }) {
  const { text, picks } = splitPicks(content);
  return (
    <>
      {text}
      {picks.length > 0 && (
        <div className="pick-chips in-bubble">
          {picks.map((p, i) => (
            <span key={i} className="pick-chip" title={p.selector}>
              <Crosshair size={12} />
              <code className="truncate">{p.label}</code>
              {p.text && <span className="truncate faint">{p.text}</span>}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Pictures, videos, sound and documents sent with a message. */
function Attachments({ list }: { list: Attachment[] }) {
  const [big, setBig] = useState<Attachment | null>(null);
  const images = list.filter((a) => a.type.startsWith('image/'));
  const rest = list.filter((a) => !a.type.startsWith('image/'));
  return (
    <div className="msg-files">
      {images.length > 0 && (
        <div className={`msg-images n${Math.min(images.length, 3)}`}>
          {images.map((a) => (
            <button key={a.id} type="button" className="msg-img" onClick={() => setBig(a)} title={a.name}>
              <img src={a.url} alt={a.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {rest.map((a) =>
        a.type.startsWith('video/') ? (
          <video key={a.id} className="msg-video" src={a.url} controls preload="metadata" />
        ) : a.type.startsWith('audio/') ? (
          <audio key={a.id} className="msg-audio" src={a.url} controls preload="metadata" />
        ) : (
          <a key={a.id} className="msg-file" href={a.url} target="_blank" rel="noreferrer">
            {(() => { const Icon = fileIcon(a.type); return <span className="attach-ic"><Icon size={18} /></span>; })()}
            <span className="attach-txt"><b className="truncate">{a.name}</b><span className="faint">{a.type === 'application/pdf' ? 'PDF' : a.name.split('.').pop()?.toUpperCase()} · {fmtSize(a.size)}</span></span>
          </a>
        ),
      )}
      <AnimatePresence>
        {big && (
          <motion.div className="lightbox" onClick={() => setBig(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.img src={big.url} alt={big.name} initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} transition={softSpring} />
            <span className="lightbox-name">{big.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const RANK: Record<Access, number> = { chat: 0, read: 1, full: 2 };
const NEEDS_FULL = '[[altter:needs-full]]';
/** [[altter:connect:elevenlabs]] = ALTTER asks to connect a built-in service; the card connects it in place. */
const CONNECT_RE = /\[\[altter:connect:([a-z0-9-]+)\]\]/g;
const stripMarkers = (s: string) => s.split(NEEDS_FULL).join('').replace(CONNECT_RE, '').trim();

/** The AI needs tools this chat doesn't have: one click switches to Full control and asks again. */
function NeedsFull({ onGo }: { onGo?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="needs-full">
      <ShieldCheck size={18} />
      <span className="grow"><b>{t('chat.needsFull')}</b><span className="muted small">{t('chat.needsFullHint')}</span></span>
      {onGo && <button className="btn primary sm" disabled={busy} onClick={() => { setBusy(true); onGo(); }}>{busy ? <span className="spinner" /> : <Zap size={14} />}{t('chat.needsFullGo')}</button>}
    </div>
  );
}

function Bubble({ m, userInitial, animate, agent, onPreview, conversationId, onRetry, onEdit, onNeedsFull, onSend }: { m: Message; userInitial: string; animate?: boolean; agent?: Agent; onPreview?: (path: string) => void; conversationId?: string | null; onRetry?: () => void; onEdit?: () => void; onNeedsFull?: () => void; onSend?: (text: string) => void }) {
  const t = useT();
  const pages = m.role === 'assistant' ? m.pages ?? [...new Set(m.content.match(PAGE_RE) ?? [])] : [];
  const files = m.attachments ?? [];
  // a placeholder text for file-only messages is not worth showing
  const onlyFiles = files.length > 0 && m.content === '(see the attached files)';
  const needsFull = m.role === 'assistant' && m.content.includes(NEEDS_FULL);
  const connects = m.role === 'assistant' ? [...new Set([...m.content.matchAll(CONNECT_RE)].map((x) => x[1]))] : [];
  const shown = needsFull || connects.length ? stripMarkers(m.content) : m.content;
  return (
    <motion.div className={`msg ${m.role}`} data-anchor={`m${m.id}`} initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }}>
      {m.role === 'user' ? (
        m.author ? <MemberDot name={m.author.name} color={m.author.color} size={30} /> : <div className="who-av" style={{ background: 'var(--surface-3)' }}>{userInitial}</div>
      ) : (
        <div className="who-av">{agent ? <Robot avatar={agent.avatar} size={32} /> : <Logo size={30} />}</div>
      )}
      <div className="bubble" style={m.author ? { borderColor: `color-mix(in srgb, ${m.author.color} 45%, var(--border))` } : undefined}>
        {m.role === 'assistant' && <div className="meta">{agent?.name ?? 'ALTTER'}{m.provider ? ` · ${m.provider}` : ''}</div>}
        {m.role === 'user' && m.author && <div className="ghost-meta" style={{ color: m.author.color }}>{m.author.name}</div>}
        {files.length > 0 && <Attachments list={files} />}
        {m.role === 'user' ? !onlyFiles && <UserText content={m.content} /> : <SendContext.Provider value={onSend}><AnswerWithProposals text={shown} m={m} conversationId={conversationId} /></SendContext.Provider>}
        {needsFull && <NeedsFull onGo={onNeedsFull} />}
        {connects.map((id) => <ConnectCard key={id} id={id} onContinue={onSend} />)}
        {m.media && m.media.length > 0 && <MediaResults list={m.media} />}
        {onPreview && pages.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {pages.slice(0, 3).map((p) => (
              <button key={p} className="btn sm" onClick={() => onPreview(p)}><MonitorPlay />{t('preview.open')} · {p.split(/[\\/]/).pop()}</button>
            ))}
          </div>
        )}
        {m.id > 0 && !onlyFiles && <MsgActions text={m.content} onRetry={onRetry} onEdit={onEdit} />}
      </div>
    </motion.div>
  );
}

/** Copy / answer again / edit — under each message, like in ChatGPT and Claude. */
function MsgActions({ text, onRetry, onEdit }: { text: string; onRetry?: () => void; onEdit?: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // copy the readable text, without the JSON of the visual blocks
    const plain = text.replace(/```(?:altter|alter|altter-ui|ui)\s*\n[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim();
    navigator.clipboard?.writeText(plain).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }, () => {});
  };
  return (
    <div className="msg-actions">
      <button type="button" className="btn ghost icon sm" onClick={copy} title={t('common.copy')} aria-label={t('common.copy')}>{copied ? <Check /> : <Copy />}</button>
      {onRetry && <button type="button" className="btn ghost icon sm" onClick={onRetry} title={t('chat.retry')} aria-label={t('chat.retry')}><RotateCcw /></button>}
      {onEdit && <button type="button" className="btn ghost icon sm" onClick={onEdit} title={t('chat.edit')} aria-label={t('chat.edit')}><Pencil /></button>}
    </div>
  );
}

/** The streaming answer with the messages sent mid-answer shown where they arrived. */
function LiveAnswer({ text, followUps, onSendNow }: { text: string; followUps: { text: string; at: number; author?: Author | null }[]; onSendNow?: (text: string) => void }) {
  const t = useT();
  const parts: ({ kind: 'text'; text: string } | { kind: 'follow'; text: string; author?: Author | null })[] = [];
  let cut = 0;
  for (const f of [...followUps].sort((a, b) => a.at - b.at)) {
    const before = text.slice(cut, f.at);
    if (before.trim()) parts.push({ kind: 'text', text: before });
    parts.push({ kind: 'follow', text: f.text, author: f.author });
    cut = Math.max(cut, f.at);
  }
  if (text.slice(cut).trim()) parts.push({ kind: 'text', text: text.slice(cut) });
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <AnswerWithProposals key={i} text={stripMarkers(p.text)} />
        ) : (
          <motion.div key={i} className="followup-chip" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
            <CornerDownRight size={14} />
            <span className="followup-label">{p.author ? p.author.name : t('chat.followup')}</span>
            <span className="followup-text">{p.text}</span>
            {onSendNow && !p.author && (
              <button type="button" className="queued-now" title={t('chat.sendNowHint')} onClick={() => onSendNow(p.text)}><ArrowUp size={12} />{t('chat.sendNow')}</button>
            )}
          </motion.div>
        ),
      )}
    </>
  );
}
