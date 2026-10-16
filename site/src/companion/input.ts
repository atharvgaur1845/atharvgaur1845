// Input helpers: Konami detection, pointer-kind detection, scroll/selection quiet windows.
const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export class KonamiDetector {
  private i = 0;
  /** Feed a KeyboardEvent.key. Returns true when the full code has been entered. */
  feed(key: string): boolean {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === SEQ[this.i]) this.i += 1;
    else this.i = k === SEQ[0] ? 1 : 0;
    if (this.i === SEQ.length) { this.i = 0; return true; }
    return false;
  }
}

/** True while the user scrolled less than `quiet` ms ago or has a non-empty text selection. */
export class Quiet {
  private last = -1e9;
  constructor(private now: () => number = () => Date.now(), private quiet = 300) {}
  scrolled() { this.last = this.now(); }
  get scrolling() { return this.now() - this.last < this.quiet; }
  get selecting() {
    try { return !!(typeof getSelection === 'function' && getSelection()?.toString()); } catch { return false; }
  }
  get ok() { return !this.scrolling && !this.selecting; }
}

export const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
