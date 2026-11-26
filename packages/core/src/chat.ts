import { closeMediaTools, MEDIA_GUIDE, mediaMcpUrl, openMediaTools, shareMediaKeys, wantsMedia } from './media.ts';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { draftFrom, pagesIn, previewFor, type Draft, type Preview } from './preview.ts';
import type { ToolDraft } from './providers/types.ts';
import { workspaceDir } from './config.ts';
import { logActivity } from './activity.ts';
import { all, get, now, run } from './db.ts';
import { loadConfig } from './config.ts';
import { emit } from './events.ts';
import { learnFrom } from './learning.ts';
import { getProject, touchProject } from './projects.ts';
import { buildPrompt } from './prompt.ts';
import { ACCESS_LEVELS, resolveProvider, type Access } from './providers/index.ts';
import { LimitError } from './usage.ts';
import { getAgent } from './agents.ts';
import { WEB_ENGINE, wantsWebEngine } from './webDesign.ts';
import { AUTOMATION_GUIDE, wantsAutomation } from './proposals.ts';
import { SETUP_GUIDE, wantsSetup } from './setup.ts';
import { projectDirs } from './links.ts';
import { setAgentStatus } from './status.ts';
import { closeTeam, mentionsIn, openTeam, teamGuide, teamMcpUrl, wantsTeam } from './team.ts';
import { listAgents } from './agents.ts';
import { expertSkills } from './skills.ts';
import { pluginServers, pluginsGuide, pluginTools, taggedPlugins } from './plugins.ts';
import { squadFor, startSquad, TEAM_GUIDE, wantsTeamCard } from './squad.ts';
import { closeHands, HANDS_GUIDE, HANDS_NEEDS_FULL, handsEnabled, handsMcpUrl, openHands, wantsHands, type HandsSession } from './hands.ts';
import { listeningPort } from './pairing.ts';
import { TRAVEL_GUIDE, wantsTravel } from './travel.ts';
import { isPlanApproval, PLAN_APPROVED_GUIDE, PLAN_GUIDE, wantsPlan } from './plans.ts';
import { chaosEditGuide, CREATIVE_NEEDS_FULL, creativeEngine, ensureStudio, reelCoachGuide, renderProgress, storyReelGuide, studioDir, styleGuide, wantsChaosEdit, wantsCreative, wantsReelHowTo, wantsStoryReel, wantsStyles } from './studio.ts';
import { describeAttachments, getUpload, uploadsDir, type Attachment } from './uploads.ts';
import { inboxFor } from './followups.ts';
import { FILES_GUIDE, RICH_GUIDE } from './rich.ts';
import { calendarContext } from './calendar.ts';
import { mediaMadeDuring } from './studio.ts';
import { generatedDir } from './config.ts';
import type { FollowUp } from './providers/types.ts';

export interface Author { name: string; color: string }

/**
 * In a shared chat or a workspace, several people write to the same AI, each from their own device. The AI runs on
 * the owner's computer, so without this it answers everyone as if they were the owner sitting at it.
 */
function whoIsWriting(author: Author | null, history: { role: string; content: string; author?: Author | null }[], workspace: string | null): string {
  const owner = loadConfig().userName || 'the owner';
  const host = `${owner}'s computer (${hostname()}), where ALTTER and you run`;
  // the history carries the writer as a "[Name] " prefix (see forPrompt)
  const others = [...new Set(history.filter((m) => m.role === 'user').map((m) => m.author?.name ?? /^\[([^\]\n]{1,40})\] /.exec(m.content)?.[1]).filter(Boolean))] as string[];
  if (author) {
    return [
      `WHO IS WRITING: this message comes from ${author.name}${workspace ? `, a member of the "${workspace}" workspace team` : ', a guest in this shared chat'}. ${author.name} is NOT ${owner} and is not at this computer: they write from their own device, connected over the internet (named "${author.name}" — e.g. a server, laptop or phone).`,
      `You run on ${host}. Anything you do — files, commands, programs, the screen — happens on ${owner}'s computer, not on ${author.name}'s device; you cannot see or reach ${author.name}'s device. If they ask about "this computer", "here" or "my machine", say clearly which machine you mean; for work on their own device, give them the steps or commands to run there.`,
      `Talk to ${author.name} directly by name, in their language. In the history, "[Name] text" marks who wrote each message; messages without a [Name] are from ${owner}.`,
    ].join('\n');
  }
  if (!others.length) return '';
  return `WHO IS WRITING: this message is from ${owner}, the owner, at this computer (${hostname()}). Others in this chat (${others.join(', ')}) write from their own devices; their messages start with "[Name]". Keep track of who asked what.`;
}

const HANDS_COLORS = ['#7c5cff', '#2ee6ff', '#ff6b6b', '#3ddc97', '#fcc419', '#ff2bd6'];

export interface Conversation {
  id: string;
  title: string;
  provider: string | null;
  project_id: string | null;
  access: Access;
  agent_id: string | null;
  /** A crew helper's chat: the lead's chat it belongs to, and the helper's name/colour (JSON). */
  parent_id?: string | null;
  crew?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  created_at: string;
  attachments?: Attachment[];
  /** Someone else in an online session (null = the owner). */
  author?: Author | null;
  /** Images/videos the AI made while writing this answer (absolute paths). */
  mediaFiles?: string[];
}

const parse = <T>(s: unknown): T | undefined => {
  if (typeof s !== 'string' || !s) return undefined;
  try { return JSON.parse(s) as T; } catch { return undefined; }
};

export const listConversations = (opts: { projectId?: string | null; limit?: number } = {}) =>
  opts.projectId === undefined
    ? all<Conversation>('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?', opts.limit ?? 100)
    : opts.projectId === null
      ? all<Conversation>('SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT ?', opts.limit ?? 100)
      : all<Conversation>('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?', opts.projectId, opts.limit ?? 100);

export const getConversation = (id: string) => get<Conversation>('SELECT * FROM conversations WHERE id = ?', id);

export const getMessages = (conversationId: string, limit = 200): Message[] =>
  all<Record<string, any>>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?', conversationId, limit)
    .reverse()
    .map(({ media, ...m }) => ({ ...m, attachments: parse<Attachment[]>(m.attachments) ?? [], author: parse<Author>(m.author) ?? null, mediaFiles: parse<string[]>(media) ?? [] }) as Message);

/** A message as the AI sees it in the history: who wrote it (in a shared chat) and what was attached. */
const forPrompt = (m: Message) =>
  (m.author ? `[${m.author.name}] ` : '') + m.content + (m.attachments?.length ? `\n(attached: ${m.attachments.map((a) => `${a.name} → ${getUpload(a.id)?.file ?? 'deleted'}`).join(', ')})` : '');

export function deleteConversation(id: string): boolean {
  const ok = Number(run('DELETE FROM conversations WHERE id = ?', id).changes) > 0;
  if (ok) emit('conversation.updated', { id, deleted: true });
  return ok;
}

export function updateConversation(id: string, patch: { title?: string; access?: Access; provider?: string | null; projectId?: string | null }) {
  const c = getConversation(id);
  if (!c) return undefined;
  run(
    'UPDATE conversations SET title = ?, access = ?, provider = ?, project_id = ? WHERE id = ?',
    patch.title?.trim() || c.title,
    patch.access && ACCESS_LEVELS.includes(patch.access) ? patch.access : c.access,
    patch.provider === undefined ? c.provider : patch.provider,
    patch.projectId === undefined ? c.project_id : patch.projectId,
    id,
  );
  emit('conversation.updated', { id });
  return getConversation(id);
}

export interface ChatRequest {
  conversationId?: string;
  projectId?: string | null;
  message: string;
  provider?: string;
  access?: Access;
  /** Talk to one of the user's agents: its role, AI and access apply. */
  agentId?: string | null;
  /** Model + effort picked in the chat (for the provider it was picked for). */
  model?: string;
  effort?: string;
  /** Use the mouse, keyboard and screen (computer use) as this name/colour — set for crews; otherwise decided from the message. */
  hands?: { name: string; color: string; brief?: string };
  /** Crew: the lead's chat this helper works for (its board and preview show there). */
  parentId?: string;
  /** Plan mode: look around read-only and answer with a plan card first. */
  plan?: boolean;
  /** Uploaded files (ids from /api/uploads) sent with this message. */
  attachments?: string[];
  /** Who wrote it, when it is not the owner (online sessions). */
  author?: Author | null;
  /** Called once the user message is stored (online sessions mirror it to everyone). */
  onUserMessage?: (m: { conversationId: string; content: string; attachments: Attachment[]; author: Author | null }) => void;
  onDelta?: (text: string) => void;
  onActivity?: (text: string) => void;
  /** A web page the AI created/changed — shown live next to the chat. */
  onPreview?: (p: Preview) => void;
  /** A page / stylesheet as the AI types it (throttled) — the preview builds it live. */
  onDraft?: (d: Draft) => void;
  /** Long jobs (Studio install, a video render): a progress bar in the chat. */
  onProgress?: (p: { stage: string; pct: number; label?: string } | null) => void;
  onMeta?: (meta: { conversationId: string; provider: string; projectId: string | null; switchedFrom?: string }) => void;
  signal?: AbortSignal;
}

/** The message asks for something made as a file: a logo, graphic, page, document, video… */
const RANK: Record<Access, number> = { chat: 0, read: 1, full: 2 };

/** Asking for something this access level can't do: say so briefly and let the app offer the switch (a button that continues the job). */
export const NEEDS_FULL_MARK = '[[altter:needs-full]]';
const NEEDS_FULL_GUIDE = `## When this chat's access is not enough
This chat is NOT in "Full control", so here you can't write or change files, run commands, install things, use the computer or render media. If the request needs any of that: do NOT explain workarounds, paste long code for the user to save by hand, or say you are unable. Answer in 1-2 short lines in the user's language: what you will do once you have Full control (a one-line plan), then end the answer with this exact line on its own:
${NEEDS_FULL_MARK}
The app turns that line into a "Switch to Full control and continue" button: one click and you get the request again with full tools. Use the line ONLY when tools are really needed; questions, explanations, advice and short snippets are answered normally.`;

const MAKE_RE = /\b(zr[oó]b|zr[oó]bcie|stw[oó]rz|zaprojektuj|wygeneruj|narysuj|przygotuj|napisz|wyrenderuj|make|create|design|generate|draw|render|build|mach|erstelle|crea|haz|dise[nñ]a|fais|cr[ée]e|зроби|створи|намалюй)\w*\b[^.?!\n]{0,80}\b(logo|grafik|obraz|ikon|baner|banner|plakat|ulotk|wizyt[oó]wk|stron|witryn|landing|html|svg|png|jpe?g|webp|gif|pdf|plik|prezentacj|slajd|film|wideo|video|animacj|miniaturk|thumbnail|image|icon|poster|flyer|website|page|file|slides?|mockup|makiet|bild|seite|imagen|p[aá]gina|affiche|лого|сайт|картин)/i;
const wantsMake = (message: string, history: { content: string }[]) =>
  MAKE_RE.test(message) || wantsMedia(message) || wantsCreative(message, history) || wantsWebEngine(message, history);

export async function chat(req: ChatRequest): Promise<{ conversationId: string; text: string; provider: string }> {
  const files = (req.attachments ?? []).slice(0, 20).map(getUpload).filter((a): a is Attachment & { file: string } => !!a);
  const message = req.message.trim() || (files.length ? '(see the attached files)' : '');
  if (!message) throw new Error('Empty message');
  const attachments: Attachment[] = files.map(({ file, ...a }) => a);

  let conv = req.conversationId ? getConversation(req.conversationId) : undefined;
  const agentForNew = !conv && req.agentId ? getAgent(req.agentId) : undefined;
  if (!conv) {
    const id = randomUUID();
    const ts = now();
    const title = message.replace(/\s+/g, ' ').slice(0, 60);
    const access = req.access && ACCESS_LEVELS.includes(req.access) ? req.access : (loadConfig().defaultAccess ?? 'chat');
    run(
      'INSERT INTO conversations (id, title, provider, project_id, access, agent_id, created_at, updated_at, parent_id, crew) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      title,
      req.provider && req.provider !== 'default' ? req.provider : (agentForNew?.provider && agentForNew.provider !== 'default' ? agentForNew.provider : null),
      req.projectId ?? agentForNew?.projectId ?? null,
      req.access && ACCESS_LEVELS.includes(req.access) ? access : (agentForNew?.access ?? access),
      agentForNew?.id ?? null,
      ts,
      ts,
      req.parentId ?? null,
      req.parentId && req.hands ? JSON.stringify({ name: req.hands.name, color: req.hands.color }) : null,
    );
    conv = getConversation(id)!;
  } else if (req.access && req.access !== conv.access) {
    conv = updateConversation(conv.id, { access: req.access })!;
  } else if (!req.access && !req.author && !conv.agent_id && RANK[loadConfig().defaultAccess ?? 'chat'] > RANK[conv.access]) {
    // the remembered access ("Full control" once = always) also lifts older chats
    conv = updateConversation(conv.id, { access: loadConfig().defaultAccess })!;
  }

  const project = getProject(conv.project_id);
  const autoSwitch = loadConfig().onLimit === 'switch';
  let provider = await resolveProvider(req.provider ?? conv.provider ?? 'default', { avoidLimited: autoSwitch });
  req.onMeta?.({ conversationId: conv.id, provider: provider.id, projectId: conv.project_id });

  const history = getMessages(conv.id, 16).map((m) => ({ role: m.role, content: forPrompt(m) }));
  const author = req.author ?? null;
  run(
    'INSERT INTO messages (conversation_id, role, content, provider, created_at, attachments, author) VALUES (?, ?, ?, ?, ?, ?, ?)',
    conv.id, 'user', message, null, now(), attachments.length ? JSON.stringify(attachments) : null, author ? JSON.stringify(author) : null,
  );
  req.onUserMessage?.({ conversationId: conv.id, content: message, attachments, author });
  logActivity('chat', `${project ? `[${project.name}] ` : ''}User asked: ${message.slice(0, 160)}`, conv.id);
  emit('conversation.updated', { id: conv.id });

  const agent = conv.agent_id ? getAgent(conv.agent_id) : undefined;
  const query = [author ? `[${author.name}] ${message}` : message, describeAttachments(files)].filter(Boolean).join('\n\n');
  // creative work (video, motion, 3D, edits, graphics): the Studio kit, installed once
  const planning = !!req.plan || wantsPlan(message);
  const approved = !planning && isPlanApproval(message, history);
  // "make me a logo / a page / a graphic" in a chat without tools: just do it (this one answer works in the
  // chat's folder with full tools) instead of explaining that it can't write files. Only for the owner.
  if (conv.access === 'chat' && !planning && !author && !req.parentId && wantsMake(message, history)) {
    conv = { ...conv, access: 'full' };
    req.onActivity?.('Making files for this answer');
  }
  // "@Team do X" where Team runs itself: the lead takes over, the answer is its live board
  const squad = !planning && !req.hands && !author ? squadFor(message) : null;
  if (squad) {
    const board = startSquad(conv.id, squad.id, message.replace(new RegExp('@' + squad.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '').trim() || message, message);
    req.onDelta?.(board.content);
    run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), conv.id);
    return { conversationId: conv.id, text: board.content, provider: 'team' };
  }
  const chaosEdit = wantsChaosEdit(message, history, files.some((f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)));
  const storyReel = !chaosEdit && wantsStoryReel(message, history);
  const styles = !planning && wantsStyles(message, history);
  const creative = chaosEdit || storyReel || styles || wantsCreative(message, history);
  let studioReady = false;
  if (creative) shareMediaKeys();
  if (creative && conv.access === 'full' && !planning) {
    try {
      await ensureStudio((label, pct) => req.onProgress?.({ stage: 'install', pct: (pct ?? 0) * 100, label }));
      studioReady = true;
    } catch (e) {
      req.onActivity?.(`Studio: ${(e as Error).message}`);
    }
    req.onProgress?.(null);
  }
  // computer use: only when turned on in Settings and the chat has full access
  const useHands = !planning && conv.access === 'full' && handsEnabled() && process.platform === 'win32' && (!!req.hands || agent?.tools?.includes('hands') || wantsHands(message));
  // other agents: @mentions (or asking to involve them) give this answer the alter_team tools
  const mentioned = mentionsIn(message);
  const useTeam = !planning && (mentioned.agents.length > 0 || mentioned.groups.length > 0 || (wantsTeam(message) && listAgents().some((a) => !a.monitor && a.id !== agent?.id)));
  const calendar = planning ? '' : await calendarContext(message).catch(() => '');
  const extra = planning ? PLAN_GUIDE : [
    whoIsWriting(author, history, project?.name ?? null),
    calendar,
    useHands ? HANDS_GUIDE + (req.hands?.brief ? '\n\n' + req.hands.brief : '') : conv.access !== 'full' && handsEnabled() && process.platform === 'win32' && (!!req.hands || wantsHands(message)) ? HANDS_NEEDS_FULL : '',
    approved ? PLAN_APPROVED_GUIDE : '',
    wantsTravel(message) && !creative ? TRAVEL_GUIDE : '',
    conv.access !== 'chat' && wantsWebEngine(message, history) && !creative ? WEB_ENGINE : '',
    creative ? (studioReady ? creativeEngine() : conv.access === 'full' ? '' : CREATIVE_NEEDS_FULL) : '',
    storyReel ? storyReelGuide() : '',
    chaosEdit ? chaosEditGuide() : '',
    styles && studioReady ? styleGuide() : '',
    !planning && wantsReelHowTo(message, history) ? reelCoachGuide() : '',
    !agent && wantsAutomation(message, history) ? AUTOMATION_GUIDE : '',
    wantsSetup(message, history) ? SETUP_GUIDE : '',
    !agent && wantsTeamCard(message, history) ? TEAM_GUIDE : '',
    useTeam ? teamGuide(mentioned) : '',
    !planning && conv.access !== 'chat' && (wantsMedia(message) || agent?.tools?.includes('media')) ? MEDIA_GUIDE : '',
    expertSkills(message).text,
    planning ? '' : pluginsGuide(),
    planning ? '' : taggedPlugins(message),
    planning ? '' : RICH_GUIDE,
    !planning && conv.access !== 'chat' ? FILES_GUIDE : '',
    !planning && conv.access !== 'full' && !author && !req.parentId ? NEEDS_FULL_GUIDE : '',
  ].filter(Boolean).join('\n\n');
  const prompt = buildPrompt({ query, history, project, instructions: agent ? `You are "${agent.name}", one of the user's agents. ${agent.instructions}` : undefined, extra: extra || undefined });
  const picked = provider.id;
  const model = req.model ?? (agent && (agent.provider === 'default' || agent.provider === picked) ? agent.model : undefined);
  const effort = req.effort ?? (agent && (agent.provider === 'default' || agent.provider === picked) ? agent.effort : undefined);
  // model names differ between AIs: only use them on the AI they were picked for
  // file edits → live preview (checked a moment later: the tool event arrives before the file is written)
  const cwd = project?.folder ?? workspaceDir();
  let lastPreview: Preview | undefined;
  // a crew helper's page also shows in the lead's chat
  const showPage = (p: Preview) => {
    req.onPreview?.(p);
    if (req.parentId) emit('crew.preview', { conversationId: req.parentId, preview: p });
  };
  const onActivity = (step: string) => {
    req.onActivity?.(step);
    const m = step.match(/^(?:Write|Edit|MultiEdit|NotebookEdit): (.+)$/);
    if (!m || (!req.onPreview && !req.parentId)) return;
    for (const ms of [1200, 4000]) setTimeout(() => {
      const p = previewFor(m[1].trim(), cwd);
      if (p) { lastPreview = p; showPage(p); }
    }, ms);
  };
  // streaming writes → the page as typed so far, a few times a second
  const draftCache = new Map<string, string>();
  const lastSent = new Map<string, number>();
  const onDraft = req.onDraft
    ? (d: ToolDraft) => {
        const t = Date.now();
        if (!d.done && t - (lastSent.get(d.id) ?? 0) < 180) return;
        lastSent.set(d.id, t);
        const draft = draftFrom(d, cwd, draftCache);
        if (draft) req.onDraft!(draft);
        if (d.done) draftCache.delete(d.id);
      }
    : undefined;
  // a render in this folder → progress bar
  const poll = studioReady && req.onProgress
    ? setInterval(() => {
        const p = renderProgress(cwd);
        req.onProgress!(p ? { stage: p.stage, pct: p.pct, label: p.id } : null);
      }, 700)
    : undefined;
  const dirs = [...(files.length ? [uploadsDir()] : []), ...(studioReady ? [studioDir()] : []), ...projectDirs(project)];
  const handsAbort = new AbortController();
  req.signal?.addEventListener('abort', () => handsAbort.abort(), { once: true });
  const handsSession: HandsSession | undefined = useHands ? openHands(req.hands?.name ?? agent?.name ?? 'ALTTER', req.hands?.color ?? HANDS_COLORS[(agent?.name ?? 'ALTTER').length % HANDS_COLORS.length], handsAbort, { crew: req.parentId ?? (req.hands?.brief ? conv.id : undefined), conversationId: conv.id, lead: !req.parentId && !!req.hands?.brief }) : undefined;
  const teamSession = useTeam ? openTeam(agent?.name ?? 'ALTTER', agent?.id ?? null, 0, req.signal) : undefined;
  const mediaToken = !planning && conv.access !== 'chat' && (wantsMedia(message) || !!agent?.tools?.includes('media')) ? openMediaTools(conv.id) : null;
  const mcpList = [...(mediaToken ? [{ name: 'alter_media', url: mediaMcpUrl(listeningPort(), mediaToken) }] : []), ...(handsSession ? [{ name: 'alter_hands', url: handsMcpUrl(listeningPort(), handsSession) }] : []), ...(teamSession ? [{ name: 'alter_team', url: teamMcpUrl(listeningPort(), teamSession) }] : []), ...(planning ? [] : pluginServers())];
  const mcp = mcpList.length ? mcpList : undefined;
  if (agent) setAgentStatus(agent.id, 'working', `chat: ${message.replace(/\s+/g, ' ')}`);
  const startedAt = Date.now();
  const runOn = (p: typeof provider) => p.run({ browser: chaosEdit || undefined, inbox: p.steerable ? inboxFor(conv!.id) : undefined, mcp, prompt, onDraft, files: files.map((f) => f.file), fileDirs: dirs.length ? dirs : undefined, model: p.id === picked ? model || undefined : undefined, effort: p.id === picked ? effort || undefined : undefined, onDelta: req.onDelta, onActivity, access: planning ? (conv!.access === 'chat' ? 'chat' : 'read') : conv!.access, tools: [...(agent?.tools ?? []), ...(planning ? [] : pluginTools())], cwd: project?.folder ?? (studioReady ? cwd : undefined), signal: handsSession ? handsAbort.signal : req.signal, blockTools: handsSession ? ['Task', 'Agent'] : undefined, timeoutMs: handsSession ? 120 * 60_000 : conv!.access === 'full' || studioReady ? 60 * 60_000 : 20 * 60_000 });
  let text: string;
  let followUps: FollowUp[] | undefined;
  try {
    ({ text, followUps } = await runOn(provider));
  } catch (err) {
    if (poll) clearInterval(poll);
    if (!(err instanceof LimitError)) throw err;
    // the subscription ran out: switch by itself (setting) or let the user pick in the chat
    const other = await resolveProvider('default', { avoidLimited: true });
    if (!autoSwitch || other.id === provider.id || other.id === 'demo') throw err;
    req.onMeta?.({ conversationId: conv.id, provider: other.id, projectId: conv.project_id, switchedFrom: provider.id });
    provider = other;
    ({ text, followUps } = await runOn(provider));
  } finally {
    if (poll) clearInterval(poll);
    if (handsSession) closeHands(handsSession);
    if (mediaToken) closeMediaTools(mediaToken);
    if (teamSession) closeTeam(teamSession);
    if (agent) setAgentStatus(agent.id, 'idle', `chat: ${message.replace(/\s+/g, ' ')}`);
  }
  if (poll) req.onProgress?.(null);

  // images / videos made while answering → shown in the chat with the answer
  const made = conv.access === 'chat' ? [] : mediaMadeDuring([cwd, ...projectDirs(project), generatedDir(), ...(studioReady ? [studioDir()] : [])], startedAt, text);
  // follow-ups sent mid-answer sit where they arrived: answer part, follow-up, rest of the answer
  const parts: { role: 'user' | 'assistant'; content: string }[] = [];
  let cut = 0;
  for (const f of [...(followUps ?? [])].sort((a, b) => a.at - b.at)) {
    const before = text.slice(cut, f.at).trim();
    if (before) parts.push({ role: 'assistant', content: before });
    parts.push({ role: 'user', content: f.text });
    cut = Math.max(cut, f.at);
  }
  const rest = followUps?.length ? text.slice(cut).trim() : text;
  parts.push({ role: 'assistant', content: rest || '…' });
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    run('INSERT INTO messages (conversation_id, role, content, provider, created_at, author, media) VALUES (?, ?, ?, ?, ?, ?, ?)', conv!.id, p.role, p.content, p.role === 'assistant' ? provider.id : null, now(), p.role === 'user' && author ? JSON.stringify(author) : null, last && made.length ? JSON.stringify(made) : null);
  });
  // final refresh of the preview (or open one for a page the answer points to)
  const page = lastPreview ?? pagesIn(text).map((f) => previewFor(f, cwd)).find(Boolean);
  if (page) showPage(page);
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), conv.id);
  touchProject(conv.project_id);
  emit('conversation.updated', { id: conv.id });

  learnFrom(`User: ${message}\n\nAlter: ${text}`, `chat:${conv.id}`, conv.project_id);
  return { conversationId: conv.id, text, provider: provider.id };
}
