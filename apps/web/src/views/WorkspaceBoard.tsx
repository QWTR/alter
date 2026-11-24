// The workspace whiteboard: draw, write and lay out boxes together, live. Everyone's changes and pointers show
// up at once; pan with the hand tool, Space or the middle button, zoom with Ctrl + wheel.
import { ArrowUpRight, Circle, Eraser, Hand, Minus, MousePointer2, Pencil, Redo2, Square, StickyNote, Trash2, Type, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, clientId } from '../api';
import { boardMoved, onBoard, setBoardView } from '../components/WsCursors';
import { toast } from '../components/ui';
import { useT } from '../i18n';
import type { WsCtx } from './WorkspaceTools';

type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow' | 'note' | 'text' | 'pen';
interface Shape { id: string; t: ShapeType; x: number; y: number; w: number; h: number; p?: number[]; stroke: string; fill: string; sw: number; text?: string; fs?: number; z: number; by?: string }
type Op = { put: Shape } | { del: string } | { clear: true };
type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'pen' | 'note' | 'text' | 'eraser';

const COLORS = ['#1e1e1e', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#9c36b5', '#868e96'];
const NOTE_COLORS = ['#fff3bf', '#ffd8a8', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffe3e3'];
const tint = (c: string) => c + '22';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Normalises a box drawn in any direction. */
const norm = (s: Shape): Shape => (s.t === 'line' || s.t === 'arrow' || s.t === 'pen' ? s : { ...s, x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) });

function penPath(p: number[]): string {
  if (p.length < 4) return p.length === 2 ? `M${p[0]} ${p[1]}l0.1 0` : '';
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}
function arrowHead(s: Shape): string {
  const x2 = s.x + s.w, y2 = s.y + s.h;
  const a = Math.atan2(s.h, s.w), l = 10 + s.sw * 2.2;
  const p1 = [x2 - l * Math.cos(a - 0.45), y2 - l * Math.sin(a - 0.45)];
  const p2 = [x2 - l * Math.cos(a + 0.45), y2 - l * Math.sin(a + 0.45)];
  return `M${p1[0]} ${p1[1]}L${x2} ${y2}L${p2[0]} ${p2[1]}`;
}
function bounds(s: Shape) {
  if (s.t === 'pen' && s.p?.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.p.length; i += 2) { x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]); }
    return { x: s.x + x0, y: s.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
}

export function BoardPane({ c }: { c: WsCtx }) {
  const t = useT();
  const [shapes, setShapes] = useState<Record<string, Shape>>({});
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(COLORS[0]);
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [filled, setFilled] = useState(false);
  const [sw, setSw] = useState(2);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [space, setSpace] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const undo = useRef<Op[][]>([]);
  const redo = useRef<Op[][]>([]);
  const key = `/api/ws/board${c.q}`;

  // ---------- load & live ops ----------
  const load = useCallback(() => {
    api<{ rev: number; shapes: Shape[] }>(key).then((b) => setShapes(Object.fromEntries(b.shapes.map((s) => [s.id, s])))).catch(() => {});
  }, [key]);
  useEffect(() => {
    load();
    return onBoard((d) => {
      if (d === 'hello') return load();
      if (d.cid === clientId) return;
      setShapes((all) => apply(all, d.ops));
    });
  }, [load]);

  // ---------- sending (latest state per shape, ~16 times a second while dragging) ----------
  const queue = useRef(new Map<string, Op>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    timer.current = null;
    const ops = [...queue.current.values()];
    queue.current.clear();
    if (ops.length) api(key, { method: 'POST', body: { cid: clientId, ops } }).catch((e) => toast((e as Error).message, 'error'));
  }, [key]);
  const send = useCallback((ops: Op[]) => {
    for (const o of ops) queue.current.set('clear' in o ? '*clear' : 'del' in o ? o.del : o.put.id, o);
    if (!timer.current) timer.current = setTimeout(flush, 60);
  }, [flush]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  /** A change of mine: applied here, sent, and undoable. `record` false while a drag is still going. */
  const commit = useCallback((ops: Op[], record = true, before?: Record<string, Shape>) => {
    const prev = before ?? shapesRef.current;
    if (record) {
      const inv: Op[] = [];
      for (const o of ops) {
        if ('clear' in o) Object.values(prev).forEach((s) => inv.push({ put: s }));
        else { const id = 'del' in o ? o.del : o.put.id; inv.push(prev[id] ? { put: prev[id] } : { del: id }); }
      }
      undo.current.push(inv);
      if (undo.current.length > 100) undo.current.shift();
      redo.current = [];
    }
    setShapes((all) => apply(all, ops));
    send(ops);
  }, [send]);
  const step = (from: React.MutableRefObject<Op[][]>, to: React.MutableRefObject<Op[][]>) => {
    const ops = from.current.pop();
    if (!ops) return;
    const prev = shapesRef.current;
    to.current.push(ops.map((o) => { const id = 'del' in o ? o.del : 'put' in o ? o.put.id : ''; return prev[id] ? { put: prev[id] } : { del: id }; }));
    setShapes((all) => apply(all, ops));
    send(ops);
  };

  // ---------- coordinates ----------
  const toWorld = useCallback((cx: number, cy: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(cx - r.left - v.x) / v.k, (cy - r.top - v.y) / v.k];
  }, []);
  const toScreen = useCallback((wx: number, wy: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [r.left + v.x + wx * v.k, r.top + v.y + wy * v.k];
  }, []);
  useEffect(() => {
    if (!svg.current) return;
    setBoardView({ el: svg.current, toWorld, toScreen });
    return () => setBoardView(null);
  }, [toWorld, toScreen]);
  useLayoutEffect(() => { boardMoved(); }, [view]);
  // start centred on what is there
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || !svg.current) return;
    const list = Object.values(shapes);
    centred.current = true;
    const r = svg.current.getBoundingClientRect();
    if (!list.length) return setView({ x: r.width / 2 - 300, y: r.height / 2 - 200, k: 1 });
    const b = list.map(bounds).reduce((a, s) => ({ x0: Math.min(a.x0, s.x), y0: Math.min(a.y0, s.y), x1: Math.max(a.x1, s.x + s.w), y1: Math.max(a.y1, s.y + s.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const k = Math.min(1, Math.max(0.2, Math.min((r.width - 80) / (b.x1 - b.x0 || 1), (r.height - 80) / (b.y1 - b.y0 || 1))));
    setView({ k, x: r.width / 2 - ((b.x0 + b.x1) / 2) * k, y: r.height / 2 - ((b.y0 + b.y1) / 2) * k });
  }, [shapes]);

  // ---------- keyboard ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]');
      if (e.code === 'Space' && !typing) { setSpace(true); e.preventDefault(); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? step(redo, undo) : step(undo, redo); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); step(redo, undo); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { commit([{ del: sel }]); setSel(null); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k: Record<string, Tool> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', a: 'arrow', l: 'line', p: 'pen', n: 'note', t: 'text', e: 'eraser' };
      if (k[e.key.toLowerCase()]) setTool(k[e.key.toLowerCase()]);
      if (e.key === 'Escape') { setSel(null); setEditing(null); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  });

  // ---------- pointer ----------
  const drag = useRef<null | { mode: 'pan' | 'draw' | 'move' | 'resize' | 'erase'; sx: number; sy: number; vx?: number; vy?: number; id?: string; orig?: Shape; before?: Record<string, Shape>; erased?: Set<string> }>(null);
  const nextZ = () => Math.max(0, ...Object.values(shapesRef.current).map((s) => s.z)) + 1;
  const base = (t2: ShapeType, x: number, y: number): Shape => ({
    id: uid(), t: t2, x, y, w: 0, h: 0, z: nextZ(), by: c.me.name,
    stroke: t2 === 'note' ? '#00000000' : color, sw: t2 === 'pen' ? Math.max(1.5, sw) : sw,
    fill: t2 === 'note' ? noteColor : filled && (t2 === 'rect' || t2 === 'ellipse') ? tint(color) : 'transparent',
  });

  const onDown = (e: React.PointerEvent) => {
    if (editing) return;
    // no focus change or text selection from pressing on the board (a new note's text box keeps the focus)
    e.preventDefault();
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const target = (e.target as Element).closest('[data-sid]') as SVGElement | null;
    const hitId = target?.dataset.sid ?? null;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === 'hand' || space) {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (tool === 'eraser') {
      drag.current = { mode: 'erase', sx: wx, sy: wy, before: shapesRef.current, erased: new Set() };
      if (hitId) erase(hitId);
      return;
    }
    if (tool === 'select') {
      if ((e.target as Element).closest('[data-handle]') && sel) {
        drag.current = { mode: 'resize', sx: wx, sy: wy, id: sel, orig: shapesRef.current[sel], before: shapesRef.current };
        return;
      }
      setSel(hitId);
      if (hitId) drag.current = { mode: 'move', sx: wx, sy: wy, id: hitId, orig: shapesRef.current[hitId], before: shapesRef.current };
      else drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (tool === 'note' || tool === 'text') {
      const s = tool === 'note' ? { ...base('note', wx - 90, wy - 60), w: 180, h: 120, text: '', fs: 18 } : { ...base('text', wx, wy - 14), w: 220, h: 36, text: '', fs: 22 };
      commit([{ put: s }]);
      setSel(s.id);
      setEditing(s.id);
      setTool('select');
      return;
    }
    const s = base(tool as ShapeType, wx, wy);
    if (tool === 'pen') { s.p = [0, 0]; }
    commit([{ put: s }], false);
    drag.current = { mode: 'draw', sx: wx, sy: wy, id: s.id, before: shapesRef.current };
  };
  const erase = (id: string) => {
    const d = drag.current;
    if (!d?.erased || d.erased.has(id)) return;
    d.erased.add(id);
    setShapes((all) => apply(all, [{ del: id }]));
    send([{ del: id }]);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') return setView((v) => ({ ...v, x: d.vx! + e.clientX - d.sx, y: d.vy! + e.clientY - d.sy }));
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (d.mode === 'erase') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sid]') as SVGElement | null;
      if (el?.dataset.sid) erase(el.dataset.sid);
      return;
    }
    const cur = shapesRef.current[d.id!];
    if (!cur) return;
    let next: Shape;
    if (d.mode === 'move') next = { ...cur, x: d.orig!.x + wx - d.sx, y: d.orig!.y + wy - d.sy };
    else if (d.mode === 'resize') next = { ...cur, w: Math.max(20, d.orig!.w + wx - d.sx), h: Math.max(20, d.orig!.h + wy - d.sy) };
    else if (cur.t === 'pen') {
      const lx = wx - cur.x, ly = wy - cur.y, p = cur.p ?? [];
      if (Math.hypot(lx - p[p.length - 2], ly - p[p.length - 1]) < 2 / view.k) return;
      next = { ...cur, p: [...p, lx, ly] };
    } else {
      let w = wx - d.sx, h = wy - d.sy;
      if (e.shiftKey && cur.t !== 'line' && cur.t !== 'arrow') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      next = { ...cur, w, h };
    }
    setShapes((all) => ({ ...all, [next.id]: next }));
    send([{ put: next }]);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode === 'pan') return;
    if (d.mode === 'erase') {
      if (d.erased?.size) { undo.current.push([...d.erased].map((id) => ({ put: d.before![id] }))); redo.current = []; }
      return;
    }
    const cur = shapesRef.current[d.id!];
    if (!cur) return;
    if (d.mode === 'draw') {
      const tiny = cur.t === 'pen' ? false : Math.abs(cur.w) < 3 && Math.abs(cur.h) < 3;
      if (tiny) {
        // a click with a shape tool: a default-sized one
        const s = cur.t === 'line' || cur.t === 'arrow' ? { ...cur, w: 160, h: 0 } : { ...cur, x: cur.x - 60, y: cur.y - 40, w: 120, h: 80 };
        commit([{ put: s }], true, d.before);
      } else commit([{ put: norm(cur) }], true, d.before);
      setSel(cur.id);
      setTool('select');
      return;
    }
    commit([{ put: cur }], true, d.before);
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = svg.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const k = Math.min(4, Math.max(0.15, view.k * Math.exp(-e.deltaY * 0.0015)));
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k });
    } else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
  };
  // Ctrl + wheel must not zoom the whole page
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  // style changes apply to the selected shape too
  const restyle = (patch: Partial<Shape>) => {
    const s = sel && shapesRef.current[sel];
    if (s) commit([{ put: { ...s, ...patch } }]);
  };

  const list = useMemo(() => Object.values(shapes).sort((a, b) => a.z - b.z), [shapes]);
  const selShape = sel ? shapes[sel] : null;
  const edit = editing ? shapes[editing] : null;
  const tools: { k: Tool; icon: typeof Square; key: string }[] = [
    { k: 'select', icon: MousePointer2, key: 'V' }, { k: 'hand', icon: Hand, key: 'H' }, { k: 'rect', icon: Square, key: 'R' }, { k: 'ellipse', icon: Circle, key: 'O' },
    { k: 'arrow', icon: ArrowUpRight, key: 'A' }, { k: 'line', icon: Minus, key: 'L' }, { k: 'pen', icon: Pencil, key: 'P' }, { k: 'note', icon: StickyNote, key: 'N' },
    { k: 'text', icon: Type, key: 'T' }, { k: 'eraser', icon: Eraser, key: 'E' },
  ];
  const cursor = space || tool === 'hand' ? (drag.current?.mode === 'pan' ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair';

  return (
    <div className="wb" ref={wrap}>
      <div className="wb-tools" role="toolbar">
        {tools.map((x) => (
          <button key={x.k} className={tool === x.k ? 'on' : ''} title={`${t(`wb.tool.${x.k}`)} (${x.key})`} onClick={() => setTool(x.k)}><x.icon size={17} /></button>
        ))}
        <span className="wb-sep" />
        <button title={t('wb.undo')} onClick={() => step(undo, redo)}><Undo2 size={17} /></button>
        <button title={t('wb.redo')} onClick={() => step(redo, undo)}><Redo2 size={17} /></button>
        {c.isOwner && <button title={t('wb.clear')} onClick={() => { if (list.length && confirm(t('wb.clearQ'))) commit([{ clear: true }]); }}><Trash2 size={17} /></button>}
      </div>
      <div className="wb-style">
        {(selShape?.t === 'note' || (!selShape && tool === 'note') ? NOTE_COLORS : COLORS).map((col) => {
          const note = selShape?.t === 'note' || (!selShape && tool === 'note');
          const on = selShape ? (note ? selShape.fill === col : selShape.stroke === col) : note ? noteColor === col : color === col;
          return <button key={col} className={`wb-swatch${on ? ' on' : ''}`} style={{ background: col }} title={col} onClick={() => { if (note) { setNoteColor(col); restyle({ fill: col }); } else { setColor(col); restyle(selShape && (selShape.t === 'rect' || selShape.t === 'ellipse') && selShape.fill !== 'transparent' ? { stroke: col, fill: tint(col) } : { stroke: col }); } }} />;
        })}
        <span className="wb-sep" />
        {[2, 4, 8].map((w) => <button key={w} className={`wb-w${(selShape ? selShape.sw : sw) === w ? ' on' : ''}`} title={t('wb.width')} onClick={() => { setSw(w); restyle({ sw: w }); }}><span style={{ height: w }} /></button>)}
        <button className={`wb-fill${(selShape ? selShape.fill !== 'transparent' && selShape.t !== 'note' : filled) ? ' on' : ''}`} title={t('wb.fill')} onClick={() => { const v = !(selShape ? selShape.fill !== 'transparent' : filled); setFilled(v); if (selShape && (selShape.t === 'rect' || selShape.t === 'ellipse')) restyle({ fill: v ? tint(selShape.stroke) : 'transparent' }); }}><Square size={15} fill="currentColor" fillOpacity={0.25} /></button>
      </div>
      <svg
        ref={svg}
        className="wb-canvas"
        data-board
        style={{ cursor, backgroundSize: `${22 * view.k}px ${22 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onDoubleClick={(e) => {
          const id = ((e.target as Element).closest('[data-sid]') as SVGElement | null)?.dataset.sid;
          const s = id && shapesRef.current[id];
          if (s && (s.t === 'note' || s.t === 'text' || s.t === 'rect' || s.t === 'ellipse')) { setSel(s.id); setEditing(s.id); }
          else if (!id && tool === 'select') {
            const [wx, wy] = toWorld(e.clientX, e.clientY);
            const n = { ...base('text', wx, wy - 14), w: 220, h: 36, text: '', fs: 22 };
            commit([{ put: n }]);
            setSel(n.id);
            setEditing(n.id);
          }
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {list.map((s) => <ShapeEl key={s.id} s={s} hide={s.id === editing} />)}
          {selShape && !editing && <Selection s={selShape} k={view.k} />}
        </g>
      </svg>
      {edit && <TextEdit s={edit} view={view} onDone={(text) => {
        setEditing(null);
        const cur = shapesRef.current[edit.id];
        if (!cur) return;
        if (!text.trim() && (cur.t === 'text')) commit([{ del: cur.id }]);
        else if (text !== (cur.text ?? '')) commit([{ put: { ...cur, text, h: cur.t === 'text' ? Math.max(cur.h, (cur.fs ?? 22) * 1.4 * text.split('\n').length) : cur.h } }]);
      }} />}
      {!list.length && <div className="wb-empty small faint">{t('wb.empty')}</div>}
    </div>
  );
}

function apply(all: Record<string, Shape>, ops: Op[]): Record<string, Shape> {
  let next = { ...all };
  for (const o of ops) {
    if ('clear' in o) next = {};
    else if ('del' in o) delete next[o.del];
    else next[o.put.id] = o.put;
  }
  return next;
}

function ShapeEl({ s, hide }: { s: Shape; hide: boolean }) {
  const b = { 'data-sid': s.id } as any;
  const common = { stroke: s.stroke, strokeWidth: s.sw, fill: s.fill, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const label = (s.t === 'rect' || s.t === 'ellipse') && s.text && !hide ? (
    <foreignObject x={s.x} y={s.y} width={Math.max(1, s.w)} height={Math.max(1, s.h)} style={{ pointerEvents: 'none' }}>
      <div className="wb-label" style={{ fontSize: s.fs ?? 18, color: s.stroke }}>{s.text}</div>
    </foreignObject>
  ) : null;
  switch (s.t) {
    case 'rect': {
      const r = norm(s);
      return <g {...b}><rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} {...common} fill={s.fill === 'transparent' ? 'rgba(0,0,0,0.001)' : s.fill} />{label}</g>;
    }
    case 'ellipse': {
      const r = norm(s);
      return <g {...b}><ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} {...common} fill={s.fill === 'transparent' ? 'rgba(0,0,0,0.001)' : s.fill} />{label}</g>;
    }
    case 'line':
    case 'arrow':
      return (
        <g {...b}>
          <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke="transparent" strokeWidth={Math.max(14, s.sw + 10)} />
          <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} {...common} />
          {s.t === 'arrow' && <path d={arrowHead(s)} {...common} fill="none" />}
        </g>
      );
    case 'pen': {
      const d = penPath(s.p ?? []);
      return (
        <g {...b} transform={`translate(${s.x} ${s.y})`}>
          <path d={d} stroke="transparent" strokeWidth={Math.max(14, s.sw + 10)} fill="none" />
          <path d={d} {...common} fill="none" />
        </g>
      );
    }
    case 'note':
      return (
        <g {...b}>
          <rect x={s.x + 2} y={s.y + 4} width={s.w} height={s.h} rx={4} fill="rgba(0,0,0,.12)" />
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} fill={s.fill} />
          {!hide && <foreignObject x={s.x} y={s.y} width={s.w} height={s.h} style={{ pointerEvents: 'none' }}><div className="wb-note" style={{ fontSize: s.fs ?? 18 }}>{s.text}</div></foreignObject>}
          {s.by && <text x={s.x + s.w - 8} y={s.y + s.h - 8} textAnchor="end" fontSize={10} fill="rgba(0,0,0,.4)">{s.by}</text>}
        </g>
      );
    case 'text':
      return (
        <g {...b}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="rgba(0,0,0,0.001)" />
          {!hide && <foreignObject x={s.x} y={s.y} width={s.w} height={s.h} style={{ pointerEvents: 'none' }}><div className="wb-text" style={{ fontSize: s.fs ?? 22, color: s.stroke }}>{s.text}</div></foreignObject>}
        </g>
      );
  }
}

function Selection({ s, k }: { s: Shape; k: number }) {
  const r = bounds(s);
  const pad = 6 / k;
  const canResize = s.t !== 'pen' && s.t !== 'line' && s.t !== 'arrow';
  return (
    <g className="wb-sel">
      <rect x={r.x - pad} y={r.y - pad} width={r.w + pad * 2} height={r.h + pad * 2} fill="none" stroke="#4c6ef5" strokeWidth={1.5 / k} strokeDasharray={`${4 / k} ${3 / k}`} style={{ pointerEvents: 'none' }} />
      {canResize && <rect data-handle x={r.x + r.w + pad - 5 / k} y={r.y + r.h + pad - 5 / k} width={10 / k} height={10 / k} rx={2 / k} fill="#fff" stroke="#4c6ef5" strokeWidth={1.5 / k} style={{ cursor: 'nwse-resize' }} />}
    </g>
  );
}

function TextEdit({ s, view, onDone }: { s: Shape; view: { x: number; y: number; k: number }; onDone: (text: string) => void }) {
  const [v, setV] = useState(s.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const go = () => { ref.current?.focus(); ref.current?.select(); };
    go();
    const id = requestAnimationFrame(go);
    return () => cancelAnimationFrame(id);
  }, []);
  const fs = (s.fs ?? (s.t === 'text' ? 22 : 18)) * view.k;
  const r = norm(s);
  return (
    <textarea
      ref={ref}
      className={`wb-edit wb-edit-${s.t}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } e.stopPropagation(); }}
      style={{
        left: view.x + r.x * view.k, top: view.y + r.y * view.k, width: Math.max(80, r.w * view.k), height: Math.max(fs * 1.6, r.h * view.k),
        fontSize: fs, color: s.t === 'note' ? '#1e1e1e' : s.stroke, background: s.t === 'note' ? s.fill : 'transparent',
        textAlign: s.t === 'rect' || s.t === 'ellipse' ? 'center' : 'left',
      }}
    />
  );
}
