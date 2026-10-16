// Imperative driver: DOM, animation loop, movement and event wiring around the Machine.
import { Machine, type Host, type State } from './machine';
import { KIND_COLOUR, Session, Taps, type Globals, type Kind, type LineMap } from './lines';
import { KonamiDetector, Quiet, isCoarse, prefersReduced } from './input';
import {
  BUBBLE, chooseAnchor, coarseAnchor, measure, placeBubble,
  type Anchor, type Pt, type Rect,
} from './placement';
import { FRAMES, OX, OY, SH, W, H, draw, isOrbCell, type FrameName, type Pose } from './sprite';

export interface Els { layer: HTMLElement; canvas: HTMLCanvasElement; bubble: HTMLElement; bang: HTMLElement }
interface Move { kind: 'walk' | 'hop'; from: Pt; to: Pt; start: number; dur: number; lift: number; done: () => void }

const NAV = 48;
const WALK_PX_S = 180;
const HOP_MS = 220;

export class Controller {
  machine: Machine;
  private pos: Pt = { x: 0, y: 0 };
  private surface = '';
  private saved: { pos: Pt; surface: string } | null = null;
  private move: Move | null = null;
  private raf = 0;
  private scale = 3;
  private coarse = false;
  private pointer: Pt | undefined;
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

  constructor(private els: Els, lines: LineMap, globals: Globals, private onHidden: () => void) {
    const kv = (() => { try { return sessionStorage; } catch { return undefined; } })();
    const host: Host = {
      walkToTile: (id, done) => this.walkToTile(id, done),
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
    this.listen();
    this.nextBlink = performance.now() + 2500;
    this.machine.enable(greeting);
    const w = document.querySelector<HTMLElement>('.p-root[data-open] .p-win');
    if (w) { const r = w.getBoundingClientRect(); this.perchRect = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; this.machine.panelOpen(); }
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

  // ---- movement
  private moveTo(a: Anchor, done: () => void) {
    const to = { x: a.x, y: a.y };
    if (prefersReduced()) {
      this.els.canvas.style.opacity = '0';
      this.after(75, () => { this.pos = to; this.surface = a.surface; this.els.canvas.style.opacity = '1'; this.after(75, done); });
      return;
    }
    const dx = Math.abs(to.x - this.pos.x);
    const same = a.surface === this.surface && dx <= 700;
    this.move = same
      ? { kind: 'walk', from: { ...this.pos }, to, start: performance.now(), dur: Math.max(60, (dx / WALK_PX_S) * 1000), lift: 0, done }
      : { kind: 'hop', from: { ...this.pos }, to, start: performance.now(), dur: HOP_MS, lift: Math.min(90, 36 + Math.hypot(to.x - this.pos.x, to.y - this.pos.y) * 0.08), done };
    this.surface = a.surface;
  }

  private walkToTile(id: string, done: (moved: boolean) => void) {
    const lay = measure();
    const pick = chooseAnchor(lay, id, { pointer: this.pointer, viewport: this.viewport, sprite: this.sprite, from: this.pos });
    if (!pick) { done(false); return; }
    this.moveTo(pick.anchor, () => done(true));
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
    const finish = () => { this.els.layer.classList.remove('perched'); done(); };
    if (!s) { finish(); return; }
    this.moveTo({ key: 'back', surface: s.surface, x: s.pos.x, y: s.pos.y, kind: 'park' }, finish);
  }

  // ---- bubble
  private say(text: string | null, kind: Kind | null) {
    const b = this.els.bubble;
    this.tint = text && kind ? KIND_COLOUR[kind] : null;
    if (!text) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = text;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.placeBubbleEl();
  }

  private placeBubbleEl() {
    const b = this.els.bubble;
    if (b.hidden) return;
    const w = Math.min(BUBBLE.w, b.offsetWidth || BUBBLE.w), h = b.offsetHeight || 40;
    const sp = this.sprite;
    const v = this.viewport;
    const bad: Rect[] = [];
    const others: Rect[] = [];
    if (this.pointer) bad.push({ x: this.pointer.x - 24, y: this.pointer.y - 24, w: 48, h: 48 });
    const lay0 = measure();
    if (lay0.board) bad.push(lay0.board); // never cover the lab board with a bubble
    if (this.hoverTile) {
      const lay = measure();
      lay.tiles.find((t) => t.id === this.hoverTile)?.avoid.forEach((r) => bad.push(r));
      bad.push(...lay.avoid);
      others.push(...lay.tiles.filter((t) => t.id !== this.hoverTile).flatMap((t) => t.avoid));
    }
    const base = { x: this.pos.x, y: this.pos.y };
    const bc = { viewport: v, sprite: sp, bubble: { w, h } };
    let r = placeBubble(base, bc, [...bad, ...others]) ?? placeBubble(base, bc, bad)
      ?? placeBubble(base, { viewport: v, sprite: sp, bubble: { w, h } }, []);
    if (this.coarse) {
      const ideal = base.y - sp.h - 10 - h;
      const clamped = ideal < v.y + 4;
      // not enough room above: sit beside Probe (to its left) so neither Probe nor card text is covered
      const x = clamped ? base.x - sp.w / 2 - 6 - w : base.x - w / 2;
      r = { x: Math.min(Math.max(x, v.x + 4), v.x + v.w - w - 4), y: Math.max(v.y + 4, ideal), w, h };
    }
    if (!r) {
      const x = Math.min(Math.max(base.x - w / 2, v.x + 4), v.x + v.w - w - 4);
      r = { x, y: Math.max(v.y + 4, base.y - sp.h - 8 - h), w, h };
    }
    b.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
    const beside = r.y + h > base.y - sp.h + 2 && r.y < base.y && (r.x + w <= base.x - sp.w / 2 || r.x >= base.x + sp.w / 2);
    const above = r.y + h <= base.y - sp.h + 2;
    b.dataset.side = beside ? (r.x < base.x ? 'left' : 'right') : above ? 'above' : 'below';
    b.style.setProperty('--tx', `${Math.round(Math.min(Math.max(base.x - r.x, 10), w - 18))}px`);
  }

  // ---- state hooks
  private onState(s: State, prev: State) {
    const { layer, bang } = this.els;
    layer.dataset.state = s;
    bang.hidden = s !== 'noticing';
    if (s === 'leaving') layer.classList.add('leaving');
    if (s === 'hidden') { this.onHidden(); }
    if (s === 'entering') this.startHopInPlace();
    if (prev === 'dozing') this.lastKey = '';
  }

  private startHopInPlace() {
    if (prefersReduced()) return;
    this.move = { kind: 'hop', from: { ...this.pos }, to: { ...this.pos }, start: performance.now(), dur: 360, lift: 34, done: () => {} };
  }

  // ---- animation loop
  private poseFor(now: number): { name: FrameName | 'idle'; pose: Pose; key: string } {
    const st = this.machine.state;
    const rm = prefersReduced();
    const pick = (n: FrameName) => ({ name: n, pose: FRAMES[n] as Pose, key: n });
    if (this.move && !rm) {
      const m = this.move;
      if (m.kind === 'walk') return pick(Math.floor(now / 140) % 2 ? 'walk1' : 'walk2');
      const t = (now - m.start) / m.dur;
      return pick(t < 0.15 || t > 0.9 ? 'hopSquash' : 'hopStretch');
    }
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
    if (!rm && this.pointer && ['idle', 'cooldown', 'talking', 'noticing'].includes(st)) {
      const dx = this.pointer.x - this.pos.x;
      if (dx > 90) return pick('lookRight');
      if (dx < -90) return pick('lookLeft');
    }
    if (rm) return pick('idleA');
    return pick(Math.floor(now / 600) % 2 ? 'idleB' : 'idleA');
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const m = this.move;
    if (m) {
      const t = Math.min(1, (now - m.start) / m.dur);
      this.pos = { x: m.from.x + (m.to.x - m.from.x) * t, y: m.from.y + (m.to.y - m.from.y) * t - (m.kind === 'hop' ? Math.sin(Math.PI * t) * m.lift : 0) };
      if (t >= 1) { this.pos = { ...m.to }; this.move = null; m.done(); }
    }
    const { canvas } = this.els;
    const s = this.scale;
    canvas.style.transform = `translate(${Math.round(this.pos.x - (OX + 8) * s)}px, ${Math.round(this.pos.y - (OY + SH) * s)}px)`;
    const bang = this.els.bang;
    if (!bang.hidden) bang.style.transform = `translate(${Math.round(this.pos.x - 4)}px, ${Math.round(this.pos.y - SH * s - 22)}px)`;
    if (m) this.placeBubbleEl();

    const p = this.poseFor(now);
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
      this.pointer = { x: e.pageX, y: e.pageY };
      this.machine.input();
    });
    on(document, 'pointerover', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const t = (e.target as Element | null)?.closest?.('[data-tile]') as HTMLElement | null;
      const id = t?.dataset.tile ?? null;
      if (id !== this.hoverTile) { this.hoverTile = id; this.machine.pointerTile(id); }
    });
    on(document.documentElement, 'pointerleave', () => { this.hoverTile = null; this.machine.pointerTile(null); });
    on(window, 'scroll', () => { this.quiet.scrolled(); this.machine.input(); this.debounce('scroll', 220, () => this.afterScroll()); }, { passive: true });
    on(window, 'resize', () => this.debounce('resize', 200, () => {
      this.scale = this.coarse || innerWidth < 720 ? 2 : 3;
      this.els.canvas.style.width = `${W * this.scale}px`; this.els.canvas.style.height = `${H * this.scale}px`;
      if (this.machine.state !== 'perched') { this.homeKey = ''; const a = this.homeAnchor(); this.pos = { x: a.x, y: a.y }; this.surface = a.surface; this.homeKey = a.key; }
      this.placeBubbleEl();
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
    on(window, 'panel:close', () => this.machine.panelClose());
    if (this.els.layer.dataset.bound !== '1') this.els.layer.dataset.bound = '1';
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
    } else if (this.surface === 'corner') {
      const a = this.fallbackAnchor(); this.pos = { x: a.x, y: a.y };
    }
    this.placeBubbleEl();
  }
}

