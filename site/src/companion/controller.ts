// Imperative driver: DOM, animation loop, movement and event wiring around the Machine.
import { Machine, type Host, type State } from './machine';
import { KIND_COLOUR, Session, Taps, type Globals, type Kind, type LineMap } from './lines';
import { KonamiDetector, Quiet, isCoarse, prefersReduced } from './input';
import { BUBBLE, coarseAnchor, measure, measureContent, type Anchor, type Pt, type Rect } from './placement';
import {
  DeadZone, SpotIndex, chooseSpot, groundsOf, liftFor, placeFreeBubble, planPath, smoothDamp, boxAt, within,
  type Content, type Spot, type Step,
} from './follow';
import { FRAMES, OX, OY, SH, W, H, draw, isOrbCell, type FrameName, type Pose } from './sprite';

export interface Els { layer: HTMLElement; canvas: HTMLCanvasElement; bubble: HTMLElement; bang: HTMLElement }
interface Move { kind: 'walk' | 'hop'; from: Pt; to: Pt; start: number; dur: number; lift: number; done: () => void }

const NAV = 48;
const WALK_PX_S = 180;
const HOP_MS = 220;
const RUN_MAX = 560; // px/s
type Act =
  | { k: 'idle' }
  | { k: 'run'; x: number }
  | { k: 'hop'; from: Pt; to: Pt; start: number; dur: number; lift: number; gid: string }
  | { k: 'fade'; to: Spot; start: number; phase: 'out' | 'in' };

export class Controller {
  machine: Machine;
  private pos: Pt = { x: 0, y: 0 };
  private surface = '';
  private saved: { pos: Pt; surface: string } | null = null;
  private move: Move | null = null;
  private raf = 0;
  private scale = 3;
  private coarse = false;
  private hoverTile: string | null = null;
  private tint: string | null = null;
  private quiet = new Quiet();
  private konami = new KonamiDetector();
  private cleanup: (() => void)[] = [];
  private nextBlink = 0;
  private blinkUntil = 0;
  private flashUntil = 0;
  private lastKey = '';
  private homeKey = '';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private destroyed = false;
  private wave = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  // follow-the-cursor locomotion
  private gid = '';
  private vx = 0;
  private act: Act = { k: 'idle' };
  private queue: Step[] = [];
  private target: Spot | null = null;
  private dz = new DeadZone();
  private ptrClient: Pt | undefined;
  private needRetarget = true;
  private index: SpotIndex | null = null;
  private content: Content[] = [];
  private runPhase = 0;
  private running = false;
  private face = 1;
  private landedAt = -1e9;
  private lastFrame = 0;
  private bubbleIdx = -1;
  private bubbleShown = false;
  private want = false;
  private bw = BUBBLE.w;
  private bh = 40;
  private rmTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private els: Els, lines: LineMap, globals: Globals, private onHidden: () => void) {
    const kv = (() => { try { return sessionStorage; } catch { return undefined; } })();
    const host: Host = {
      say: (t, k) => this.say(t, k),
      perch: () => this.perch(),
      unperch: (d) => this.unperch(d),
      onState: (s, p) => this.onState(s, p),
      canSpeak: () => this.quiet.ok,
    };
    this.machine = new Machine(host, { lines, globals, session: new Session(kv), taps: new Taps(), reduced: prefersReduced });
  }

  // ---- lifecycle
  start(greeting: 'first' | 'on' | null) {
    const { canvas } = this.els;
    this.wave = !!document.querySelector('[data-probe-wave]');
    if (this.wave) greeting = null;
    this.coarse = isCoarse();
    this.machine.setCoarse(this.coarse);
    this.scale = this.coarse || innerWidth < 720 ? 2 : 3;
    canvas.style.width = `${W * this.scale}px`;
    canvas.style.height = `${H * this.scale}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    document.documentElement.toggleAttribute('data-probe-pips', this.coarse);
    this.placeHome(true);
    this.refreshIndex();
    this.gid = this.resolveGid();
    this.listen();
    this.cleanup.push(((i) => () => clearInterval(i))(setInterval(() => this.refreshIndex(), 1500)));
    document.fonts?.ready.then(() => this.refreshIndex());
    (window as unknown as Record<string, unknown>).__probe = { spotFor: (x: number, y: number) => this.spotFor({ x, y }), content: () => this.content.map((c) => c.rect), sprite: () => this.sprite, dbg: () => ({ pos: this.pos, want: this.want, hidden: this.els.bubble.hidden, tf: this.els.bubble.style.transform, shown: this.bubbleShown, act: this.act.k, st: this.machine.state, sy: scrollY }) };
    this.nextBlink = performance.now() + 2500;
    this.machine.enable(greeting);
    const w = document.querySelector<HTMLElement>('.p-root[data-open] .p-win');
    if (w) { const r = w.getBoundingClientRect(); this.perchRect = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; this.machine.panelOpen(); }
    this.lastFrame = performance.now();
    this.loop(performance.now());
  }

  stop() { this.machine.disable(); }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
    this.timers.forEach(clearTimeout);
    clearTimeout(this.fadeTimer);
    document.documentElement.removeAttribute('data-probe-pips');
  }

  private after(ms: number, f: () => void) { this.timers.push(setTimeout(() => !this.destroyed && f(), ms)); }

  // ---- geometry
  private get sprite() { return { w: 16 * this.scale, h: SH * this.scale }; }
  private get viewport(): Rect {
    return { x: scrollX, y: scrollY + NAV, w: document.documentElement.clientWidth, h: innerHeight - NAV };
  }
  private fallbackAnchor(): Anchor {
    const v = this.viewport;
    return { key: 'corner', surface: 'corner', x: v.x + v.w - 48, y: v.y + v.h - 12, kind: 'park' };
  }

  private homeAnchor(): Anchor {
    const lay = measure();
    const sp = this.sprite;
    const hasShelves = lay.rows.length > 0;
    if (!hasShelves && !lay.board) return this.fallbackAnchor();
    if (this.coarse || innerWidth < 720) {
      const vp = this.viewport;
      const secs = [...document.querySelectorAll<HTMLElement>('[data-shelf]')].map((el) => {
        const r = el.getBoundingClientRect();
        const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, NAV));
        return { id: el.dataset.shelf!, vis };
      });
      const best = secs.sort((a, b) => b.vis - a.vis)[0];
      if (best && best.vis > innerHeight * 0.25) {
        const a = coarseAnchor(lay, lay.rowsOfShelf[best.id] ?? [], { viewport: vp, sprite: sp });
        if (a) return a;
      }
    }
    if (lay.board) return { key: 'board', surface: 'board', x: lay.board.x + lay.board.w * 0.78, y: lay.board.y, kind: 'board' };
    const row = lay.rows[0];
    return { key: 'row0', surface: row.surface, x: row.x0 + 40, y: row.ground, kind: 'park' };
  }

  private placeHome(snap: boolean) {
    const a = this.homeAnchor();
    if (snap) { this.pos = { x: a.x, y: a.y }; this.surface = a.surface; this.homeKey = a.key; return; }
    if (a.key === this.homeKey) return;
    this.homeKey = a.key;
    this.moveTo(a, () => {});
  }

  // ---- free-space index
  private sig = '';
  private static signature(c: { rect: Rect }[]) { return c.map((x) => `${Math.round(x.rect.x)},${Math.round(x.rect.y)},${Math.round(x.rect.w)},${Math.round(x.rect.h)}`).join(';'); }

  /** Layout moved under Probe (lazy reveals, images, fonts): rebuild the free-space map at once, not on the 1.5 s timer. */
  private checkLayout() {
    if (this.coarse || this.destroyed) return;
    if (Controller.signature(measureContent()) !== this.sig) {
      this.refreshIndex(); this.needRetarget = true; this.dz.reset();
      this.gid = this.resolveGid();
    }
  }

  private refreshIndex() {
    if (this.destroyed) return;
    const lay = measure();
    this.content = measureContent();
    this.sig = Controller.signature(this.content);
    this.index = new SpotIndex(groundsOf(lay.rows, lay.tiles, lay.board), this.content, this.sprite);
  }

  private resolveGid(): string {
    const g = this.index?.grounds.find((x) => Math.abs(x.y - this.pos.y) < 3 && this.pos.x >= x.x0 - 1 && this.pos.x <= x.x1 + 1);
    return g?.id ?? '';
  }

  private pointerDoc(): Pt | undefined {
    return this.ptrClient ? { x: this.ptrClient.x + scrollX, y: this.ptrClient.y + scrollY } : undefined;
  }

  /** Test hook: where Probe would stand for a cursor at (x, y) in document coordinates. */
  private spotFor(p: Pt) {
    if (!this.index) return null;
    const s = chooseSpot(this.index, p, this.viewport);
    return s ? { spot: s, box: boxAt(s.x, s.y, this.sprite) } : null;
  }

  private get curSpot(): Spot { return { gid: this.gid, x: this.pos.x, y: this.pos.y }; }

  // ---- movement (touch, reduced motion, perch: the older anchor moves)
  private moveTo(a: Anchor, done: () => void) {
    const to = { x: a.x, y: a.y };
    if (prefersReduced()) {
      this.els.canvas.style.opacity = '0';
      this.after(75, () => { this.pos = to; this.surface = a.surface; this.gid = this.resolveGid(); this.els.canvas.style.opacity = '1'; this.after(75, done); });
      return;
    }
    const dx = Math.abs(to.x - this.pos.x);
    const same = a.surface === this.surface && dx <= 700;
    this.move = same
      ? { kind: 'walk', from: { ...this.pos }, to, start: performance.now(), dur: Math.max(60, (dx / WALK_PX_S) * 1000), lift: 0, done }
      : { kind: 'hop', from: { ...this.pos }, to, start: performance.now(), dur: HOP_MS, lift: Math.min(90, 36 + Math.hypot(to.x - this.pos.x, to.y - this.pos.y) * 0.08), done };
    this.surface = a.surface;
    this.act = { k: 'idle' }; this.queue = []; this.vx = 0;
  }

  private perch() {
    const el = this.perchRect;
    if (!el || innerWidth < 720) return; // phone sheet is full screen: Probe waits behind it
    if (!this.saved) this.saved = { pos: { ...this.pos }, surface: this.surface };
    this.els.layer.classList.add('perched');
    const x = el.x + 20 + this.sprite.w / 2;
    const y = Math.max(el.y, scrollY + NAV + this.sprite.h + 8);
    this.moveTo({ key: 'perch', surface: 'perch', x, y, kind: 'top' }, () => {});
  }
  private perchRect: Rect | null = null;

  private unperch(done: () => void) {
    const s = this.saved;
    this.saved = null;
    const finish = () => { this.els.layer.classList.remove('perched'); this.needRetarget = true; this.dz.reset(); done(); };
    if (!s) { finish(); return; }
    this.moveTo({ key: 'back', surface: s.surface, x: s.pos.x, y: s.pos.y, kind: 'park' }, finish);
  }

  // ---- bubble (free space only: above, left or right of Probe, or not shown)
  private say(text: string | null, kind: Kind | null) {
    const b = this.els.bubble;
    this.tint = text && kind ? KIND_COLOUR[kind] : null;
    this.want = !!text;
    if (!text) { b.hidden = true; this.bubbleShown = false; return; }
    b.hidden = false;
    b.style.visibility = 'visible';
    b.textContent = text;
    this.bw = Math.min(BUBBLE.w, b.offsetWidth || BUBBLE.w); this.bh = b.offsetHeight || 40; // measured once; the box is not re-measured while hidden
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.bubbleIdx = -1;
    this.bubbleShown = false;
    this.needRetarget = true; this.dz.reset(); // stand where the bubble fits in free space
    this.placeBubbleEl();
  }

  /** Re-validated every frame (Probe moving, scrolling, layout change): flip to a free side, or hide at once (display none) until one is free. */
  private placeBubbleEl() {
    const b = this.els.bubble;
    if (!this.want) return;
    const sp = this.sprite, v = this.viewport, base = { x: this.pos.x, y: this.pos.y };
    if (this.coarse) { b.hidden = false; this.placeBubbleCoarse(b, base, sp, v); return; }
    if (!b.hidden) { this.bw = Math.min(BUBBLE.w, b.offsetWidth || this.bw); this.bh = b.offsetHeight || this.bh; } // real size (fonts load late)
    this.content = measureContent();
    const hit = placeFreeBubble(base, sp, { w: this.bw, h: this.bh }, this.content, this.pointerDoc(), v, this.bubbleIdx);
    if (!hit) { b.hidden = true; this.bubbleShown = false; return; }
    if (!this.bubbleShown) { this.bubbleShown = true; b.hidden = false; b.classList.remove('refade'); void b.offsetWidth; b.classList.add('refade'); }
    b.hidden = false;
    const r = hit.rect;
    this.bubbleIdx = hit.idx;
    b.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
    b.dataset.side = hit.idx <= 2 ? 'above' : hit.idx === 3 ? 'left' : 'right';
    b.style.setProperty('--tx', `${Math.round(Math.min(Math.max(base.x - r.x, 10), this.bw - 18))}px`);
  }

  private placeBubbleCoarse(b: HTMLElement, base: Pt, sp: { w: number; h: number }, v: Rect) {
    const w = this.bw, h = this.bh;
    const ideal = base.y - sp.h - 10 - h;
    const clamped = ideal < v.y + 4;
    const x = clamped ? base.x - sp.w / 2 - 6 - w : base.x - w / 2;
    const r = { x: Math.min(Math.max(x, v.x + 4), v.x + v.w - w - 4), y: Math.max(v.y + 4, ideal), w, h };
    b.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
    b.dataset.side = clamped ? 'left' : 'above';
    b.style.setProperty('--tx', `${Math.round(Math.min(Math.max(base.x - r.x, 10), w - 18))}px`);
  }

  // ---- state hooks
  private onState(s: State, prev: State) {
    const { layer } = this.els;
    layer.dataset.state = s;
    if (s === 'leaving') layer.classList.add('leaving');
    if (s === 'hidden') { this.onHidden(); }
    if (s === 'entering') this.startHopInPlace();
    if (prev === 'dozing') this.lastKey = '';
  }

  private startHopInPlace() {
    if (prefersReduced()) return;
    this.move = { kind: 'hop', from: { ...this.pos }, to: { ...this.pos }, start: performance.now(), dur: 360, lift: 34, done: () => {} };
  }

  // ---- follow the cursor
  private canFollowX() { return ['idle', 'cooldown', 'talking'].includes(this.machine.state); }
  private movable() { return !this.coarse && !prefersReduced() && !this.move && !['hidden', 'leaving', 'entering', 'perched', 'dancing', 'overcharge'].includes(this.machine.state); }

  private posValid(v: Rect, ptr: Pt | undefined): boolean {
    const b = boxAt(this.pos.x, this.pos.y, this.sprite);
    if (!within(b, v)) return false;
    if (ptr && b.x < ptr.x + 24 && b.x + b.w > ptr.x - 24 && b.y < ptr.y + 24 && b.y + b.h > ptr.y - 24) return false;
    return true;
  }

  private retarget(v: Rect, ptr: Pt | undefined) {
    if (!this.index) return;
    const p = ptr ?? { x: this.pos.x, y: v.y + v.h * 0.7 };
    const bub = this.want ? { w: this.bw, h: this.bh } : undefined;
    this.target = chooseSpot(this.index, p, v, this.gid ? this.curSpot : undefined, bub);
    this.queue = [];
    if (this.act.k === 'run') this.act = { k: 'idle' };
  }

  private startHop(from: Pt, to: { x: number; y: number }, gid: string, now: number) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    this.act = { k: 'hop', from: { ...from }, to: { x: to.x, y: to.y }, start: now, dur: 220 + Math.min(80, dist / 6), lift: liftFor(from, to), gid };
    this.vx = 0;
  }

  private stepFollow(now: number, dt: number) {
    const v = this.viewport;
    const ptr = this.pointerDoc();
    const movable = this.movable();
    if (!movable) { this.vx = 0; return; }
    const moving = this.canFollowX();
    const invalid = !this.posValid(v, ptr);
    if (this.needRetarget || (ptr && this.dz.update(ptr)) || invalid) {
      if (moving || invalid) { this.retarget(v, ptr); this.needRetarget = false; }
    }
    const a = this.act;
    if (a.k === 'hop') {
      const t = Math.min(1, (now - a.start) / a.dur);
      this.pos = { x: a.from.x + (a.to.x - a.from.x) * t, y: a.from.y + (a.to.y - a.from.y) * t - Math.sin(Math.PI * t) * a.lift };
      if (t >= 1) { this.pos = { ...a.to }; this.gid = a.gid; this.landedAt = now; this.act = { k: 'idle' }; }
      return;
    }
    if (a.k === 'fade') {
      const el = now - a.start;
      if (a.phase === 'out' && el >= 110) { this.pos = { x: a.to.x, y: a.to.y }; this.gid = a.to.gid; this.act = { k: 'fade', to: a.to, start: now, phase: 'in' }; this.landedAt = now; }
      else if (a.phase === 'in' && el >= 110) this.act = { k: 'idle' };
      this.els.canvas.style.opacity = String(a.phase === 'out' ? 1 - Math.min(1, el / 110) : Math.min(1, el / 110));
      this.vx = 0;
      return;
    }
    if (a.k === 'run') {
      const [x, nv] = smoothDamp(this.pos.x, a.x, this.vx, 0.14, RUN_MAX, dt);
      this.pos.x = x; this.vx = nv;
      if (Math.abs(x - a.x) < 1 && Math.abs(nv) < 8) { this.pos.x = a.x; this.vx = 0; this.act = { k: 'idle' }; }
      return;
    }
    // idle locomotion: continue the queue, or head for the target
    if (this.els.canvas.style.opacity !== '1') this.els.canvas.style.opacity = '1';
    const q = this.queue.shift();
    if (q) { if (q.type === 'run') this.act = { k: 'run', x: q.x }; else this.startHop(this.pos, q, q.gid, now); return; }
    const tgt = this.target;
    if (!tgt || !this.index) { this.vx = 0; return; }
    if (!moving && !invalid) { this.vx = 0; return; }
    if (this.gid === tgt.gid && this.index.runnable(tgt.gid, this.pos.x, tgt.x)) {
      if (Math.abs(tgt.x - this.pos.x) > 0.5 || Math.abs(this.vx) > 8) this.act = { k: 'run', x: tgt.x };
      return;
    }
    if (!this.gid) this.gid = this.resolveGid();
    const plan = planPath(this.index, this.curSpot, tgt, v);
    if (plan.teleport) {
      if (this.pos.x === tgt.x && this.pos.y === tgt.y) return;
      this.act = { k: 'fade', to: tgt, start: now, phase: 'out' };
      return;
    }
    this.queue = plan.steps.slice(1);
    const f = plan.steps[0];
    if (!f) return;
    if (f.type === 'run') this.act = { k: 'run', x: f.x }; else this.startHop(this.pos, f, f.gid, now);
  }

  /** Pose from locomotion (run frames tied to speed, take-off stretch, jump, landing squash, dust), or null when standing. */
  private locoPose(now: number, dt: number): { pose: Pose; key: string; bright?: boolean } | null {
    const a = this.act;
    if (a.k === 'hop') {
      const t = (now - a.start) / a.dur;
      const fr = t < 0.16 ? FRAMES.hopStretch : t > 0.9 ? FRAMES.hopSquash : FRAMES.hopStretch;
      return { pose: fr as Pose, key: t < 0.16 ? 'takeoff' : t > 0.9 ? 'land' : 'jump' };
    }
    const since = now - this.landedAt;
    if (since < 90 && this.landedAt > 0) return { pose: FRAMES.hopSquash as Pose, key: 'land' };
    if (since < 270 && this.landedAt > 0) { const d = (Math.min(2, Math.floor((since - 90) / 60)) + 1) as 1 | 2 | 3; return { pose: { ...(FRAMES.idleA as Pose), dust: d }, key: `dust${d}` }; }
    const sp = Math.abs(this.vx);
    if (this.running ? sp < 15 : sp > 40) this.running = !this.running;
    if (this.running) {
      if (sp > 1) this.face = Math.sign(this.vx);
      this.runPhase += (sp * dt) / 26; // one frame flip per ~26 px travelled: legs follow speed
      const ph = Math.floor(this.runPhase) % 2;
      return { pose: { feet: ph ? 1 : 2, tilt: this.face > 0 ? 1 : -1 }, key: `run${ph}${this.face}` };
    }
    return null;
  }

  // ---- animation loop
  private poseFor(now: number, dt: number): { name: FrameName | 'idle'; pose: Pose; key: string } {
    const st = this.machine.state;
    const rm = prefersReduced();
    const pick = (n: FrameName) => ({ name: n, pose: FRAMES[n] as Pose, key: n });
    if (this.move && !rm) {
      const m = this.move;
      if (m.kind === 'walk') return pick(Math.floor(now / 140) % 2 ? 'walk1' : 'walk2');
      const t = (now - m.start) / m.dur;
      return pick(t < 0.15 || t > 0.9 ? 'hopSquash' : 'hopStretch');
    }
    if (!rm && !this.coarse) { const lp = this.locoPose(now, dt); if (lp) return { name: 'idle', pose: lp.pose, key: lp.key }; }
    if (st === 'dancing') return pick(`dance${Math.floor(now / 150) % 4}` as FrameName);
    if (st === 'overcharge') return pick(Math.floor(now / 120) % 2 ? 'overcharge' : 'idleA');
    if (st === 'dozing') {
      const z = rm ? undefined : Math.floor(now / 500) % 4;
      return { name: 'doze', pose: { ...FRAMES.doze, z }, key: `doze${z}` };
    }
    if (st === 'inspecting') return pick('inspect');
    if (st === 'entering' && !rm) return pick(Math.floor(now / 260) % 2 ? 'wave1' : 'wave0');
    if (now < this.flashUntil) return pick('inspect');
    if (this.wave && ['idle', 'cooldown'].includes(st)) return pick(rm ? 'wave0' : Math.floor(now / 350) % 2 ? 'wave1' : 'wave0');
    if (now > this.nextBlink) { this.blinkUntil = now + 150; this.nextBlink = now + 3000 + Math.random() * 3500; }
    if (now < this.blinkUntil) return pick('blink');
    const ptr = this.pointerDoc();
    if (!rm && ptr && ['idle', 'cooldown', 'talking'].includes(st)) {
      const dx = ptr.x - this.pos.x;
      if (dx > 90) return pick('lookRight');
      if (dx < -90) return pick('lookLeft');
    }
    if (rm) return pick('idleA');
    return pick(Math.floor(now / 600) % 2 ? 'idleB' : 'idleA');
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const m = this.move;
    if (m) {
      const t = Math.min(1, (now - m.start) / m.dur);
      this.pos = { x: m.from.x + (m.to.x - m.from.x) * t, y: m.from.y + (m.to.y - m.from.y) * t - (m.kind === 'hop' ? Math.sin(Math.PI * t) * m.lift : 0) };
      if (t >= 1) { this.pos = { ...m.to }; this.move = null; this.gid = this.resolveGid(); m.done(); }
    } else if (!this.coarse && !prefersReduced()) { this.checkLayout(); this.stepFollow(now, dt); }
    const { canvas } = this.els;
    const s = this.scale;
    // whole CSS pixels: no sub-pixel shimmer
    canvas.style.transform = `translate(${Math.round(this.pos.x - (OX + 8) * s)}px, ${Math.round(this.pos.y - (OY + SH) * s)}px)`;
    // hard rule: the sprite is never seen over content; if a box ever touches it (layout shift, edge case), hide until clear
    const sb = boxAt(this.pos.x, this.pos.y, this.sprite);
    const over = !this.perchRect && this.content.some((c) => sb.x < c.rect.x + c.rect.w && sb.x + sb.w > c.rect.x && sb.y < c.rect.y + c.rect.h && sb.y + sb.h > c.rect.y);
    if (over !== (canvas.style.visibility === 'hidden')) { canvas.style.visibility = over ? 'hidden' : ''; if (over) this.needRetarget = true; }
    this.placeBubbleEl();

    const p = this.poseFor(now, dt);
    const rm = prefersReduced();
    const orbIdx = rm ? 0 : Math.floor(now / 170) % 4;
    const bright = p.name === 'inspect' || p.name === 'overcharge';
    const key = `${p.key}|${orbIdx}|${this.tint}|${bright}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        draw(ctx, p.pose, { t: rm ? 0 : now, tint: this.tint ?? undefined, bright, staticOrb: rm });
      }
    }
  };

  // ---- events
  private listen() {
    const on = (t: Window | Document | HTMLElement, e: string, f: (ev: any) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(e, f, o);
      this.cleanup.push(() => t.removeEventListener(e, f, o));
    };
    on(document, 'pointermove', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      this.ptrClient = { x: e.clientX, y: e.clientY };
      this.machine.input();
      if (prefersReduced()) this.rmRest();
    });
    on(document, 'pointerover', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const t = (e.target as Element | null)?.closest?.('[data-tile]') as HTMLElement | null;
      const id = t?.dataset.tile ?? null;
      if (id !== this.hoverTile) { this.hoverTile = id; this.machine.pointerTile(id); }
    });
    on(document.documentElement, 'pointerleave', () => { this.hoverTile = null; this.machine.pointerTile(null); });
    on(window, 'scroll', () => { this.quiet.scrolled(); this.machine.input(); this.needRetarget = true; this.debounce('scroll', 220, () => this.afterScroll()); }, { passive: true });
    on(window, 'resize', () => this.debounce('resize', 200, () => {
      this.scale = this.coarse || innerWidth < 720 ? 2 : 3;
      this.els.canvas.style.width = `${W * this.scale}px`; this.els.canvas.style.height = `${H * this.scale}px`;
      this.refreshIndex();
      if (this.machine.state !== 'perched' && (this.coarse || !this.index?.grounds.some((g) => g.id === this.gid))) { this.homeKey = ''; const a = this.homeAnchor(); this.pos = { x: a.x, y: a.y }; this.surface = a.surface; this.homeKey = a.key; this.gid = this.resolveGid(); }
      this.needRetarget = true;
    }));
    on(window, 'keydown', (e: KeyboardEvent) => {
      this.machine.input();
      if (this.konami.feed(e.key)) this.machine.konami();
    });
    on(this.els.canvas, 'click', (e: MouseEvent) => {
      const r = this.els.canvas.getBoundingClientRect();
      const c = Math.floor((e.clientX - r.left) / this.scale), rr = Math.floor((e.clientY - r.top) / this.scale);
      if (isOrbCell(c, rr, this.machine.state === 'inspecting')) {
        this.flashUntil = performance.now() + 160; this.lastKey = '';
        this.machine.orbClick();
      } else this.machine.clickProbe();
    });
    on(document, 'click', (e: MouseEvent) => {
      const pip = (e.target as Element).closest?.('[data-pip]') as HTMLElement | null;
      if (pip) this.machine.explain(pip.dataset.pip!);
    });
    on(window, 'panel:open', (e: CustomEvent) => {
      const r = e.detail?.rect;
      if (!r) return;
      const left = r.left ?? r.x, top = r.top ?? r.y;
      this.perchRect = { x: left + scrollX, y: top + scrollY, w: r.width ?? 0, h: r.height ?? 0 };
      this.machine.panelOpen();
    });
    on(window, 'panel:close', () => { this.machine.panelClose(); this.refreshIndex(); });
    if (this.els.layer.dataset.bound !== '1') this.els.layer.dataset.bound = '1';
  }

  /** Reduced motion: no walking; after the pointer rests, cross-fade to the nearest free spot. */
  private rmRest() {
    clearTimeout(this.rmTimer);
    this.rmTimer = setTimeout(() => {
      if (this.destroyed || !this.index || !this.canFollowX() || this.move) return;
      const ptr = this.pointerDoc(); if (!ptr) return;
      const t = chooseSpot(this.index, ptr, this.viewport, this.gid ? this.curSpot : undefined);
      if (!t || (t.gid === this.gid && Math.abs(t.x - this.pos.x) < 120)) return;
      this.moveTo({ key: 'rm', surface: t.gid, x: t.x, y: t.y, kind: 'park' }, () => {});
    }, 350);
  }

  private deb = new Map<string, ReturnType<typeof setTimeout>>();
  private debounce(k: string, ms: number, f: () => void) {
    clearTimeout(this.deb.get(k));
    this.deb.set(k, setTimeout(() => !this.destroyed && f(), ms));
  }

  private afterScroll() {
    const st = this.machine.state;
    if (st === 'perched') return;
    if (this.coarse || innerWidth < 720) {
      if (['idle', 'cooldown'].includes(st)) this.placeHome(false);
    }
  }
}
