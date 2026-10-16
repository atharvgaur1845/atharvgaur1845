import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Machine, T, type Host, type State } from '../src/companion/machine';
import { Session, Taps, REPEAT_MS, type Globals, type LineMap } from '../src/companion/lines';

const globals: Globals = { firstVisit: 'hi', off: 'bye', on: 'back', orb: 'orb!', konami: 'cab', hint: 'hint', panelHint: 'phint' };
const mk = (n: number): LineMap =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { kind: 'research', locked: false, dwell: `d${i}`, click: `c${i}` }])) as LineMap;

function setup(n = 10, opts: { canSpeak?: () => boolean; walkDelay?: number; reduced?: boolean } = {}) {
  const said: (string | null)[] = [];
  const states: State[] = [];
  const host: Host = {
    say: (t) => said.push(t),
    perch: vi.fn(),
    unperch: (d) => setTimeout(d, 220),
    onState: (s) => states.push(s),
    canSpeak: opts.canSpeak ?? (() => true),
  };
  const m = new Machine(host, { lines: mk(n), globals, session: new Session(), taps: new Taps(), reduced: () => !!opts.reduced });
  return { m, said, states, host };
}
const ms = (n: number) => vi.advanceTimersByTime(n);
/** hover a tile and let the whole notice -> walk -> talk sequence run */
function explainByHover(m: Machine, id: string) {
  m.pointerTile(id);
  ms(T.DWELL);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('lifecycle', () => {
  it('enters, greets, then idles', () => {
    const { m, said } = setup();
    m.enable('on');
    expect(m.state).toBe('entering');
    ms(T.ENTER);
    expect(m.state).toBe('idle');
    expect(said).toContain('back');
  });
  it('page load without greeting stays silent', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER);
    expect(said).toEqual([]);
  });
  it('off: says the off line, then hidden after the fade', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER);
    m.disable();
    expect(m.state).toBe('leaving');
    expect(said.at(-1)).toBe('bye');
    ms(T.LEAVE - 1); expect(m.state).toBe('leaving');
    ms(1); expect(m.state).toBe('hidden');
  });
  it('unmounted work: no timers remain once hidden', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER); m.disable(); ms(T.LEAVE);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('hover to talk', () => {
  it('~450 ms on a tile explains it, no click and no walk first', () => {
    const { m, said, states } = setup();
    m.enable(null); ms(T.ENTER);
    m.pointerTile('t1');
    ms(T.DWELL - 1); expect(m.state).toBe('idle');
    ms(1); expect(m.state).toBe('talking');
    expect(said.at(-1)).toBe('d1');
    expect(states.slice(-1)).toEqual(['talking']);
  });
  it('leaving before the dwell cancels', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER);
    m.pointerTile('t1'); ms(300); m.pointerTile(null); ms(2000);
    expect(m.state).toBe('idle');
  });
  it('talks 5 s then cools down 3 s', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER);
    explainByHover(m, 't1');
    expect(m.state).toBe('talking');
    ms(T.TALK); expect(m.state).toBe('cooldown'); expect(said.at(-1)).toBeNull();
    ms(T.COOLDOWN - 1); expect(m.state).toBe('cooldown');
    ms(1); expect(m.state).toBe('idle');
  });
  it('pointer leaving the tile ends the talk early', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER); explainByHover(m, 't1');
    m.pointerTile(null);
    expect(m.state).toBe('cooldown');
  });
  it('no new bubble during the 3 s cooldown; one starts when it ends if still hovering a new tile', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER); explainByHover(m, 't1');
    ms(T.TALK);
    m.pointerTile('t2'); ms(2000);
    expect(m.state).toBe('cooldown');
    expect(said).not.toContain('d2');
    ms(T.COOLDOWN - 2000 + T.DWELL + 5);
    expect(said).toContain('d2');
  });
  it('a tile is not repeated within 60 s but may repeat after', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER);
    explainByHover(m, 't1'); ms(T.TALK + T.COOLDOWN);
    m.pointerTile(null); m.pointerTile('t1'); ms(5000);
    expect(said.filter((s) => s === 'd1')).toHaveLength(1);
    m.pointerTile(null); ms(REPEAT_MS);
    m.input(Date.now());
    m.pointerTile('t1'); ms(T.DWELL + 1);
    expect(said.filter((s) => s === 'd1')).toHaveLength(2);
  });
  it('there is no per-visit cap: ten different tiles all get explained', () => {
    const { m, said } = setup(12);
    m.enable(null); ms(T.ENTER);
    for (let i = 0; i < 10; i++) { m.pointerTile(null); explainByHover(m, `t${i}`); ms(T.TALK + T.COOLDOWN); m.input(Date.now()); }
    expect(said.filter((s) => /^d\d$/.test(s ?? ''))).toHaveLength(10);
  });
  it('waits while the user scrolls or selects text', () => {
    let ok = false;
    const { m, said } = setup(10, { canSpeak: () => ok });
    m.enable(null); ms(T.ENTER);
    m.pointerTile('t1'); ms(T.DWELL + 400);
    expect(said).not.toContain('d1');
    ok = true; ms(T.SPEAK_RETRY + 1);
    expect(said).toContain('d1');
  });
  it('unknown tiles (no lines) are ignored', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER); m.pointerTile('nope'); ms(3000);
    expect(m.state).toBe('idle');
  });
  it('coarse pointer ignores hover', () => {
    const { m } = setup();
    m.setCoarse(true); m.enable(null); ms(T.ENTER); m.pointerTile('t1'); ms(3000);
    expect(m.state).toBe('idle');
  });
});

describe('idle behaviour', () => {
  it('inspects the orb after 20 s for 2 s', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER);
    ms(T.INSPECT_AFTER); expect(m.state).toBe('inspecting');
    ms(T.INSPECT); expect(m.state).toBe('idle');
  });
  it('dozes after 60 s and wakes on input', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER);
    ms(T.DOZE_AFTER); expect(m.state).toBe('dozing');
    m.input(Date.now()); expect(m.state).toBe('idle');
  });
  it('input resets the idle clock', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER);
    ms(15000); m.input(Date.now()); ms(15000);
    expect(m.state).toBe('idle');
    ms(5000); expect(m.state).toBe('inspecting');
  });
});

describe('secrets and panel', () => {
  it('orb clicked 5 times within 3 s overcharges for 1.2 s', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER);
    const t = Date.now();
    for (let i = 0; i < 4; i++) m.orbClick(t + i * 500);
    expect(m.state).toBe('idle');
    m.orbClick(t + 2000);
    expect(m.state).toBe('overcharge'); expect(said.at(-1)).toBe('orb!');
    ms(T.OVERCHARGE); expect(m.state).toBe('idle');
  });
  it('5 clicks spread over more than 3 s do nothing', () => {
    const { m } = setup();
    m.enable(null); ms(T.ENTER);
    const t = Date.now();
    for (let i = 0; i < 5; i++) m.orbClick(t + i * 1000);
    expect(m.state).toBe('idle');
  });
  it('konami dances 3 s then says the line; reduced motion skips the dance', () => {
    const a = setup(); a.m.enable(null); ms(T.ENTER);
    a.m.konami(); expect(a.m.state).toBe('dancing');
    ms(T.DANCE); expect(a.m.state).toBe('idle'); expect(a.said.at(-1)).toBe('cab');
    const b = setup(10, { reduced: true }); b.m.enable(null); ms(T.ENTER);
    b.m.konami(); expect(b.m.state).not.toBe('dancing'); expect(b.said.at(-1)).toBe('cab');
  });
  it('panel open perches silently; click gives one hint; close returns', () => {
    const { m, said, host } = setup();
    m.enable(null); ms(T.ENTER);
    m.panelOpen();
    expect(m.state).toBe('perched'); expect(host.perch).toHaveBeenCalled(); expect(said.at(-1)).toBeNull();
    m.clickProbe(); expect(said.at(-1)).toBe('phint');
    ms(T.MANUAL); expect(said.at(-1)).toBeNull();
    m.panelClose(); ms(220); expect(m.state).toBe('idle');
  });
  it('click while talking gives the click line; pip taps alternate dwell and click', () => {
    const { m, said } = setup();
    m.enable(null); ms(T.ENTER); explainByHover(m, 't3');
    m.clickProbe(); expect(said.at(-1)).toBe('c3');
    m.explain('t5'); expect(said.at(-1)).toBe('d5');
    m.explain('t5'); expect(said.at(-1)).toBe('c5');
  });
});
