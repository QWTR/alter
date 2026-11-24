// Business paperwork for a workspace: invoices (faktury), quotes (oferty) and orders (zlecenia).
// Numbered per kind and month, printable to PDF from the app, and the AI can draft one from a plain description.
import { randomUUID } from 'node:crypto';
import { all, get, getDb, now, run } from './db.ts';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import { getProject } from './projects.ts';
import { resolveProvider } from './providers/index.ts';
import type { Actor } from './workspace.ts';

export type SalesKind = 'invoice' | 'quote' | 'order';
export const KINDS: SalesKind[] = ['invoice', 'quote', 'order'];
const STATUSES = ['draft', 'sent', 'accepted', 'paid', 'cancelled'];
export interface Party { name: string; taxId?: string; address?: string; email?: string; phone?: string; bank?: string }
export interface Line { name: string; qty: number; unit: string; price: number; vat: number }
export interface SalesDoc {
  id: string; project_id: string; kind: SalesKind; number: string; status: string;
  client: Party; seller: Party; items: Line[]; currency: string;
  issue_date: string; due_date: string | null; notes: string;
  net: number; vat: number; gross: number;
  created_by: Actor; created_at: string; updated_at: string;
}

let ready = false;
function tables() {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sales_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      client TEXT NOT NULL,
      seller TEXT NOT NULL,
      items TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PLN',
      issue_date TEXT NOT NULL,
      due_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sales_project ON sales_docs(project_id, issue_date);
  `);
  ready = true;
}

/** The company's own details printed as the seller (owner sets them once). */
export function sellerProfile(): Party {
  const c = loadConfig() as any;
  return { name: '', taxId: '', address: '', email: '', phone: '', bank: '', ...(c.companyProfile ?? {}) };
}
export function setSellerProfile(patch: Partial<Party>): Party {
  const c = loadConfig() as any;
  c.companyProfile = { ...sellerProfile(), ...cleanParty(patch, true) };
  saveConfig();
  return sellerProfile();
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : d; };
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
function cleanParty(p: any, partial = false): Party {
  const o: any = {};
  for (const k of ['name', 'taxId', 'address', 'email', 'phone', 'bank'] as const) if (!partial || k in (p ?? {})) o[k] = str(p?.[k], k === 'address' ? 400 : 200);
  return o;
}
const cleanLines = (items: unknown): Line[] =>
  (Array.isArray(items) ? items : []).slice(0, 100).map((l: any) => ({
    name: str(l?.name, 300) || '—', qty: Math.max(0, num(l?.qty, 1)), unit: str(l?.unit, 12) || 'szt.', price: Math.round(num(l?.price) * 100) / 100,
    vat: l?.vat === 'zw' || l?.vat === 'np' ? -1 : Math.min(100, Math.max(-1, num(l?.vat, 23))),
  }));
export function totals(items: Line[]) {
  let net = 0, vat = 0;
  for (const l of items) { const n = l.qty * l.price; net += n; if (l.vat > 0) vat += (n * l.vat) / 100; }
  const r = (x: number) => Math.round(x * 100) / 100;
  return { net: r(net), vat: r(vat), gross: r(net + vat) };
}
const row = (d: any): SalesDoc => {
  const items = JSON.parse(d.items);
  return { ...d, client: JSON.parse(d.client), seller: JSON.parse(d.seller), items, created_by: JSON.parse(d.created_by), ...totals(items) };
};

const PREFIX: Record<SalesKind, string> = { invoice: 'FV', quote: 'OF', order: 'ZL' };
function nextNumber(kind: SalesKind, date: string) {
  const [y, m] = date.split('-');
  const n = (get<{ n: number }>(`SELECT COUNT(*) AS n FROM sales_docs WHERE kind = ? AND substr(issue_date, 1, 7) = ?`, kind, `${y}-${m}`)?.n ?? 0) + 1;
  return `${PREFIX[kind]}/${n}/${m}/${y}`;
}

export function listSales(projectId: string): SalesDoc[] {
  tables();
  return all<any>('SELECT * FROM sales_docs WHERE project_id = ? ORDER BY issue_date DESC, created_at DESC', projectId).map(row);
}
export const getSale = (id: string) => { tables(); const d = get<any>('SELECT * FROM sales_docs WHERE id = ?', id); return d ? row(d) : undefined; };

export function saveSale(projectId: string, input: any, by: Actor): SalesDoc {
  tables();
  const ts = now();
  const cur = input?.id ? getSale(input.id) : undefined;
  if (cur && cur.project_id === projectId) {
    run('UPDATE sales_docs SET number = ?, status = ?, client = ?, items = ?, currency = ?, issue_date = ?, due_date = ?, notes = ?, seller = ?, updated_at = ? WHERE id = ?',
      str(input.number, 60) || cur.number, STATUSES.includes(input.status) ? input.status : cur.status,
      JSON.stringify(input.client ? cleanParty(input.client) : cur.client), JSON.stringify(input.items ? cleanLines(input.items) : cur.items),
      str(input.currency, 5).toUpperCase() || cur.currency, day(input.issue_date) ?? cur.issue_date,
      'due_date' in input ? day(input.due_date) : cur.due_date, typeof input.notes === 'string' ? input.notes.slice(0, 4000) : cur.notes,
      JSON.stringify(cur.status === 'draft' ? sellerProfile() : cur.seller), ts, cur.id);
    emit('workspace.changed', { projectId, sale: cur.id });
    return getSale(cur.id)!;
  }
  const kind: SalesKind = KINDS.includes(input?.kind) ? input.kind : 'invoice';
  const issue = day(input?.issue_date) ?? ts.slice(0, 10);
  const due = 'due_date' in (input ?? {}) ? day(input.due_date) : new Date(Date.parse(issue) + (kind === 'quote' ? 30 : 14) * 86400_000).toISOString().slice(0, 10);
  const id = randomUUID();
  run('INSERT INTO sales_docs (id, project_id, kind, number, status, client, seller, items, currency, issue_date, due_date, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, projectId, kind, str(input?.number, 60) || nextNumber(kind, issue), STATUSES.includes(input?.status) ? input.status : 'draft',
    JSON.stringify(cleanParty(input?.client ?? {})), JSON.stringify(sellerProfile()), JSON.stringify(cleanLines(input?.items ?? [])),
    str(input?.currency, 5).toUpperCase() || 'PLN', issue, due, str(input?.notes, 4000), JSON.stringify(by), ts, ts);
  emit('workspace.changed', { projectId, sale: id });
  return getSale(id)!;
}
export function deleteSale(id: string): boolean {
  const d = getSale(id);
  if (!d) return false;
  run('DELETE FROM sales_docs WHERE id = ?', id);
  emit('workspace.changed', { projectId: d.project_id });
  return true;
}
/** Quote/order → invoice with the same client and lines. */
export function convertSale(id: string, kind: SalesKind, by: Actor): SalesDoc | undefined {
  const d = getSale(id);
  if (!d) return undefined;
  if (d.kind === 'quote') saveSale(d.project_id, { id, status: 'accepted' }, by);
  return saveSale(d.project_id, { kind, client: d.client, items: d.items, currency: d.currency, notes: d.notes }, by);
}

/** "Wystaw fakturę dla X na 3 dni pracy po 1200 zł": the AI turns a description into a filled document. */
export async function draftSale(projectId: string, text: string, kind: SalesKind, by: Actor): Promise<SalesDoc> {
  const p = getProject(projectId);
  if (!p) throw new Error('Workspace not found');
  const known = listSales(projectId).slice(0, 30).map((d) => d.client).filter((c) => c.name);
  const provider = await resolveProvider('default');
  const { text: out } = await provider.run({
    access: 'chat', timeoutMs: 120_000,
    prompt: `Turn the request below into a ${kind === 'invoice' ? 'VAT invoice' : kind === 'quote' ? 'price quote' : 'work order'}. Today is ${new Date().toISOString().slice(0, 10)}.
Return ONLY JSON: {"client": {"name","taxId","address","email"}, "items": [{"name","qty","unit","price" (net, per unit),"vat" (23, 8, 5, 0 or "zw")}], "currency": "PLN"|"EUR"|..., "due_date": "YYYY-MM-DD" or null, "notes": short}.
If a gross amount is given, compute the net price. Reuse a known client's details when the name matches. Use the language of the request for item names.
Known clients: ${JSON.stringify(known.slice(0, 15))}

Request:
"""
${text.slice(0, 3000)}
"""`,
  });
  const json = out.match(/\{[\s\S]*\}/)?.[0];
  let data: any;
  try { data = JSON.parse(json ?? ''); } catch { throw new Error('The AI did not return a document — try describing it again'); }
  return saveSale(projectId, { ...data, kind }, by);
}

/** Money summary for reports and the company page. */
export function salesStats(projectId: string) {
  const list = listSales(projectId).filter((d) => d.kind === 'invoice' && d.status !== 'cancelled');
  const today = new Date().toISOString().slice(0, 10);
  const sum = (xs: SalesDoc[]) => Math.round(xs.reduce((a, d) => a + d.gross, 0) * 100) / 100;
  const unpaid = list.filter((d) => d.status !== 'paid');
  return { invoiced: sum(list), paid: sum(list.filter((d) => d.status === 'paid')), unpaid: sum(unpaid), overdue: sum(unpaid.filter((d) => d.due_date && d.due_date < today)), count: list.length };
}
