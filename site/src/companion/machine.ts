// Probe state machine (spec 10.2). Pure logic: the host performs movement and drawing.
import { MAX_AUTO, type Globals, type Kind, type LineMap, type Session, type Taps } from './lines';

export type State =
  | 'hidden' | 'entering' | 'idle' | 'noticing' | 'walking' | 'talking' | 'cooldown'
  | 'inspecting' | 'dozing' | 'perched' | 'leaving' | 'overcharge' | 'dancing';

export const T = {
  DWELL: 600, NOTICE: 300, TALK: 5000, COOLDOWN: 8000, INSPECT_AFTER: 20000, INSPECT: 2000,
  DOZE_AFTER: 60000, ENTER: 700, LEAVE: 1900, OVERCHARGE: 1200, DANCE: 3000, ORB_CLICKS: 5, ORB_WINDOW: 3000,
  SPEAK_RETRY: 200, MANUAL: 4500,
} as const;

export interface Host {
  /** Move beside the tile. done(true) once Probe stands at its spot, done(false) if it has to stay put. */
  walkToTile(id: string, done: (moved: boolean) => void): void;
  /** Show (text) or hide (null) the bubble. */
  say(text: string | null, kind: Kind | null): void;
  perch(): void;
  /** Hop back to the shelf spot Probe left. */
  unperch(done: () => void): void;
  onState(next: State, prev: State): void;
  canSpeak(): boolean;
}

export interface Options { lines: LineMap; globals: Globals; session: Session; taps: Taps; reduced?: () => boolean }

type Tm = ReturnType<typeof setTimeout>;

export class Machine {
  state: State = 'hidden';
  private hover: string | null = null;
  private target: string | null = null;
  private focus: string | null = null; // tile Probe last talked about
  private timers = new Map<string, Tm>();
  private orbClicks: number[] = [];
  private lastReset = -1e9;
  private coarse = false;

  constructor(private host: Host, private o: Options) {}

  // ---- helpers
  private set(name: string, ms: number, fn: () => void) {
    this.clear(name);
    this.timers.set(name, setTimeout(() => { this.timers.delete(name); fn(); }, ms));
  }
  private clear(name: string) {
    const t = this.timers.get(name);
    if (t !== undefined) { clearTimeout(t); this.timers.delete(name); }
  }
  private go(s: State) {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.host.onState(s, prev);
  }
  private get active() { return this.state !== 'hidden' && this.state !== 'leaving'; }
  private get calm() { return this.state === 'idle' || this.state === 'cooldown'; }
  private reduced() { return !!this.o.reduced?.(); }

  setCoarse(c: boolean) { this.coarse = c; }

  // ---- lifecycle
  enable(greeting: 'first' | 'on' | null) {
    if (this.active) return;
    this.go('entering');
    this.set('enter', T.ENTER, () => {
      this.go('idle');
      if (greeting) this.speakManual(greeting === 'first' ? this.o.globals.firstVisit : this.o.globals.on, null);
      this.armIdle();
    });
  }

  disable() {
    if (!this.active) return;
    this.clearAll();
    this.go('leaving');
    this.host.say(this.o.globals.off, null);
    this.set('leave', T.LEAVE, () => { this.host.say(null, null); this.go('hidden'); });
  }

  private clearAll() {
    for (const k of [...this.timers.keys()]) this.clear(k);
  }

  // ---- input
  /** Any pointer move, key press or click. Wakes Probe and restarts the idle clocks. */
  input(now = Date.now()) {
    if (!this.active) return;
    if (this.state === 'dozing') { this.go('idle'); this.armIdle(); this.lastReset = now; return; }
    if (now - this.lastReset < 250) return;
    this.lastReset = now;
    if (this.calm || this.state === 'talking') this.armIdle();
  }

  private armIdle() {
    this.set('inspect', T.INSPECT_AFTER, () => {
      if (!this.calm) return this.armIdle();
      this.go('inspecting');
      this.set('inspect-end', T.INSPECT, () => { if (this.state === 'inspecting') this.go('idle'); });
    });
    this.set('doze', T.DOZE_AFTER, () => {
      if (this.calm || this.state === 'inspecting') { this.clear('inspect-end'); this.go('dozing'); }
      else this.armIdle();
    });
  }

  /** Pointer entered a tile (id) or left every tile (null). Ignored in coarse mode. */
  pointerTile(id: string | null) {
    if (this.coarse) return;
    const prev = this.hover;
    this.hover = id;
    if (!this.active) return;
    if (id === null || id !== prev) this.clear('dwell');
    if (id === null && this.state === 'talking' && this.autoTalk && prev === this.target) this.endTalk();
    if (id !== null) this.maybeDwell();
  }

  private autoTalk = false;

  private eligible(id: string | null): id is string {
    return !!id && !!this.o.lines[id] && !this.o.session.has(id) && !this.o.session.capped;
  }

  private maybeDwell() {
    if (this.state !== 'idle' || !this.eligible(this.hover) || this.target === this.hover) return;
    const id = this.hover;
    this.set('dwell', T.DWELL, () => {
      if (this.state !== 'idle' || this.hover !== id) return;
      this.target = id;
      this.go('noticing');
      this.set('notice', T.NOTICE, () => this.startWalk(id));
    });
  }

  private startWalk(id: string) {
    if (this.state !== 'noticing') return;
    if (this.hover !== id) return this.abort();
    this.go('walking');
    this.host.walkToTile(id, () => this.arrive(id));
  }

  private abort() {
    this.target = null;
    this.go('idle');
    this.maybeDwell();
  }

  private arrive(id: string, tries = 0) {
    if (this.state !== 'walking') return;
    if (this.hover !== id) return this.abort(); // retarget only after arrival
    if (!this.host.canSpeak()) {
      if (tries > 15) return this.abort();
      this.set('speak-retry', T.SPEAK_RETRY, () => this.arrive(id, tries + 1));
      return;
    }
    const l = this.o.lines[id];
    this.o.session.recordAuto(id);
    this.focus = id;
    this.autoTalk = true;
    this.go('talking');
    this.host.say(l.dwell, l.kind);
    this.set('talk', T.TALK, () => this.endTalk());
  }

  private endTalk() {
    if (this.state !== 'talking') return;
    this.clear('talk');
    this.host.say(null, null);
    this.autoTalk = false;
    this.target = null;
    this.go('cooldown');
    this.set('cooldown', T.COOLDOWN, () => { if (this.state === 'cooldown') { this.go('idle'); this.maybeDwell(); } });
  }

  // ---- manual interactions (never counted toward the auto cap or cooldown)
  private speakManual(text: string, kind: Kind | null) {
    this.host.say(text, kind);
    this.set('manual', T.MANUAL, () => {
      this.host.say(null, null);
      if (this.state === 'talking' && !this.autoTalk) this.go('idle');
    });
  }

  private canManual() {
    return ['idle', 'cooldown', 'talking', 'dozing', 'inspecting', 'perched'].includes(this.state);
  }

  /** Probe itself was clicked or tapped. */
  clickProbe() {
    if (!this.active) return;
    if (this.state === 'dozing') { this.go('idle'); this.armIdle(); return; }
    if (!this.canManual()) return;
    if (this.state === 'perched') return this.speakManual(this.o.globals.panelHint, null);
    const id = this.focus;
    if ((this.state === 'talking' || this.state === 'cooldown') && id && this.o.lines[id]) {
      const l = this.o.lines[id];
      this.clear('talk');
      this.autoTalk = false;
      return this.speakManual(l.click, l.kind);
    }
    this.speakManual(this.o.globals.hint, null);
  }

  /** Touch "?" pip: explain that tile. Alternates dwell and click lines on repeat taps. */
  explain(id: string) {
    if (!this.active || !this.o.lines[id]) return;
    if (!this.canManual()) return;
    this.clearAll();
    this.autoTalk = false;
    this.focus = id;
    const l = this.o.lines[id];
    if (this.state !== 'talking') this.go('talking');
    this.speakManual(this.o.taps.next(l, id), l.kind);
    this.armIdle();
  }

  orbClick(now = Date.now()) {
    if (!this.active || !(this.calm || this.state === 'inspecting' || this.state === 'talking')) return;
    this.orbClicks = this.orbClicks.filter((t) => now - t <= T.ORB_WINDOW);
    this.orbClicks.push(now);
    if (this.orbClicks.length >= T.ORB_CLICKS) {
      this.orbClicks = [];
      this.clearAll();
      this.autoTalk = false;
      this.go('overcharge');
      this.host.say(this.o.globals.orb, null);
      this.set('overcharge', T.OVERCHARGE, () => { this.host.say(null, null); this.go('idle'); this.armIdle(); });
    }
  }

  konami() {
    if (!this.active || !(this.calm || this.state === 'inspecting' || this.state === 'dozing')) return;
    this.clearAll();
    if (this.reduced()) { this.go('idle'); this.speakManual(this.o.globals.konami, null); this.armIdle(); return; }
    this.go('dancing');
    this.set('dance', T.DANCE, () => {
      this.go('idle');
      this.speakManual(this.o.globals.konami, null);
      this.armIdle();
    });
  }

  // ---- panel perch
  panelOpen() {
    if (!this.active) return;
    this.clearAll();
    this.autoTalk = false;
    this.host.say(null, null);
    this.go('perched');
    this.host.perch();
  }

  panelClose() {
    if (this.state !== 'perched') return;
    this.host.say(null, null);
    this.host.unperch(() => { if (this.state === 'perched') { this.go('idle'); this.armIdle(); this.maybeDwell(); } });
  }

  get autoCount() { return Math.min(MAX_AUTO, this.o.session.count); }
}
