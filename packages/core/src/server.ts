import { randomUUID } from 'node:crypto';
import { deleteMedia, handleMediaMcp, listCharacters, listMedia, mediaOptions, mediaView, saveCharacters, setMediaKeys, startMedia } from './media.ts';
import { installLocal, localStatus, removeLocal } from './localgen.ts';
import { deletePrompt, listPrompts, savePrompt, usePrompt } from './prompts.ts';
import { localUsage, warmUsage } from './usageLocal.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { acceptProposal } from './proposals.ts';
import { addLink, applySetup, removeLink } from './setup.ts';
import { deleteGroup, handleTeamMcp, listGroups, saveGroup } from './team.ts';
import { handleCouncilMcp } from './council.ts';
import { agentStatuses } from './status.ts';
import { ensureVoice, transcribe, voiceStatus } from './voice.ts';
import { normalizeUrl, seoAudit } from './seo.ts';
import { exportVoiceEngine, setVoiceEngine, speak, voiceoverStatus, voiceStudioStatus } from './voiceover.ts';
import { sendFollowUp } from './followups.ts';
import { deleteRender, ensureStudio, mediaFor, publicBrand, listRenders, mediaForFiles, mediaIn, mediaNamedIn, serveMedia, setBrand, studioStatus } from './studio.ts';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { recentActivity } from './activity.ts';
import { listWsLog, wsChanged, wsLog } from './wslog.ts';
import { importMemories } from './memoryImport.ts';
import { getBoard as getWsBoard, saveBoard } from './board.ts';
import {
  TEMPLATES, checkMonitor, createAgent, createFromTemplate, deleteAgent, getAgent, isRunning, listAgents, listRuns, runAgent, stopAgent, updateAgent,
} from './agents.ts';
import { chat, deleteConversation, getConversation, getMessages, listConversations, updateConversation } from './chat.ts';
import { all as dbAll, run } from './db.ts';
import { enhancePrompt } from './enhance.ts';
import { addPushSub, notifyPhones, pushSubs, removePushForDevice, removePushSub, vapid } from './push.ts';
import { getBoard, hasBoard } from './crewBoard.ts';
import { crewSize, handleHandsMcp, handsEnabled, handsSessions, setHandsEnabled, stopAllHands, wantsHands } from './hands.ts';
import { HOME, LANGUAGES, loadConfig, projectsDir, updateConfig, workspaceDir, type Language } from './config.ts';
import { bus, emit, type AlterEvent } from './events.ts';
import { addMemory, deleteMemory, listMemories, updateMemory } from './memory.ts';
import { runCheck } from './monitor.ts';
import { serverPackageReady, serverSetupScript } from './serverPkg.ts';
import { applyTeam, removeAgents, removeProjectAgents, removeTeam, squadProject, startSquad, stopSquad } from './squad.ts';
import { CATALOG, forgetPluginStatus, installCustom, installFromCatalog, pluginStatus, publicPlugins, removePlugin, setPluginEnabled } from './plugins.ts';
import { detectCli } from './providers/process.ts';
import { domainFor, ensureRelayKey, vpsSetupScript, publicRemoteSettings, publicUrl, RELAY_HEADER, setRemoteSettings, startTunnel, stopTunnel, tunnelStatus } from './remote.ts';
import { authenticate, claimPairing, lanUrls, revokeDevice, setListening, startPairing } from './pairing.ts';
import { createProject, deleteProject, getProject, listProjects, updateProject } from './projects.ts';
import { addComment, addDepartment, addPerson, createTask, deleteDoc, deleteTask, departments, dropProjectMembers, getDoc, getTask, inviteMember, listComments, listDocs, listTasks, makeReport, memberByToken, membersOf, ownerActor, people, personActor, planTasks, publicMember, publicPerson, removeDepartment, removeMember, removePerson, rulesOf, saveDoc, setRules, startWorkspaceAutomations, tasksIcs, updateDepartment, updatePerson, updateTask, workspaceStats } from './workspace.ts';
import { connectProvider, providerStatuses, testProvider } from './providers/index.ts';
import { isLimited, LimitError, usageSummary } from './usage.ts';
import { importProject, pickFolder, scanProject } from './projectImport.ts';
import { previewFor, resolvePreview } from './preview.ts';
import { PREVIEW_KIT } from './previewKit.ts';
import { listSkills } from './skills.ts';
import { searchGitHubSkills, previewGitHubSkills, installGitHubSkill } from './githubSkills.ts';
import { VERSION } from './version.ts';
import { MAX_UPLOAD, getUpload, saveUpload, serveUpload, type Attachment } from './uploads.ts';
import { addCalendar, publicCalendars, removeCalendar, upcoming } from './calendar.ts';
import { convertSale, deleteSale, draftSale, getSale, KINDS, listSales, salesStats, saveSale, sellerProfile, setSellerProfile } from './sales.ts';
import { checkUpdate, installUpdate, startUpdateChecks, updateInfo } from './updates.ts';
import { buildReport, myReports, replyReport, sendReport, startUsagePings } from './report.ts';
import {
  authenticateGuest, colorFor, isGuest, joinRoom, roomMembers, runEvent, runStarted, setPresence, shareByToken, shareFor, startShare,
  stopRun, stopShare, type Guest,
} from './rooms.ts';

const WEB_ROOT = process.env.ALTER_WEB_DIR ?? resolve(import.meta.dirname, '../../../apps/web');
// Built UI lives in /dist; fall back to the folder itself (packaged app copies dist contents directly).
const WEB_DIR = existsSync(join(WEB_ROOT, 'dist', 'index.html')) ? join(WEB_ROOT, 'dist') : WEB_ROOT;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Auth = ReturnType<typeof authenticate> | Guest;
type Ctx = { req: IncomingMessage; res: ServerResponse; params: string[]; url: URL; body: any; auth: Auth };
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
/** open: no token needed · guest: a share-link guest may call it (the handler checks the chat) · raw: the body is a file, not JSON */
type RouteOpts = { open?: boolean; guest?: boolean; raw?: boolean };
const routes: ({ method: string; re: RegExp; handler: Handler } & RouteOpts)[] = [];
const route = (method: string, path: string, handler: Handler, opts: boolean | RouteOpts = false) =>
  routes.push({ method, re: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), handler, ...(typeof opts === 'boolean' ? { open: opts } : opts) });

/** A guest only ever reaches the one chat their link is for; a workspace member any chat of their project (or a new one there). */
const guardChat = (auth: Auth, conversationId: unknown) => {
  if (!isGuest(auth)) return;
  if (auth.member) {
    if (conversationId == null || conversationId === '') return;
    const c = typeof conversationId === 'string' ? getConversation(conversationId) : undefined;
    if (!c || !c.project_id || !auth.member.projectIds.includes(c.project_id)) throw new HttpError(403, 'This chat is not part of your workspace');
    return;
  }
  if (auth.share.conversationId !== conversationId) throw new HttpError(403, 'This link is for another chat');
};
/** The project a workspace call is about: a member's own, or (owner) the ?project= one. */
const wsProject = (auth: Auth, url: URL) => {
  const want = url.searchParams.get('project');
  if (isGuest(auth)) {
    if (!auth.member) throw new HttpError(403, 'Not a workspace member');
    const id = want && auth.member.projectIds.includes(want) ? want : auth.member.projectIds[0];
    return getProject(id ?? null) ?? notFound();
  }
  return getProject(want) ?? notFound();
};

const isLoopback = (req: IncomingMessage) => {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};
const isLocalHostHeader = (req: IncomingMessage) => {
  // anything that came through the internet link is never "this computer"
  if (req.headers[RELAY_HEADER] || req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['x-forwarded-for']) return false; // x-forwarded-for: Caddy on an ALTTER server
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
};
const ownerOnly = (auth: Auth, what: string) => {
  if (auth !== 'owner') throw new HttpError(403, `Only the computer running ALTTER can ${what}`);
};

function settingsView() {
  const c = loadConfig();
  return { defaultProvider: c.defaultProvider, learning: c.learning, usageStats: (c as any).usageStats !== false, language: c.language, userName: c.userName, onboarded: c.onboarded, onLimit: c.onLimit, defaultAccess: c.defaultAccess };
}

// ---------- boot / status / settings ----------
route('GET', '/api/health', () => ({ ok: true, name: 'alter', version: VERSION }), true);

/** The computer's own window gets the owner token; any other device must pair. Cross-origin pages can't read this. */
route('GET', '/api/boot', ({ req }) => (isLoopback(req) && isLocalHostHeader(req) ? { token: loadConfig().ownerToken } : {}), true);

route('GET', '/api/status', async ({ auth }) => {
  const cfg = loadConfig();
  return {
    version: VERSION,
    you: auth === 'owner' ? { kind: 'computer' } : { kind: 'device', name: (auth as any)?.name },
    providers: await providerStatuses(),
    counts: { agents: listAgents().length, memories: listMemories().length, conversations: listConversations().length, projects: listProjects().length },
    settings: settingsView(),
    paths: { data: HOME, projects: projectsDir() },
    lanUrls: lanUrls(),
    publicUrl: publicUrl(),
  };
});

route('PUT', '/api/settings', ({ body }) => {
  const patch: Record<string, unknown> = {};
  if (typeof body.defaultProvider === 'string') patch.defaultProvider = body.defaultProvider;
  if (typeof body.learning === 'boolean') patch.learning = body.learning;
  if (typeof body.usageStats === 'boolean') patch.usageStats = body.usageStats;
  if (typeof body.userName === 'string') patch.userName = body.userName.slice(0, 60);
  if (typeof body.onboarded === 'boolean') patch.onboarded = body.onboarded;
  if (body.onLimit === 'ask' || body.onLimit === 'switch') patch.onLimit = body.onLimit;
  if (body.defaultAccess === 'chat' || body.defaultAccess === 'read' || body.defaultAccess === 'full') patch.defaultAccess = body.defaultAccess;
  if ((LANGUAGES as readonly string[]).includes(body.language)) patch.language = body.language as Language;
  updateConfig(patch);
  const s = settingsView();
  emit('settings.changed', s);
  return s;
});

/** Finishes first-run setup in one go. */
route('POST', '/api/onboarding', ({ body, auth }) => {
  const patch: Record<string, unknown> = { onboarded: true };
  if (typeof body.userName === 'string') patch.userName = body.userName.trim().slice(0, 60);
  if ((LANGUAGES as readonly string[]).includes(body.language)) patch.language = body.language;
  if (typeof body.defaultProvider === 'string') patch.defaultProvider = body.defaultProvider;
  updateConfig(patch);
  if (patch.userName) addMemory({ kind: 'profile', content: `The user's name is ${patch.userName}`, importance: 5, source: 'onboarding' });
  if (typeof body.about === 'string' && body.about.trim()) addMemory({ kind: 'profile', content: body.about.trim(), importance: 5, source: 'onboarding' });
  if (typeof body.day === 'string' && body.day.trim()) addMemory({ kind: 'routine', content: body.day.trim(), importance: 4, source: 'onboarding' });
  // folders / links the user works on: each becomes a project, scanned one by one in the background
  const sources = (Array.isArray(body.sources) ? body.sources : []).filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).slice(0, 12);
  if (sources.some((x: string) => !/^https?:|^git@/i.test(x.trim()))) ownerOnly(auth, 'import local folders');
  (async () => {
    for (const source of sources) await importProject({ source }).catch((err) => console.warn('[alter] import failed:', source, err.message));
  })();
  const created = [];
  for (const t of Array.isArray(body.agents) ? body.agents : []) {
    if (TEMPLATES.some((x) => x.templateId === t) && !listAgents().some((a) => a.templateId === t)) created.push(createFromTemplate(t, { templateId: t }));
  }
  const s = settingsView();
  emit('settings.changed', s);
  return { settings: s, agents: created };
});

// ---------- providers ----------
route('GET', '/api/providers', ({ url }) => providerStatuses(url.searchParams.has('refresh')));
route('POST', '/api/providers/:id/connect', ({ params }) => connectProvider(params[0]));
route('GET', '/api/usage', ({ url }) => usageSummary(Number(url.searchParams.get('days') ?? 30)));
route('POST', '/api/providers/:id/test', ({ params }) => testProvider(params[0]));

// ---------- projects ----------
route('GET', '/api/projects', () => listProjects());
route('POST', '/api/projects', ({ body }) => createProject(body));
route('POST', '/api/projects/import', async ({ body, auth }) => {
  const src = String(body.source ?? '');
  if (!/^https?:|^git@/i.test(src.trim())) ownerOnly(auth, 'import local folders');
  try {
    return await importProject({ source: src, name: body.name, color: body.color, icon: body.icon });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('POST', '/api/projects/:id/scan', ({ params }) => {
  if (!getProject(params[0])) notFound();
  scanProject(params[0]).catch(() => {});
  return { started: true };
});
route('POST', '/api/preview', ({ body, auth }) => {
  if (isGuest(auth)) guardChat(auth, body.conversationId);
  else ownerOnly(auth, 'preview files');
  // relative paths are relative to where that chat works (its project folder or the workspace)
  const conv = typeof body.conversationId === 'string' ? getConversation(body.conversationId) : undefined;
  const cwd = getProject(conv?.project_id ?? null)?.folder ?? workspaceDir();
  const p = typeof body.path === 'string' ? previewFor(body.path, cwd) : undefined;
  if (!p) throw new HttpError(404, 'Nothing to preview');
  // guests only see pages inside that chat's own folder
  if (isGuest(auth) && !normalize(p.root).toLowerCase().startsWith(normalize(cwd).toLowerCase())) throw new HttpError(403, 'Not part of this chat');
  return p;
}, { guest: true });
route('POST', '/api/pick-folder', async ({ auth }) => {
  ownerOnly(auth, 'pick folders');
  return { path: await pickFolder() };
});
route('GET', '/api/projects/:id', ({ params }) => getProject(params[0]) ?? notFound());
route('PUT', '/api/projects/:id', ({ params, body }) => updateProject(params[0], body) ?? notFound());
route('DELETE', '/api/projects/:id', ({ params }) => { dropProjectMembers(params[0]); return { ok: deleteProject(params[0]) }; });
route('POST', '/api/projects/:id/open', ({ params, auth }) => {
  ownerOnly(auth, 'open folders');
  const p = getProject(params[0]) ?? notFound();
  const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [p.folder], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
});

// ---------- chat ----------
route('GET', '/api/conversations', ({ url }) => {
  const p = url.searchParams.get('projectId');
  return listConversations({ projectId: p === null ? undefined : p === 'none' ? null : p });
});
route('GET', '/api/conversations/:id', ({ params, auth }) => {
  guardChat(auth, params[0]);
  const c = getConversation(params[0]);
  if (!c) throw new HttpError(404, 'Conversation not found');
  const cwd = getProject(c.project_id)?.folder ?? workspaceDir();
  const messages = getMessages(c.id).map((m) => {
    if (m.role !== 'assistant') return m;
    // files saved with the answer first, then anything the text points to (older answers)
    const seen = new Set<string>();
    const media = [...mediaForFiles(m.mediaFiles ?? []), ...mediaIn(m.content, cwd)].filter((x) => !seen.has(x.url.split('?')[0]) && !!seen.add(x.url.split('?')[0])).slice(0, 12);
    const { mediaFiles, ...rest } = m;
    // only pages that really exist get a Preview button (no "Nothing to preview" for a file that was never made)
    const pages = [...new Set(m.content.match(/(?:[A-Za-z]:[\\/])?[^\s`'"<>|*?()[\]]+\.html?\b/g) ?? [])].filter((p) => !!previewFor(p, cwd)).slice(0, 6);
    return { ...rest, media: media.map(({ file, ...x }) => x), pages };
  });
  return { ...c, messages, share: isGuest(auth) ? undefined : shareFor(c.id) ?? null };
}, { guest: true });
/** Regenerate / edit: drop this message and everything after it (the client then sends again). */
route('DELETE', '/api/conversations/:id/messages/from/:mid', ({ auth, params }) => {
  ownerOnly(auth, 'edit chats');
  if (!getConversation(params[0])) notFound();
  const mid = Number(params[1]);
  if (!Number.isFinite(mid)) throw new HttpError(400, 'Bad message id');
  run('DELETE FROM messages WHERE conversation_id = ? AND id >= ?', params[0], mid);
  emit('conversation.updated', { id: params[0] });
  return { ok: true };
});
route('POST', '/api/conversations/:id/messages/:mid/proposals/:n', ({ params, body }) => acceptProposal(params[0], Number(params[1]), Number(params[2]), body ?? {}));
route('POST', '/api/conversations/:id/messages/:mid/setup/:n', ({ auth, params, body }) => {
  ownerOnly(auth, 'set up projects');
  return applySetup(params[0], Number(params[1]), Number(params[2]), Array.isArray(body?.skip) ? body.skip.map(Number) : []);
});
route('POST', '/api/projects/:id/links', ({ auth, params, body }) => {
  ownerOnly(auth, 'change projects');
  const kind = ['folder', 'site', 'api', 'repo'].includes(body.kind) ? body.kind : null;
  if (!kind || !String(body.target ?? '').trim()) throw new HttpError(400, 'kind and target needed');
  return addLink(params[0], { kind, name: String(body.name ?? '').trim() || String(body.target).trim(), target: String(body.target).trim(), agentId: null });
});
route('DELETE', '/api/projects/:id/links/:lid', ({ auth, params }) => {
  ownerOnly(auth, 'change projects');
  return { ok: removeLink(params[0], params[1]) };
});
route('PUT', '/api/conversations/:id', ({ params, body }) => updateConversation(params[0], body) ?? notFound());
route('DELETE', '/api/conversations/:id', ({ params }) => {
  // a chat that is still answering is stopped first; a crew lead takes its helpers' chats with it
  const kids = dbAll<{ id: string }>(`SELECT id FROM conversations WHERE parent_id = ?`, params[0]).map((r) => r.id);
  for (const id of [params[0], ...kids]) { try { stopRun(id); } catch {} }
  for (const id of kids) deleteConversation(id);
  return { ok: deleteConversation(params[0]) };
});

route('POST', '/api/chat', async ({ res, body, auth }) => {
  const guest = isGuest(auth) ? auth : null;
  if (guest) {
    guardChat(auth, body.conversationId);
    if (!guest.share.guestsCanSend) throw new HttpError(403, 'The host only lets guests watch');
  }
  const cid = typeof body.cid === 'string' ? body.cid.slice(0, 40) : '';
  const member = guest?.member ?? null;
  const name = member ? member.name : typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'Guest';
  const sse0 = openSse(res);
  const abort = new AbortController();
  // everything the sender sees is mirrored to the others in that chat
  let convId: string | null = typeof body.conversationId === 'string' ? body.conversationId : null;
  const sse = (event: string, data: unknown) => {
    sse0(event, data);
    if (convId) runEvent(convId, event, data);
  };
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  // "3 agenci w Blenderze…" in a normal chat: this chat becomes the lead, the others start alongside
  const msg = String(body.message ?? '');
  // a team on the screen: asked for in this message, or earlier in this chat ("use computer use" after "make a team…")
  const earlier = typeof body.conversationId === 'string' ? getMessages(body.conversationId, 8).filter((m) => m.role === 'user').map((m) => m.content).slice(-3).join('\n') : '';
  const asked = (t: string) => wantsHands(t) || crewSize(t) > 1;
  const crewText = asked(msg) ? `${earlier}\n${msg}` : msg;
  const size = !guest && body.access === 'full' && !body.plan && process.platform === 'win32' && handsEnabled() && wantsHands(crewText) && (crewSize(msg) > 1 || /(agent|zesp|team|crew|computer|komputer|kursor|ekran|screen|na [żz]ywo|live)/i.test(msg)) ? Math.min(CREW.length, crewSize(crewText)) : 1;
  // the lead is the agent this chat is with (its name on the cursor), the helpers come from CREW
  const leadAgent = size > 1 ? getAgent(String(body.agentId ?? '') || (typeof body.conversationId === 'string' ? getConversation(body.conversationId)?.agent_id ?? '' : '')) : undefined;
  const lead = leadAgent ? { name: leadAgent.name, color: '#ffa94d' } : CREW[0];
  const crew = [lead, ...CREW.filter((c) => c.name.toLowerCase() !== lead.name.toLowerCase())].slice(0, size);
  let helpersStarted = false;
  const startHelpers = (leadConv: string) => {
    if (size < 2 || helpersStarted) return;
    helpersStarted = true;
    crew.slice(1).forEach((c, k) => {
      chat({ message: `${c.name}: ${msg}`, access: 'full', provider: body.provider, projectId: body.projectId ?? null, parentId: leadConv, hands: { ...c, brief: crewBrief(crew, k + 1) }, signal: abort.signal }).catch((e) => console.error('[alter] crew', c.name, (e as Error).message));
    });
  };
  try {
    const result = await chat({
      hands: size > 1 ? { ...crew[0], brief: crewBrief(crew, 0) } : undefined,
      conversationId: body.conversationId,
      // a guest can't move the chat, pick another AI, an agent or a higher access level: the host's settings apply
      projectId: member ? (typeof body.projectId === 'string' && member.projectIds.includes(body.projectId) ? body.projectId : (typeof body.conversationId === 'string' ? getConversation(body.conversationId)?.project_id : null) ?? member.projectIds[0] ?? null) : guest ? null : body.projectId ?? null,
      agentId: guest && !member ? null : body.agentId ?? null,
      model: !guest && typeof body.model === 'string' ? body.model : undefined,
      effort: !guest && typeof body.effort === 'string' ? body.effort : undefined,
      message: String(body.message ?? ''),
      attachments: Array.isArray(body.attachments) ? body.attachments.filter((x: unknown) => typeof x === 'string') : undefined,
      author: guest ? { name, color: member ? member.color : colorFor(cid || name) } : null,
      provider: guest && !member ? undefined : body.provider,
      access: guest && !member ? undefined : body.access,
      plan: !!body.plan,
      signal: abort.signal,
      onUserMessage: (m) => {
        convId = m.conversationId;
        const wc = getConversation(m.conversationId);
        if (wc?.project_id) wsLog(wc.project_id, member ? personActor(member) : ownerActor(), 'chat.prompt', `${wc.title}: ${m.content}`, m.conversationId);
        runStarted(m.conversationId, { cid, author: m.author, user: m.content, attachments: m.attachments, abort });
      },
      onMeta: (m) => {
        sse('meta', m);
        startHelpers(m.conversationId);
      },
      onDelta: (text) => sse('delta', { text }),
      onActivity: (text) => sse('activity', { text }),
      onPreview: (p) => sse('preview', p),
      onDraft: (d) => sse('draft', d),
      onProgress: (p) => sse('progress', p),
    });
    sse('done', result);
  } catch (err) {
    if (err instanceof LimitError) {
      const alternatives = (await providerStatuses()).filter((p) => p.connected && p.id !== 'demo' && p.id !== err.provider && !isLimited(p.id)).map((p) => ({ id: p.id, name: p.name }));
      sse('error', { message: err.limit.message, code: 'limit', provider: err.provider, until: err.limit.until, alternatives });
    } else sse('error', { message: (err as Error).message });
  }
  res.end();
  return SSE_HANDLED;
}, { guest: true });

// a message sent while the answer is still running: the AI takes it in mid-answer (Claude), otherwise the app queues it
route('POST', '/api/conversations/:id/followup', ({ auth, params, body }) => {
  const guest = isGuest(auth) ? auth : null;
  if (guest) {
    guardChat(auth, params[0]);
    if (!guest.share.guestsCanSend) throw new HttpError(403, 'The host only lets guests watch');
  }
  const text = String(body?.message ?? '').trim().slice(0, 8000);
  if (!text) throw new HttpError(400, 'Empty message');
  const name = guest?.member ? guest.member.name : typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'Guest';
  const author = guest ? { name, color: guest.member ? guest.member.color : colorFor(String(body?.cid ?? '') || name) } : null;
  const delivered = sendFollowUp(params[0], author ? `[${author.name}] ${text}` : text);
  if (delivered) runEvent(params[0], 'followup', { text, author, cid: typeof body?.cid === 'string' ? body.cid : '' });
  return { delivered };
}, { guest: true });

// ---------- studio (video, motion, 3D, graphics) ----------
const projectFolders = () => listProjects().map((p) => p.folder).filter(Boolean) as string[];
route('GET', '/api/studio', () => ({ ...studioStatus(), brand: publicBrand(), renders: listRenders(projectFolders()).map(({ file, ...x }) => x) }));
route('POST', '/api/studio/install', () => {
  ensureStudio().catch(() => {});
  return studioStatus();
});
route('PUT', '/api/studio/brand', ({ body }) => (setBrand(body ?? {}), publicBrand()));
// voice-over (Studio → Voice): VoiceStudio locally, or ElevenLabs
exportVoiceEngine();
voiceStudioStatus(true).catch(() => {});
setInterval(() => voiceStudioStatus(true).catch(() => {}), 60_000).unref();
route('GET', '/api/voiceover', () => voiceoverStatus());
route('PUT', '/api/voiceover', async ({ auth, body }) => { ownerOnly(auth, 'change the voice engine'); setVoiceEngine(String(body?.engine ?? 'auto')); return voiceoverStatus(); });
route('POST', '/api/voiceover/speak', async ({ body }) => {
  try { const r = await speak(body ?? {}); return { ...r, file: undefined, media: mediaFor(r.file) }; } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('POST', '/api/seo/audit', async ({ auth, body }) => {
  let url: string;
  try { url = normalizeUrl(String(body?.url ?? '')); } catch { throw new HttpError(400, 'Invalid address'); }
  // a local or private address reaches this computer's network: only the owner may audit those
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.)/i.test(new URL(url).hostname)) ownerOnly(auth, 'audit a local address');
  try { return await seoAudit(url); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('DELETE', '/api/studio/renders', ({ body }) => ({ ok: deleteRender(String(body?.url ?? ''), projectFolders()) }));

// ---------- attachments ----------
route('POST', '/api/uploads', async ({ req, url }) => {
  const name = url.searchParams.get('name') ?? 'file';
  try {
    return await saveUpload(req, name, (req.headers['content-type'] ?? '').split(';')[0] || undefined);
  } catch (e) {
    throw new HttpError((e as any).status ?? 400, (e as Error).message);
  }
}, { guest: true, raw: true });

// ---------- voice: local dictation (whisper.cpp) ----------
route('GET', '/api/voice', () => voiceStatus());
route('POST', '/api/voice/install', ({ auth }) => {
  ownerOnly(auth, 'install dictation');
  ensureVoice().catch((e) => console.warn('[alter] voice:', (e as Error).message));
  return voiceStatus();
});
route('POST', '/api/voice/transcribe', async ({ req, url, auth }) => {
  if (isGuest(auth)) throw new HttpError(403, 'Not allowed');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 25 * 1024 * 1024) throw new HttpError(413, 'Recording too long');
    chunks.push(c as Buffer);
  }
  return { text: await transcribe(Buffer.concat(chunks), url.searchParams.get('lang') ?? undefined) };
}, { raw: true });

// ---------- online sessions ----------
/** Share link for a chat (anyone with it can join that one chat). */
route('POST', '/api/conversations/:id/share', ({ params, body, auth }) => {
  if (isGuest(auth)) throw new HttpError(403, 'Only the host can share');
  if (!getConversation(params[0])) notFound();
  const s = startShare(params[0], body.guestsCanSend !== false);
  return { ...s, members: roomMembers(params[0]) };
});
route('DELETE', '/api/conversations/:id/share', ({ params, auth }) => {
  if (isGuest(auth)) throw new HttpError(403, 'Only the host can stop sharing');
  return { ok: stopShare(params[0]) };
});
// ---------- workspaces (a project with a standing team) ----------
route('GET', '/api/projects/:id/members', ({ params, auth }) => {
  ownerOnly(auth, 'manage the team');
  if (!getProject(params[0])) notFound();
  return membersOf(params[0]).map((m) => ({ ...publicMember(m), token: m.token }));
});
route('POST', '/api/projects/:id/members', ({ params, body, auth }) => {
  ownerOnly(auth, 'invite people');
  if (!getProject(params[0])) notFound();
  const m = inviteMember(params[0], String(body?.name ?? ''));
  emit('workspace.changed', { projectId: params[0] });
  return { ...publicMember(m), token: m.token };
});
route('DELETE', '/api/projects/:id/members/:mid', ({ params, auth }) => {
  ownerOnly(auth, 'manage the team');
  const ok = removeMember(params[0], params[1]);
  emit('workspace.changed', { projectId: params[0] });
  return { ok };
});
const wsActor = (auth: Auth) => (isGuest(auth) && auth.member ? personActor(auth.member) : ownerActor());
/** Writes one line of the workspace log and hands back what the route returns. */
const logged = <T>(auth: Auth, projectId: string, action: string, detail: (r: T) => string, out: T, ref?: (r: T) => string | null, merge = false): T => {
  wsLog(projectId, wsActor(auth), action, detail(out), ref?.(out) ?? null, merge);
  return out;
};
/** Who am I, which workspace, who else is in it (also the member's heartbeat). */
route('GET', '/api/ws/me', ({ auth, url }) => {
  const p = wsProject(auth, url);
  const me = isGuest(auth) ? auth.member! : null;
  const ownerSeen = auth === 'owner' || (!isGuest(auth) && !!auth);
  return {
    project: { id: p.id, name: p.name, color: p.color, icon: p.icon, description: p.description },
    me: me ? publicMember(me) : { id: 'owner', name: loadConfig().userName || 'Host', color: '#7c5cff', joined: true, online: true, lastSeen: null },
    owner: { name: loadConfig().userName || 'Host', online: ownerSeen || true },
    isOwner: !me,
    members: membersOf(p.id).map(publicMember),
    departments: departments(),
    workspaces: (me ? me.projectIds : listProjects().map((x) => x.id)).map((id) => getProject(id)).filter(Boolean).map((x) => ({ id: x!.id, name: x!.name, color: x!.color, icon: x!.icon })),
    rules: me ? undefined : rulesOf(p.id),
  };
}, { guest: true });
route('GET', '/api/ws/chats', ({ auth, url }) => {
  const p = wsProject(auth, url);
  return listConversations({ projectId: p.id }).filter((c: any) => !c.parent_id);
}, { guest: true });
route('POST', '/api/ws/chats', ({ auth, url, body }) => {
  const p = wsProject(auth, url);
  const id = randomUUID();
  const ts = new Date().toISOString();
  const title = String(body?.title ?? '').trim().slice(0, 60) || 'New chat';
  const agent = typeof body?.agentId === 'string' ? listAgents(p.id).find((x) => x.id === body.agentId) : undefined;
  run('INSERT INTO conversations (id, title, provider, project_id, access, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, agent ? agent.name : title, null, p.id, agent?.access ?? loadConfig().defaultAccess ?? 'chat', agent?.id ?? null, ts, ts);
  emit('conversation.updated', { id });
  wsLog(p.id, wsActor(auth), 'chat.new', agent ? agent.name : title, id);
  return getConversation(id);
}, { guest: true });
route('GET', '/api/ws/agents', ({ auth, url }) => {
  const p = wsProject(auth, url);
  const groups = listGroups();
  return listAgents(p.id).filter((a) => !a.monitor).map((a) => {
    const g = groups.find((x) => x.members.includes(a.id));
    return { ...a, running: isRunning(a.id), team: g ? { id: g.id, name: g.name, lead: g.lead === a.id } : null };
  });
}, { guest: true });
// everyone in the workspace manages its agents: open one (its tasks and answers), change it, give it a job, stop it, delete
/** Tells the agent who is writing to it (the owner of this ALTTER or a workspace member), so it addresses the right person. */
const whoNote = (name: string, owner: boolean) => `## Who is writing to you
${name} wrote this message in your chat (${owner ? 'the owner of this ALTTER, who decides' : 'a member of the workspace, invited by the owner'}). Address them by name; when the owner and a member disagree, the owner decides.`;
/** An agent's runs for its chat: pictures / videos the answers name are shown, files sent with a task come back as attachments. */
const agentRuns = (agentId: string, limit: number) => {
  const cwd = getProject(getAgent(agentId)?.projectId)?.folder ?? workspaceDir();
  return listRuns({ agentId, limit }).map(({ attachments, ...r }) => {
    const seen = new Set<string>();
    const text = r.output ?? '';
    const media = r.status === 'running' || !text ? [] : [...mediaForFiles(mediaNamedIn(text)), ...mediaIn(text, cwd)].filter((x) => !seen.has(x.url.split('?')[0]) && !!seen.add(x.url.split('?')[0])).slice(0, 24);
    let files: Attachment[] = [];
    try { files = attachments ? JSON.parse(attachments) : []; } catch {}
    return { ...r, media: media.map(({ file, ...x }) => x), attachments: files };
  });
};
/** Uploaded files named in a "run" request (ids from /api/uploads). */
const runFiles = (body: any) => (Array.isArray(body?.attachments) ? body.attachments : []).slice(0, 20).map((id: unknown) => getUpload(String(id))).filter((a: unknown): a is Attachment & { file: string } => !!a);
const taskOf = (body: any, files: unknown[]) => (typeof body?.task === 'string' && body.task.trim() ? body.task.trim().slice(0, 8000) : files.length ? '(see the attached files)' : undefined);

const wsAgent = (auth: Auth, url: URL, id: string) => {
  const a = getAgent(id);
  // a member may reach any agent of their workspaces (a team board in a chat doesn't know the ?project)
  if (a?.projectId && isGuest(auth) && auth.member?.projectIds.includes(a.projectId) && !url.searchParams.get('project')) {
    const p = getProject(a.projectId);
    if (p) return { p, a };
  }
  const p = wsProject(auth, url);
  if (!a || a.projectId !== p.id) throw new HttpError(404, 'Agent not found');
  return { p, a };
};
route('GET', '/api/ws/agents/:id/runs', ({ auth, url, params }) => {
  wsAgent(auth, url, params[0]);
  return agentRuns(params[0], 30);
}, { guest: true });
route('PUT', '/api/ws/agents/:id', ({ auth, url, params, body }) => {
  const { p, a } = wsAgent(auth, url, params[0]);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
  if (typeof body?.description === 'string') patch.description = body.description.slice(0, 200);
  if (typeof body?.instructions === 'string' && body.instructions.trim()) patch.instructions = body.instructions.trim().slice(0, 8000);
  if (auth === 'owner' && Array.isArray(body?.skills)) {
    const available = new Set(listSkills().map(s => s.id));
    if (body.skills.length > 100 || body.skills.some((id: unknown) => typeof id !== 'string' || !available.has(id))) throw new HttpError(400, 'Unknown skill. Refresh the skills list.');
    patch.skills = [...new Set(body.skills)];
  }
  const out = updateAgent(a.id, patch);
  emit('workspace.changed', { projectId: p.id });
  wsLog(p.id, wsActor(auth), 'agent.edit', out?.name ?? a.name, a.id);
  return out;
}, { guest: true });
route('POST', '/api/ws/agents/:id/run', ({ auth, url, params, body }) => {
  const { p, a } = wsAgent(auth, url, params[0]);
  if (isRunning(a.id)) throw new HttpError(409, `${a.name} is already working`);
  const files = runFiles(body);
  const task = taskOf(body, files);
  const who = wsActor(auth).name;
  const owner = !(isGuest(auth) && auth.member);
  runAgent(a.id, 'manual', whoNote(who, owner), task, undefined, who, files).catch(() => {});
  wsLog(p.id, wsActor(auth), 'agent.run', a.name, a.id);
  return { started: true };
}, { guest: true });
route('POST', '/api/ws/agents/:id/stop', ({ auth, url, params }) => {
  const { p, a } = wsAgent(auth, url, params[0]);
  wsLog(p.id, wsActor(auth), 'agent.stop', a.name, a.id);
  return { stopped: stopAgent(a.id) };
}, { guest: true });
route('DELETE', '/api/ws/agents/:id', ({ auth, url, params }) => {
  const { p, a } = wsAgent(auth, url, params[0]);
  const n = removeAgents([a.id]);
  emit('workspace.changed', { projectId: p.id });
  wsLog(p.id, wsActor(auth), 'agent.delete', a.name, a.id);
  return { deleted: n };
}, { guest: true });
/** ?team=<groupId> deletes one team; without it every agent of the workspace. */
route('DELETE', '/api/ws/agents', ({ auth, url }) => {
  const p = wsProject(auth, url);
  const team = url.searchParams.get('team');
  const g = team ? listGroups().find((x) => x.id === team) : undefined;
  if (team && (!g || !g.members.some((id) => getAgent(id)?.projectId === p.id))) throw new HttpError(404, 'Team not found');
  const n = g ? removeTeam(g.id) : removeProjectAgents(p.id);
  emit('workspace.changed', { projectId: p.id });
  wsLog(p.id, wsActor(auth), 'agent.delete', g ? `@${g.name}` : `${n}`, p.id);
  return { deleted: n };
}, { guest: true });
route('POST', '/api/ws/agents', ({ auth, url, body }) => {
  const p = wsProject(auth, url);
  const name = String(body?.name ?? '').trim().slice(0, 60);
  const instructions = String(body?.instructions ?? '').trim().slice(0, 8000);
  if (!name || !instructions) throw new HttpError(400, 'Name and instructions are needed');
  const a = createAgent({ name, instructions, description: String(body?.description ?? '').slice(0, 200), projectId: p.id, access: 'full', learns: true });
  emit('workspace.changed', { projectId: p.id });
  wsLog(p.id, wsActor(auth), 'agent.new', name, a.id);
  return a;
}, { guest: true });

// tasks
route('GET', '/api/ws/tasks', ({ auth, url }) => listTasks(wsProject(auth, url).id), { guest: true });
route('POST', '/api/ws/tasks', ({ auth, url, body }) => { const p = wsProject(auth, url); return logged(auth, p.id, 'task.new', (t) => t.title, createTask(p.id, body ?? {}, wsActor(auth)), (t) => t.id); }, { guest: true });
const wsTask = (auth: Auth, url: URL, id: string) => {
  const p = wsProject(auth, url);
  const t = getTask(id);
  if (!t || t.project_id !== p.id) throw new HttpError(404, 'Task not found');
  return t;
};
route('PUT', '/api/ws/tasks/:id', ({ auth, url, params, body }) => {
  const before = wsTask(auth, url, params[0]);
  const out = updateTask(params[0], body ?? {}, wsActor(auth));
  const what = body?.status && body.status !== before.status ? `${before.status} → ${body.status}` : Object.keys(body ?? {}).filter((k) => k !== 'position').join(', ');
  if (out && what) wsLog(before.project_id, wsActor(auth), body?.status && body.status !== before.status ? 'task.move' : 'task.edit', `${out.title} · ${what}`, out.id, !body?.status);
  return out;
}, { guest: true });
route('DELETE', '/api/ws/tasks/:id', ({ auth, url, params }) => { const t = wsTask(auth, url, params[0]); return logged(auth, t.project_id, 'task.delete', () => t.title, { ok: deleteTask(params[0]) }); }, { guest: true });
route('GET', '/api/ws/tasks/:id/comments', ({ auth, url, params }) => (wsTask(auth, url, params[0]), listComments(params[0])), { guest: true });
route('POST', '/api/ws/tasks/:id/comments', ({ auth, url, params, body }) => { const t = wsTask(auth, url, params[0]); return logged(auth, t.project_id, 'task.comment', () => `${t.title}: ${String(body?.body ?? '')}`, addComment(params[0], wsActor(auth), String(body?.body ?? '')) ?? notFound(), () => t.id); }, { guest: true });
route('POST', '/api/ws/plan', async ({ auth, url, body }) => {
  const goal = String(body?.goal ?? '').trim();
  if (goal.length < 4) throw new HttpError(400, 'Describe the goal');
  try { const p = wsProject(auth, url); return logged(auth, p.id, 'task.plan', (l) => `${goal} (${l.length})`, await planTasks(p.id, goal, wsActor(auth))); } catch (e) { throw new HttpError(502, (e as Error).message); }
}, { guest: true });
// documents & reports
route('GET', '/api/ws/docs', ({ auth, url }) => listDocs(wsProject(auth, url).id), { guest: true });
const wsDoc = (auth: Auth, url: URL, id: string) => {
  const d = getDoc(id);
  if (!d || d.project_id !== wsProject(auth, url).id) throw new HttpError(404, 'Document not found');
  return d;
};
route('GET', '/api/ws/docs/:id', ({ auth, url, params }) => wsDoc(auth, url, params[0]), { guest: true });
route('POST', '/api/ws/docs', ({ auth, url, body }) => { const p = wsProject(auth, url); return logged(auth, p.id, 'doc.new', (d) => d.title, saveDoc(p.id, { title: body?.title, body: body?.body, kind: body?.kind }, wsActor(auth)), (d) => d.id); }, { guest: true });
route('PUT', '/api/ws/docs/:id', ({ auth, url, params, body }) => { const d0 = wsDoc(auth, url, params[0]); return logged(auth, d0.project_id, 'doc.edit', (d) => d.title, saveDoc(d0.project_id, { id: params[0], title: body?.title, body: body?.body }, wsActor(auth)), (d) => d.id, true); }, { guest: true });
route('DELETE', '/api/ws/docs/:id', ({ auth, url, params }) => { const d = wsDoc(auth, url, params[0]); return logged(auth, d.project_id, 'doc.delete', () => d.title, { ok: deleteDoc(params[0]) }); }, { guest: true });
route('POST', '/api/ws/report', async ({ auth, url, body }) => {
  try { const p = wsProject(auth, url); return logged(auth, p.id, 'doc.report', (d) => d.title, await makeReport(p.id, Math.min(90, Math.max(1, Number(body?.days) || 7)), wsActor(auth)), (d) => d.id); } catch (e) { throw new HttpError(502, (e as Error).message); }
}, { guest: true });
// calendar: deadlines (+ the owner's own calendars, only for the owner)
route('GET', '/api/ws/calendar', async ({ auth, url }) => {
  const p = wsProject(auth, url);
  const tasks = listTasks(p.id).filter((t) => t.due);
  const events = isGuest(auth) ? [] : (await upcoming(Date.now() - 7 * 86400_000, Date.now() + 60 * 86400_000).catch(() => ({ events: [] as any[] }))).events;
  return { tasks, events };
}, { guest: true });
/** Subscribable feed (Google / Outlook / Apple): the key is in the URL because calendar apps can't send headers. */
route('GET', '/api/ws/feed.ics', ({ url, res }) => {
  const k = url.searchParams.get('key') ?? '';
  const person = k.startsWith('ws:') ? memberByToken(k.slice(3)) : undefined;
  const owner = !person && authenticate(k) === 'owner';
  if (!person && !owner) throw new HttpError(401, 'Unknown key');
  const want = url.searchParams.get('project');
  const ids = person ? person.projectIds : listProjects().map((x) => x.id);
  res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' });
  res.end(tasksIcs(want && ids.includes(want) ? [want] : ids));
  return SSE_HANDLED;
}, true);
// automations
route('PUT', '/api/ws/rules', ({ auth, url, body }) => {
  ownerOnly(auth, 'change automations');
  const p = wsProject(auth, url);
  return logged(auth, p.id, 'rules.edit', () => Object.entries(body ?? {}).map(([k, v]) => `${k}: ${v ? 'on' : 'off'}`).join(', '), setRules(p.id, body ?? {}));
});
// the workspace log: who did what and when
route('GET', '/api/ws/log', ({ auth, url }) => {
  const p = wsProject(auth, url);
  return listWsLog(p.id, { before: Number(url.searchParams.get('before')) || undefined, who: url.searchParams.get('who') ?? undefined, action: url.searchParams.get('action') ?? undefined, limit: Number(url.searchParams.get('limit')) || 200 });
}, { guest: true });
// the whiteboard: shapes, text and drawing, live for everyone in the workspace
route('GET', '/api/ws/board', ({ auth, url }) => getWsBoard(wsProject(auth, url).id), { guest: true });
route('POST', '/api/ws/board', ({ auth, url, body }) => {
  const p = wsProject(auth, url);
  const out = saveBoard(p.id, body ?? {}, String(body?.cid ?? ''), wsActor(auth).name);
  if (out.changed) wsLog(p.id, wsActor(auth), 'board.edit', out.summary, null, true);
  return { rev: out.rev };
}, { guest: true });

// the company: departments and people (owner)
route('GET', '/api/company', ({ auth }) => {
  ownerOnly(auth, 'manage the company');
  return {
    name: loadConfig().userName,
    departments: departments(),
    people: people().map((p) => ({ ...publicPerson(p), token: p.token })),
    workspaces: listProjects().map((p) => ({ id: p.id, name: p.name, color: p.color, icon: p.icon, ...workspaceStats(p.id) })),
  };
});
route('POST', '/api/company/departments', ({ auth, body }) => (ownerOnly(auth, 'manage the company'), addDepartment(String(body?.name ?? ''))));
route('PUT', '/api/company/departments/:id', ({ auth, params, body }) => (ownerOnly(auth, 'manage the company'), updateDepartment(params[0], body ?? {}) ?? notFound()));
route('DELETE', '/api/company/departments/:id', ({ auth, params }) => (ownerOnly(auth, 'manage the company'), { ok: removeDepartment(params[0]) }));
route('POST', '/api/company/people', ({ auth, body }) => { ownerOnly(auth, 'manage the company'); const p = addPerson(body ?? {}); return { ...publicPerson(p), token: p.token }; });
route('PUT', '/api/company/people/:id', ({ auth, params, body }) => { ownerOnly(auth, 'manage the company'); const p = updatePerson(params[0], body ?? {}) ?? notFound(); return { ...publicPerson(p), token: p.token }; });
route('DELETE', '/api/company/people/:id', ({ auth, params }) => (ownerOnly(auth, 'manage the company'), { ok: removePerson(params[0]) }));

// invoices, quotes, orders
route('GET', '/api/ws/sales', ({ auth, url }) => { const p = wsProject(auth, url); return { docs: listSales(p.id), seller: sellerProfile(), stats: salesStats(p.id) }; }, { guest: true });
const wsSale = (auth: Auth, url: URL, id: string) => {
  const d = getSale(id);
  if (!d || d.project_id !== wsProject(auth, url).id) throw new HttpError(404, 'Document not found');
  return d;
};
route('POST', '/api/ws/sales', ({ auth, url, body }) => { const b = { ...(body ?? {}) }; delete b.id; const p = wsProject(auth, url); return logged(auth, p.id, 'sale.new', (d) => `${d.kind} ${d.number} · ${d.client?.name ?? ''} · ${d.gross} ${d.currency}`, saveSale(p.id, b, wsActor(auth)), (d) => d.id); }, { guest: true });
route('PUT', '/api/ws/sales/:id', ({ auth, url, params, body }) => { const s0 = wsSale(auth, url, params[0]); return logged(auth, s0.project_id, 'sale.edit', (d) => `${d.kind} ${d.number} · ${d.client?.name ?? ''} · ${d.gross} ${d.currency}`, saveSale(s0.project_id, { ...(body ?? {}), id: params[0] }, wsActor(auth)), (d) => d.id, true); }, { guest: true });
route('DELETE', '/api/ws/sales/:id', ({ auth, url, params }) => { const d = wsSale(auth, url, params[0]); return logged(auth, d.project_id, 'sale.delete', () => `${d.kind} ${d.number}`, { ok: deleteSale(params[0]) }); }, { guest: true });
route('POST', '/api/ws/sales/:id/convert', ({ auth, url, params, body }) => (wsSale(auth, url, params[0]), convertSale(params[0], body?.kind === 'order' ? 'order' : 'invoice', wsActor(auth)) ?? notFound()), { guest: true });
route('POST', '/api/ws/sales/draft', async ({ auth, url, body }) => {
  const text = String(body?.text ?? '').trim();
  if (text.length < 4) throw new HttpError(400, 'Describe the document');
  try { return await draftSale(wsProject(auth, url).id, text, KINDS.includes(body?.kind) ? body.kind : 'invoice', wsActor(auth)); } catch (e) { throw new HttpError(502, (e as Error).message); }
}, { guest: true });
route('PUT', '/api/company/profile', ({ auth, body }) => (ownerOnly(auth, 'manage the company'), setSellerProfile(body ?? {})));

/** What a share link opens (guests call this before they have a name). */
route('GET', '/api/share/:token', ({ params }) => {
  const s = shareByToken(params[0]);
  const c = s && getConversation(s.conversationId);
  if (!s || !c) throw new HttpError(404, 'This link has expired');
  return { conversationId: c.id, title: c.title, host: loadConfig().userName || 'ALTTER', guestsCanSend: s.guestsCanSend, members: roomMembers(c.id) };
}, true);

/** Presence stream for one chat: who is here, cursors, typing, picks, and the AI answer as it is written. */
route('GET', '/api/room/:id', ({ res, params, url, auth }) => {
  guardChat(auth, params[0]);
  if (!getConversation(params[0])) notFound();
  const cid = (url.searchParams.get('cid') ?? '').slice(0, 40) || Math.random().toString(36).slice(2);
  const guest = isGuest(auth);
  const fallback = guest ? ((auth as any).member?.name ?? 'Guest') : loadConfig().userName || (auth === 'owner' ? 'Host' : (auth as any)?.name ?? 'Device');
  const name = (auth as any)?.member?.name ?? ((url.searchParams.get('name') ?? '').trim().slice(0, 40) || fallback);
  const sse = openSse(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  const leave = joinRoom(params[0], { cid, name, color: colorFor(cid), guest, send: sse, close: () => res.end() });
  res.on('close', () => {
    clearInterval(ping);
    leave();
  });
  return SSE_HANDLED;
}, { guest: true });
route('POST', '/api/room/:id/state', ({ params, body, auth }) => {
  guardChat(auth, params[0]);
  setPresence(params[0], String(body.cid ?? ''), body ?? {});
  return { ok: true };
}, { guest: true });
/** Presence for a whole workspace: everyone's pointer on whichever workspace screen they are on. */
route('GET', '/api/wsroom', ({ res, url, auth }) => {
  const p = wsProject(auth, url);
  const cid = (url.searchParams.get('cid') ?? '').slice(0, 40) || Math.random().toString(36).slice(2);
  const guest = isGuest(auth);
  const name = (auth as any)?.member?.name ?? (loadConfig().userName || 'Host');
  const sse = openSse(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  const leave = joinRoom('ws:' + p.id, { cid, name, color: colorFor(cid), guest, send: sse, close: () => res.end() });
  res.on('close', () => {
    clearInterval(ping);
    leave();
  });
  return SSE_HANDLED;
}, { guest: true });
route('POST', '/api/wsroom/state', ({ url, body, auth }) => {
  const p = wsProject(auth, url);
  setPresence('ws:' + p.id, String(body?.cid ?? ''), { cursor: body?.cursor ?? null });
  return { ok: true };
}, { guest: true });
route('POST', '/api/room/:id/stop', ({ params, auth }) => {
  guardChat(auth, params[0]);
  return { ok: stopRun(params[0]) };
}, { guest: true });

/** Internet link through a Cloudflare quick tunnel (needs cloudflared installed). */
route('GET', '/api/tunnel', () => tunnelStatus());
route('POST', '/api/tunnel', async ({ auth }) => {
  ownerOnly(auth, 'open an internet link');
  return startTunnel(listeningPort);
});
route('GET', '/api/remote', ({ auth }) => {
  ownerOnly(auth, 'see the internet settings');
  return { ...publicRemoteSettings(), status: tunnelStatus() };
});
route('PUT', '/api/remote', ({ auth, body }) => {
  ownerOnly(auth, 'change the internet settings');
  const patch: Record<string, unknown> = {};
  for (const k of ['mode', 'auto', 'relayUrl', 'relayKey', 'cfToken', 'cfHostname']) if (body[k] !== undefined && body[k] !== '') patch[k] = body[k];
  if (patch.mode && !['quick', 'relay', 'cloudflare'].includes(patch.mode as string)) throw new HttpError(400, 'Unknown mode');
  const before = publicRemoteSettings();
  setRemoteSettings(patch);
  // a changed address or key takes effect right away
  if (tunnelStatus().running && (patch.mode !== before.mode || patch.relayUrl || patch.relayKey || patch.cfToken || patch.cfHostname)) stopTunnel();
  return { ...publicRemoteSettings(), status: tunnelStatus() };
});
/** Improve prompt: rough draft → clear brief (fast model). */
// ---------- media: AI images + videos ----------
route('GET', '/api/media', () => listMedia());
route('GET', '/api/media/options', () => mediaOptions());
route('PUT', '/api/media/keys', ({ body, auth }) => {
  ownerOnly(auth, 'change API keys');
  return setMediaKeys(body ?? {});
});
route('POST', '/api/media', ({ body }) => {
  try {
    return mediaView(startMedia({ kind: body.kind, prompt: body.prompt, provider: body.provider || undefined, model: body.model || undefined, aspect: body.aspect, conversationId: body.conversationId ?? null }));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('DELETE', '/api/media/:id', ({ params }) => ({ ok: deleteMedia(params[0]) }));
route('GET', '/api/media/local', () => localStatus());
route('POST', '/api/media/local/install', ({ body, auth }) => {
  ownerOnly(auth, 'download local AI models');
  try { return installLocal(String(body?.model ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('DELETE', '/api/media/local/:model', ({ params, auth }) => {
  ownerOnly(auth, 'remove local AI models');
  return removeLocal(params[0]);
});
route('GET', '/api/media/characters', () => listCharacters());
route('PUT', '/api/media/characters', ({ body }) => saveCharacters(body?.characters ?? []));

// ---------- prompt library ----------
route('GET', '/api/prompts', () => listPrompts());
route('POST', '/api/prompts', ({ body }) => savePrompt(body ?? {}));
route('PUT', '/api/prompts/:id', ({ params, body }) => savePrompt({ ...(body ?? {}), id: params[0] }));
route('DELETE', '/api/prompts/:id', ({ params }) => ({ ok: deletePrompt(params[0]) }));
route('POST', '/api/prompts/:id/use', ({ params }) => usePrompt(params[0]));

// ---------- usage across the AI apps on this computer (their own local logs) ----------
route('GET', '/api/usage/local', ({ url }) => localUsage(Number(url.searchParams.get('days') ?? 30)));

route('POST', '/api/prompt/enhance', async ({ body }) => ({ text: await enhancePrompt(String(body.text ?? ''), String(body.kind ?? 'general')) }));

// ---------- hands: the AI on your screen ----------
/** Briefing for agent i of a crew working on the same screen at once. */
function crewBrief(crew: { name: string }[], i: number): string {
  const n = crew.length;
  if (n === 1) return '';
  const names = crew.map((c) => c.name).join(', ');
  const c = crew[i];
  return `## You are ${c.name}, one of ${n} agents (${names}) working on this computer at the same time.
${i === 0 ? `You lead. Right away (before any other work) call team_plan: one clear part for each of ${names}, all parts of the SAME result — e.g. in 3D one builds the body, another the wheels/lights in the same shared Blender scene; on a website one builds the page while the 3D part is made. Then do your own part, answer your teammates (team_note to: "Name"), and use wait_team while they work. Do not finish your answer before every teammate posted status "done". Then review like an art director: look at the whole result (blender_look from several angles, the page with show_page + screenshot); if anything looks amateurish (lumps, holes, wrong proportions, parts not fitting, a broken page) send concrete fixes to the right teammate with team_note(to) and wait_team for them — up to 2 review rounds. Only then sum it up for the user.` : `The lead is ${crew[0].name}. Read team_board (use wait_team up to ~30 s if the plan is not there yet), then do YOUR part only. Work in the shared windows (the one Blender, the one browser page) — never open your own copy. team_note(status: "working") when you start, ask teammates with team_note(to: "Name") when you need something from them, and team_note(status: "done", text: what you made and where) when finished.`}
Everything you do must be visible on the screen — the user is watching the team work.`;
}
const CREW = [{ name: 'Nova', color: '#7c5cff' }, { name: 'Bolt', color: '#2ee6ff' }, { name: 'Iris', color: '#ff5fa2' }, { name: 'Echo', color: '#3ddc97' }];
route('GET', '/api/hands/board/:crew', ({ params }) => (hasBoard(params[0]) ? getBoard(params[0]) : null));
route('GET', '/api/hands', () => ({ enabled: handsEnabled(), supported: process.platform === 'win32', agents: handsSessions() }));
route('PUT', '/api/hands', ({ auth, body }) => {
  ownerOnly(auth, 'let the AI use the mouse');
  setHandsEnabled(!!body.enabled);
  if (!body.enabled) stopAllHands();
  return { enabled: handsEnabled() };
});
route('POST', '/api/hands/stop', ({ auth }) => {
  ownerOnly(auth, 'stop the agents');
  stopAllHands();
  return { ok: true };
});
/** A crew: several agents on one task at the same time, each with its own cursor, coordinating through a shared board. */
route('POST', '/api/hands/crew', async ({ auth, body }) => {
  ownerOnly(auth, 'start agents on the screen');
  if (!handsEnabled()) throw new HttpError(400, 'Turn on “agents can use the mouse” first');
  const task = String(body.task ?? '').trim();
  if (!task) throw new HttpError(400, 'Describe the task');
  const n = Math.max(1, Math.min(CREW.length, Number(body.size) || 1));
  const crew = CREW.slice(0, n);
  const ids = await Promise.all(crew.map((c, i) => new Promise<string>((resolveId) => {
    const brief = crewBrief(crew, i);
    chat({ message: n === 1 ? task : `${c.name}: ${task}`, access: 'full', provider: body.provider, hands: { ...c, brief }, onMeta: (m) => resolveId(m.conversationId) }).catch((e) => {
      console.error('[alter] crew', c.name, (e as Error).message);
      resolveId('');
    });
  })));
  return { conversations: ids.filter(Boolean), crew };
});

/** The PowerShell script that turns a Windows VPS into this ALTTER's relay (address and key filled in). */
route('POST', '/api/remote/vps', ({ auth, body }) => {
  ownerOnly(auth, 'set up a server');
  const domain = domainFor(String(body.host ?? ''));
  if (!domain || !/^[a-z0-9.-]+$/.test(domain)) throw new HttpError(400, 'Enter the server IP or domain');
  ensureRelayKey();
  setRemoteSettings({ mode: 'relay', relayUrl: 'https://' + domain });
  return { domain, url: 'https://' + domain, script: vpsSetupScript(domain) };
});
/** A whole ALTTER for a Windows VPS, running 24/7 (one PowerShell file). */
route('GET', '/api/server/package', () => ({ ready: serverPackageReady() }));
route('POST', '/api/server/package', ({ auth, body }) => {
  ownerOnly(auth, 'prepare a server');
  const host = String(body.host ?? '').trim();
  if (host && !/^[a-z0-9.:/-]+$/i.test(host)) throw new HttpError(400, 'Enter the server IP or domain');
  const r = serverSetupScript(host);
  return { domain: r.domain, url: r.domain ? 'https://' + r.domain : '', script: r.script };
});
// ---------- updates (newest release on GitHub) ----------
route('GET', '/api/update', async ({ url }) => (url.searchParams.has('check') || !updateInfo().checkedAt ? checkUpdate() : updateInfo()));
// "Report a problem": preview what is sent, send it to the repair server, list my reports and their state
route('POST', '/api/report/preview', async ({ auth, body }) => {
  ownerOnly(auth, 'report problems');
  const { images, ...rest } = buildReport((body ?? {}) as any);
  // the preview shows what is sent; the screenshots are already visible as thumbnails, so only count them here
  return { ...rest, images: images.length ? `${images.length} × screenshot (${Math.round(images.reduce((n, x) => n + x.length * 0.75, 0) / 1024)} KB)` : [] };
});
route('POST', '/api/report', async ({ auth, body }) => {
  ownerOnly(auth, 'report problems');
  try {
    return await sendReport((body ?? {}) as any);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('GET', '/api/reports', async ({ auth }) => {
  ownerOnly(auth, 'see reports');
  return { reports: await myReports() };
});
route('POST', '/api/reports/reply', async ({ auth, body }) => {
  ownerOnly(auth, 'answer reports');
  try {
    return await replyReport(String(body?.id ?? ''), String(body?.text ?? ''), body?.images);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('POST', '/api/update/install', async ({ auth }) => {
  ownerOnly(auth, 'install updates');
  try {
    await installUpdate();
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return { ok: true };
});
// ---------- calendars (ICS links: Google, Outlook, iCloud…) ----------
route('GET', '/api/calendars', () => ({ calendars: publicCalendars() }));
route('POST', '/api/calendars', async ({ auth, body }) => {
  ownerOnly(auth, 'add calendars');
  try {
    return await addCalendar(String(body.name ?? ''), String(body.url ?? ''));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('DELETE', '/api/calendars/:id', ({ auth, params }) => {
  ownerOnly(auth, 'remove calendars');
  removeCalendar(params[0]);
  return { ok: true };
});
route('GET', '/api/calendars/events', async ({ url }) => {
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get('days') ?? 7)));
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return upcoming(from, from + days * 86400_000);
});
// ---------- plugins (MCP servers) ----------
route('GET', '/api/plugins', () => ({ installed: publicPlugins(), catalog: CATALOG }));
route('GET', '/api/plugins/status', async ({ url }) => ({ status: await pluginStatus(url.searchParams.get('fresh') === '1') }));
route('POST', '/api/plugins', async ({ auth, body }) => {
  ownerOnly(auth, 'install plugins');
  try {
    if (body.catalogId) return { plugins: [await installFromCatalog(String(body.catalogId), (body.keys ?? {}) as Record<string, string>)] };
    return { plugins: await installCustom({ title: body.title ? String(body.title) : undefined, source: String(body.source ?? ''), oauth: !!body.oauth }) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
route('PUT', '/api/plugins/:id', ({ auth, params, body }) => {
  ownerOnly(auth, 'change plugins');
  setPluginEnabled(params[0], !!body.enabled);
  return { ok: true };
});
route('DELETE', '/api/plugins/:id', async ({ auth, params }) => {
  ownerOnly(auth, 'remove plugins');
  await removePlugin(params[0]);
  return { ok: true };
});
/** Sign-in plugins (Higgsfield, Notion…): opens Claude Code in a window where /mcp signs in. */
route('POST', '/api/plugins/:id/login', async ({ auth, params }) => {
  ownerOnly(auth, 'sign in to plugins');
  if (process.platform !== 'win32') throw new HttpError(400, 'Run "claude" in a terminal and type /mcp');
  const p = publicPlugins().find((x) => x.id === params[0]);
  if (!p) notFound();
  const c = CATALOG.find((x) => x.id === p!.catalogId);
  if (c?.login && c.command) {
    // local server with its own device-code sign-in (Microsoft 365): a window shows the link + code
    const env = { ...process.env, ...(c.env ?? {}) };
    const cmd = [c.command, ...(c.args ?? []), ...c.login].join(' ');
    spawn('cmd.exe', ['/c', 'start', '"ALTTER - sign in"', 'cmd', '/k', `echo. & echo   Open the link below, enter the code and sign in to ${c.title}. Close this window when it says you are signed in. & echo. & ${cmd}`], { detached: true, stdio: 'ignore', windowsHide: false, env }).unref();
    return { ok: true, device: true };
  }
  forgetPluginStatus();
  // Codex only: it has a direct sign-in command
  if (!(await detectCli('claude')).installed && (await detectCli('codex')).installed) {
    spawn('cmd.exe', ['/c', 'start', '"ALTTER - sign in"', 'cmd', '/k', `codex mcp login ${p!.name}`], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return { ok: true };
  }
  spawn('cmd.exe', ['/c', 'start', '"ALTTER - sign in"', 'cmd', '/k', `echo. & echo   Type /mcp, choose "${p!.name}" and pick Authenticate. A browser opens to sign in. & echo. & claude`], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return { ok: true };
});
// ---------- self-running teams ----------
route('POST', '/api/conversations/:id/messages/:mid/team/:n', ({ auth, params, body }) => {
  // a workspace member may create the team in a chat of their workspace
  const pid = getConversation(params[0])?.project_id ?? null;
  if (!(isGuest(auth) && auth.member && pid && auth.member.projectIds.includes(pid))) ownerOnly(auth, 'create teams');
  try {
    return applyTeam(params[0], Number(params[1]), Number(params[2]), Array.isArray(body.skip) ? body.skip.map(Number) : []);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}, { guest: true });
/** Start a team's job again (a stopped board's "Start again"); workspace members may do it in their workspace. */
route('POST', '/api/squads/start', ({ auth, body }) => {
  const groupId = String(body?.groupId ?? '');
  const conversationId = String(body?.conversationId ?? '');
  const goal = String(body?.goal ?? '').trim().slice(0, 4000);
  const g = listGroups().find((x) => x.id === groupId);
  const pid = g ? getAgent(g.members[0])?.projectId ?? null : null;
  if (!(isGuest(auth) && auth.member && pid && auth.member.projectIds.includes(pid))) ownerOnly(auth, 'start teams');
  if (!g || !goal || !getConversation(conversationId)) throw new HttpError(400, 'Team, chat and goal are needed');
  try { return startSquad(conversationId, g.id, goal); } catch (e) { throw new HttpError(409, (e as Error).message); }
}, { guest: true });
route('POST', '/api/squads/:runId/stop', ({ auth, params }) => {
  // workspace members may stop a team working in their workspace
  const pid = squadProject(params[0]);
  if (!(isGuest(auth) && auth.member && pid && auth.member.projectIds.includes(pid))) ownerOnly(auth, 'stop teams');
  return { stopped: stopSquad(params[0]) };
}, { guest: true });
route('DELETE', '/api/tunnel', ({ auth }) => {
  ownerOnly(auth, 'close the internet link');
  stopTunnel();
  return { ok: true };
});

// ---------- memory ----------
route('GET', '/api/memories', ({ url }) =>
  listMemories({ q: url.searchParams.get('q') ?? undefined, kind: url.searchParams.get('kind') ?? undefined, projectId: url.searchParams.get('projectId') ?? undefined }),
);
route('POST', '/api/memories', ({ body }) => addMemory({ ...body, source: 'manual' }));
/** Memory from ChatGPT / Claude / Gemini: their answer pasted in, or their data export. */
route('POST', '/api/memories/import', async ({ auth, body }) => {
  ownerOnly(auth, 'import memories');
  try { return await importMemories(body ?? {}); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('PUT', '/api/memories/:id', ({ params, body }) => updateMemory(params[0], body) ?? notFound());
route('DELETE', '/api/memories/:id', ({ params }) => ({ ok: deleteMemory(params[0]) }));

// ---------- agents & automations ----------
route('GET', '/api/agents', ({ url }) => listAgents(url.searchParams.get('projectId') ?? undefined).map((a) => ({ ...a, running: isRunning(a.id) })));
route('GET', '/api/agents/templates', () => TEMPLATES);
route('POST', '/api/agents', ({ body }) => {
  const { templateId, ...rest } = body ?? {};
  return templateId ? createFromTemplate(templateId, { ...rest, templateId }) : createAgent(rest);
});
route('GET', '/api/agents/:id', ({ params }) => getAgent(params[0]) ?? notFound());
route('PUT', '/api/agents/:id', ({ params, body }) => updateAgent(params[0], body) ?? notFound());
route('DELETE', '/api/agents/:id', ({ params }) => ({ ok: removeAgents([params[0]]) > 0 }));
/** Delete every agent (automations / monitors stay). */
route('DELETE', '/api/agents', ({ auth }) => {
  ownerOnly(auth, 'delete all agents');
  return { deleted: removeAgents(listAgents().filter((a) => !a.monitor).map((a) => a.id)) };
});
route('POST', '/api/agents/:id/run', ({ params, body }) => {
  const a = getAgent(params[0]);
  if (!a) notFound();
  if (isRunning(params[0])) throw new HttpError(409, `${a!.name} is already working`);
  // a task written in the agent's chat ("now also do X"); without one it does its standing job
  const files = runFiles(body);
  const task = taskOf(body, files);
  const who = ownerActor().name;
  runAgent(params[0], 'manual', whoNote(who, true), task, undefined, who, files).catch(() => {});
  return { started: true };
});
route('POST', '/api/agents/:id/stop', ({ params }) => ({ stopped: stopAgent(params[0]) }));
route('POST', '/api/agents/:id/check', ({ params }) => checkMonitor(params[0]));
route('GET', '/api/agent-status', () => agentStatuses());
route('GET', '/api/groups', () => listGroups());
route('POST', '/api/groups', ({ auth, body }) => {
  ownerOnly(auth, 'change agent groups');
  return saveGroup(body);
});
route('DELETE', '/api/groups/:id', ({ auth, params }) => {
  ownerOnly(auth, 'change agent groups');
  return { ok: deleteGroup(params[0]) };
});
route('POST', '/api/monitor/test', ({ body }) => runCheck({ type: body.type, target: String(body.target ?? '') }));
route('GET', '/api/runs', ({ url }) => {
  const agentId = url.searchParams.get('agentId');
  return agentId ? agentRuns(agentId, 60) : listRuns({ projectId: url.searchParams.get('projectId') ?? undefined });
});
route('GET', '/api/skills', () => listSkills().map(({ body, ...s }) => ({ ...s, preview: body.slice(0, 200) })));
route('GET', '/api/skills/github/search', async ({ auth, url }) => {
  ownerOnly(auth, 'search GitHub skills');
  try { return await searchGitHubSkills(url.searchParams.get('q') ?? '', (url.searchParams.get('sort') ?? 'best') as 'best', Number(url.searchParams.get('page') ?? 1)); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('POST', '/api/skills/github/preview', async ({ auth, body }) => {
  ownerOnly(auth, 'preview GitHub skills');
  try { return await previewGitHubSkills(String(body.source ?? ''), body.path ? String(body.path) : undefined, body.sha ? String(body.sha) : undefined); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('POST', '/api/skills/github/install', async ({ auth, body }) => {
  ownerOnly(auth, 'install GitHub skills');
  try { return await installGitHubSkill(String(body.source ?? ''), String(body.path ?? ''), String(body.sha ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
});
route('GET', '/api/activity', () => recentActivity(72, 200).reverse());

// ---------- devices / pairing ----------
route('POST', '/api/pair/start', ({ auth }) => {
  ownerOnly(auth, 'start pairing');
  return startPairing([publicUrl()]);
});
route('POST', '/api/pair/claim', ({ body }) => {
  try {
    const d = claimPairing(String(body.code ?? ''), String(body.name ?? 'Phone'));
    return { token: d.token, device: { id: d.id, name: d.name } };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}, true);
route('GET', '/api/devices', () => loadConfig().devices.map(({ token, ...d }) => d));
route('DELETE', '/api/devices/:id', ({ auth, params }) => {
  ownerOnly(auth, 'revoke devices');
  removePushForDevice(params[0]);
  return { ok: revokeDevice(params[0]) };
});

// ---------- phone notifications (Web Push) ----------
const deviceOf = (auth: Auth) => (auth && typeof auth === 'object' && 'token' in auth ? (auth as { id: string; name?: string }) : null);
route('GET', '/api/push', ({ auth }) => {
  if (auth !== 'owner' && !deviceOf(auth)) throw new HttpError(403, 'Not allowed');
  return { publicKey: vapid().publicKey, phones: pushSubs().length };
});
route('POST', '/api/push/subscribe', ({ auth, body }) => {
  const dev = deviceOf(auth);
  if (auth !== 'owner' && !dev) throw new HttpError(403, 'Not allowed');
  addPushSub({ endpoint: String(body.endpoint ?? ''), keys: body.keys, deviceId: dev?.id ?? null, label: dev?.name ?? 'This computer', createdAt: '' });
  return { ok: true, phones: pushSubs().length };
});
route('POST', '/api/push/unsubscribe', ({ auth, body }) => {
  if (auth !== 'owner' && !deviceOf(auth)) throw new HttpError(403, 'Not allowed');
  removePushSub(String(body.endpoint ?? ''));
  return { ok: true };
});
route('POST', '/api/push/test', async ({ auth, body }) => {
  if (auth !== 'owner' && !deviceOf(auth)) throw new HttpError(403, 'Not allowed');
  return notifyPhones({ title: 'ALTTER', body: String(body.text ?? '') || '🔔 OK', url: '/', tag: 'test', level: 'ok' });
});

// ---------- live events (keeps every device in sync) ----------
route('GET', '/api/events', ({ res }) => {
  const sse = openSse(res);
  sse('hello', { at: new Date().toISOString() });
  const onEvent = (e: AlterEvent) => sse(e.type, e.data);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  bus.on('event', onEvent);
  res.on('close', () => {
    clearInterval(ping);
    bus.off('event', onEvent);
  });
  return SSE_HANDLED;
});

// ---------- plumbing ----------
const SSE_HANDLED = Symbol('sse');

function notFound(): never {
  throw new HttpError(404, 'Not found');
}

function openSse(res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  return (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function readBody(req: IncomingMessage, max = 1_000_000): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, 'Body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const fileCache = new Map<string, Buffer>();

function serveStatic(res: ServerResponse, pathname: string) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  let file = normalize(join(WEB_DIR, rel));
  if (!file.startsWith(normalize(WEB_DIR))) return send(res, 403, { error: 'Forbidden' });
  if (!existsSync(file) || !statSync(file).isFile()) file = join(WEB_DIR, 'index.html'); // SPA fallback
  const hashed = /[\\/]assets[\\/]/.test(file);
  let body = hashed ? fileCache.get(file) : undefined;
  if (!body) {
    body = readFileSync(file);
    if (hashed) fileCache.set(file, body);
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(body);
}

const PREVIEW_MIME: Record<string, string> = { '.htm': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const KIT_TAG = '<script src="/preview-kit.js" data-alter-kit></script>';
function servePreview(res: ServerResponse, pathname: string) {
  if (pathname === '/preview-kit.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(PREVIEW_KIT);
  }
  const found = resolvePreview(pathname);
  if (!found) return send(res, 404, { error: 'Not found' });
  const ext = extname(found.file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] ?? PREVIEW_MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  if (!/^\.html?$/.test(ext)) return res.end(readFileSync(found.file));
  // pages get the preview kit (live build + element picking); a page still being written starts empty
  const html = found.exists ? readFileSync(found.file, 'utf8') : '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
  const at = html.toLowerCase().lastIndexOf('</body>');
  res.end(at >= 0 ? html.slice(0, at) + KIT_TAG + html.slice(at) : html + KIT_TAG);
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

let listeningPort = loadConfig().port;

export function startServer(port = loadConfig().port, host = loadConfig().host) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://alter.local');
    try {
      if (url.pathname.startsWith('/preview/') || url.pathname === '/preview-kit.js') return servePreview(res, url.pathname);
      // the AI's mouse/keyboard (MCP) — only from this computer, never through the internet link
      if (url.pathname.startsWith('/mcp/team/')) {
        if (!isLoopback(req) || req.headers[RELAY_HEADER] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return send(res, 403, { error: 'Forbidden' });
        return handleTeamMcp(req, res, url.pathname.slice('/mcp/team/'.length), listeningPort);
      }
      if (url.pathname.startsWith('/mcp/council/')) {
        if (!isLoopback(req) || req.headers[RELAY_HEADER] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return send(res, 403, { error: 'Forbidden' });
        return handleCouncilMcp(req, res, url.pathname.slice('/mcp/council/'.length));
      }
      if (url.pathname.startsWith('/mcp/media/')) {
        if (!isLoopback(req) || req.headers[RELAY_HEADER] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return send(res, 403, { error: 'Forbidden' });
        return handleMediaMcp(req, res, url.pathname.slice('/mcp/media/'.length));
      }
      if (url.pathname.startsWith('/mcp/hands/')) {
        if (!isLoopback(req) || req.headers[RELAY_HEADER] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return send(res, 403, { error: 'Forbidden' });
        return handleHandsMcp(req, res, url.pathname.slice('/mcp/hands/'.length));
      }
      if (url.pathname.startsWith('/media/')) {
        if (!serveMedia(req, res, url.pathname)) send(res, 404, { error: 'Not found' });
        return;
      }
      if (url.pathname.startsWith('/files/')) {
        if (!serveUpload(req, res, url.pathname)) send(res, 404, { error: 'Not found' });
        return;
      }
      if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);

      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(res, 404, { error: 'Not found' });
      const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const bearer = header ?? url.searchParams.get('token') ?? undefined;
      const auth: Auth = authenticate(bearer) ?? authenticateGuest(bearer);
      if (!r.open && !auth) return send(res, 401, { error: 'Unauthorized — pair this device first' });
      if (isGuest(auth) && !r.open && !r.guest) return send(res, 403, { error: 'Guests can only use the shared chat' });

      const params = (url.pathname.match(r.re) ?? []).slice(1).map(decodeURIComponent);
      if (r.raw && Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) return send(res, 413, { error: 'File too large (max 300 MB)' });
      // problem reports may carry a few screenshots
      const body = r.raw ? {} : await readBody(req, url.pathname.startsWith('/api/report') ? 10_000_000 : url.pathname === '/api/memories/import' ? 60_000_000 : 1_000_000);
      const out = await r.handler({ req, res, params, url, body, auth });
      if (out !== SSE_HANDLED) send(res, 200, out ?? { ok: true });
      // any change in a workspace (a task dragged, a document saved…): everyone with it open refreshes that screen now
      if (req.method !== 'GET' && out !== SSE_HANDLED && /^\/api\/ws\/(?!board|log)/.test(url.pathname)) {
        try {
          const pid = (out as any)?.project_id ?? (Array.isArray(out) ? (out[0] as any)?.project_id : undefined) ?? wsProject(auth, url).id;
          wsChanged(pid, url.pathname.split('/')[3] ?? '');
        } catch {}
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[alter]', err);
      if (!res.headersSent) send(res, status, { error: (err as Error).message });
      else res.end();
    }
  });
  return new Promise<typeof server>((resolveP, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      setListening(port, host);
      listeningPort = port;
      startUpdateChecks(); startUsagePings(); warmUsage(); startWorkspaceAutomations();
      resolveP(server);
    });
  });
}
