// Panel host: FLIP open/close, focus trap, inert background, history, scroll-spy, tooltips.
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const INERT = ['.nav', '#main', 'footer.foot', '.skip-link'];
const FOCUSABLE = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), input, select, textarea';

export class PanelHost {
  private cur: HTMLElement | null = null;
  private opener: HTMLElement | null = null;
  private pushed = false;
  private closing = false;
  private spy: { disconnect(): void } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    private phone = () => matchMedia('(max-width: 719px)').matches) {}

  get isOpen() { return !!this.cur; }

  private on(t: EventTarget, e: string, f: (ev: any) => void, o?: AddEventListenerOptions) {
    t.addEventListener(e, f, o);
    this.cleanup.push(() => t.removeEventListener(e, f, o));
  }

  // ---- locked (confidential) dialog
  private lkOpener: HTMLElement | null = null;
  private lkPushed = false;
  private lk() { return document.getElementById('lk-dialog') as HTMLDialogElement | null; }
  private openLocked(a: HTMLElement | null, id: string, name: string, q: string, push: boolean) {
    const d = this.lk(); if (!d) return;
    this.lkOpener = a;
    d.querySelector('#lk-name')!.textContent = name;
    d.querySelector('#lk-q')!.textContent = q;
    if (d.hasAttribute('open')) d.close();
    d.showModal();
    d.querySelector<HTMLElement>('#lk-title')?.focus({ preventScroll: true });
    if (push) { history.pushState({ lock: id }, '', `/p/${id}/`); this.lkPushed = true; }
  }

  start() {
    document.documentElement.setAttribute('data-panel-js', '');
    const d = this.lk();
    if (d) {
      d.addEventListener('close', () => {
        if (this.lkPushed) { this.lkPushed = false; history.back(); }
        else if (/^\/p\//.test(location.pathname)) history.replaceState(null, '', '/');
        const o = this.lkOpener ?? document.querySelector<HTMLElement>(`[data-lk="${d.dataset.openId}"]`);
        o?.focus({ preventScroll: true });
      });
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.querySelector('#lk-close')?.addEventListener('click', (e) => { e.preventDefault(); d.close(); });
      if (d.hasAttribute('open') && d.dataset.openId) { d.close(); d.showModal(); d.querySelector<HTMLElement>('#lk-title')?.focus({ preventScroll: true }); }
    }
    // deep link: panel already server-rendered open
    const open = document.querySelector<HTMLElement>('.p-root[data-open]');
    if (open) this.attach(open, false);
    this.on(document, 'click', (e: MouseEvent) => this.onClick(e));
    this.on(document, 'keydown', (e: KeyboardEvent) => {
      if (!this.cur) return;
      if (e.key === 'Escape') { e.preventDefault(); this.requestClose(); }
      else if (e.key === 'Tab') this.trap(e);
    });
    this.on(window, 'popstate', () => this.onPop());
  }

  destroy() { this.cleanup.forEach((f) => f()); this.spy?.disconnect(); }

  private panelFor(id: string) { return document.getElementById(`panel-${id}`); }

  private onClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target as Element;
    const close = t.closest?.('[data-close]');
    if (close && this.cur?.contains(close)) { e.preventDefault(); this.requestClose(); return; }
    const idx = t.closest?.('.p-idx a') as HTMLAnchorElement | null;
    if (idx && this.cur?.contains(idx)) {
      e.preventDefault();
      this.cur.querySelector(`#${CSS.escape(idx.dataset.spy!)}`)?.scrollIntoView({ behavior: this.reduced() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const lkA = t.closest?.('a[data-lk]') as HTMLAnchorElement | null;
    if (lkA && !this.cur) { e.preventDefault(); this.openLocked(lkA, lkA.dataset.lk!, lkA.dataset.name ?? '', lkA.dataset.q ?? '', true); return; }
    const a = t.closest?.('a[href^="/p/"]') as HTMLAnchorElement | null;
    if (!a || this.cur) return;
    const id = new URL(a.href).pathname.replace(/^\/p\/|\/$/g, '');
    const panel = this.panelFor(id);
    if (!panel) return;
    e.preventDefault();
    const tile = a.closest('[data-tile]') as HTMLElement | null;
    this.open(panel, a, (tile ?? a).getBoundingClientRect());
    history.pushState({ panel: id }, '', `/p/${id}/`);
    this.pushed = true;
  }

  private onPop() {
    const m = location.pathname.match(/^\/p\/([^/]+)\/$/);
    const d = this.lk();
    if (d) {
      const lkEl = m ? document.querySelector<HTMLElement>(`[data-lk="${m[1]}"]`) : null;
      if (lkEl && !d.open) { this.openLocked(lkEl, m![1], lkEl.dataset.name ?? '', lkEl.dataset.q ?? '', false); return; }
      if (!m && d.open) { this.lkPushed = false; d.close(); return; }
    }
    if (m && !this.cur) {
      const p = this.panelFor(m[1]);
      if (p) this.open(p, document.querySelector(`[data-tile="${m[1]}"] a`), null);
    } else if (!m && this.cur) this.close();
  }

  /** User asked to close: walk history back if we pushed, otherwise just replace the URL. */
  requestClose() {
    if (!this.cur || this.closing) return;
    if (this.pushed && history.state?.panel) { this.pushed = false; history.back(); }
    else { history.replaceState(null, '', '/'); this.close(); }
  }

  // ---- open
  open(panel: HTMLElement, opener: HTMLElement | null, from: DOMRect | null) {
    this.opener = opener;
    panel.hidden = false;
    panel.setAttribute('data-open', '');
    this.attach(panel, true, from);
  }

  private attach(panel: HTMLElement, animate: boolean, from: DOMRect | null = null) {
    this.cur = panel;
    const win = panel.querySelector<HTMLElement>('.p-win')!;
    INERT.forEach((s) => document.querySelectorAll(s).forEach((el) => el.setAttribute('inert', '')));
    this.watch(panel);
    this.tooltips(panel);
    this.swipe(panel);
    const rect = win.getBoundingClientRect(); // final geometry, measured before any FLIP transform
    if (animate) this.animateIn(panel, win, from);
    panel.querySelector<HTMLElement>('.p-title')?.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('panel:open', { detail: { rect } }));
  }

  private animateIn(panel: HTMLElement, win: HTMLElement, from: DOMRect | null) {
    const bd = panel.querySelector<HTMLElement>('.p-backdrop')!;
    panel.getAnimations({ subtree: true }).forEach((a) => a.cancel()); // never inherit a leftover fade from a previous close
    if (this.reduced()) {
      win.animate({ opacity: [0, 1] }, { duration: 150 });
      bd.animate({ opacity: [0, 1] }, { duration: 150 });
    } else if (this.phone()) {
      win.animate({ transform: ['translateY(100%)', 'none'] }, { duration: 240, easing: EASE });
      bd.animate({ opacity: [0, 1] }, { duration: 240 });
    } else if (from) {
      const to = win.getBoundingClientRect();
      win.animate([
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transformOrigin: 'top left', transform: 'none' },
      ], { duration: 280, easing: 'ease-out' });
      bd.animate({ opacity: [0, 1] }, { duration: 280 });
      win.querySelectorAll<HTMLElement>('.p-head, .p-idx, .p-body').forEach((el) =>
        el.animate({ opacity: [0, 1] }, { duration: 160, delay: 120, fill: 'backwards' }));
    } else {
      win.animate({ opacity: [0, 1] }, { duration: 150 });
    }
  }

  // ---- close
  close() {
    const panel = this.cur;
    if (!panel || this.closing) return;
    this.closing = true;
    const win = panel.querySelector<HTMLElement>('.p-win')!;
    const bd = panel.querySelector<HTMLElement>('.p-backdrop')!;
    const tileLink = this.opener ?? document.querySelector<HTMLElement>(`[data-tile="${panel.dataset.panel}"] a`);
    const tile = (tileLink?.closest('[data-tile]') as HTMLElement | null) ?? tileLink;
    window.dispatchEvent(new CustomEvent('panel:close'));
    tile?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const done = () => {
      panel.hidden = true;
      panel.removeAttribute('data-open');
      INERT.forEach((s) => document.querySelectorAll(s).forEach((el) => el.removeAttribute('inert')));
      this.spy?.disconnect();
      this.cur = null; this.closing = false;
      (tileLink as HTMLElement | null)?.focus({ preventScroll: true });
    };
    let anims: Animation[];
    if (this.reduced()) {
      anims = [win.animate({ opacity: [1, 0] }, { duration: 150, fill: 'forwards' }), bd.animate({ opacity: [1, 0] }, { duration: 150, fill: 'forwards' })];
    } else if (this.phone()) {
      anims = [win.animate({ transform: ['none', 'translateY(100%)'] }, { duration: 240, easing: EASE, fill: 'forwards' }), bd.animate({ opacity: [1, 0] }, { duration: 240, fill: 'forwards' })];
    } else if (tile) {
      const to = tile.getBoundingClientRect(), from = win.getBoundingClientRect();
      win.querySelectorAll<HTMLElement>('.p-head, .p-idx, .p-body').forEach((el) => el.animate({ opacity: [1, 0] }, { duration: 100, fill: 'forwards' }));
      anims = [win.animate([
        { transformOrigin: 'top left', transform: 'none' },
        { transformOrigin: 'top left', transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})` },
      ], { duration: 280, easing: 'ease-in', fill: 'forwards' }), bd.animate({ opacity: [1, 0] }, { duration: 280, fill: 'forwards' })];
    } else {
      anims = [win.animate({ opacity: [1, 0] }, { duration: 150, fill: 'forwards' })];
    }
    // the content fade-out uses fill: forwards; cancel every animation in the panel or a reopen stays at opacity 0
    const clear = () => { panel.getAnimations({ subtree: true }).forEach((a) => a.cancel()); };
    Promise.all(anims.map((a) => a.finished)).then(() => { clear(); done(); }, () => { clear(); done(); });
  }

  // ---- behaviour inside the panel
  private trap(e: KeyboardEvent) {
    const win = this.cur!.querySelector<HTMLElement>('.p-win')!;
    const f = [...win.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!win.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === win.querySelector('.p-title'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }

  private watch(panel: HTMLElement) {
    this.spy?.disconnect();
    const body = panel.querySelector<HTMLElement>('.p-body')!;
    const links = [...panel.querySelectorAll<HTMLAnchorElement>('.p-idx a')];
    const secs = links.map((l) => panel.querySelector<HTMLElement>(`#${CSS.escape(l.dataset.spy!)}`)).filter(Boolean) as HTMLElement[];
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = body.getBoundingClientRect().top + 48;
      const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
      let cur = secs[0];
      for (const s of secs) if (s.getBoundingClientRect().top <= y) cur = s;
      if (atEnd) cur = secs[secs.length - 1];
      links.forEach((l) => { if (l.dataset.spy === cur.id) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
      links.find((l) => l.dataset.spy === cur.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    body.addEventListener('scroll', on, { passive: true });
    this.spy = { disconnect: () => body.removeEventListener('scroll', on) };
  }

  private tooltips(panel: HTMLElement) {
    const tip = panel.querySelector<HTMLElement>('.p-tip');
    if (!tip || tip.dataset.bound) return;
    tip.dataset.bound = '1';
    const show = (el: Element, x: number, y: number) => {
      tip.textContent = (el as HTMLElement).dataset.tip ?? '';
      tip.classList.add('on');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      if (x + w > innerWidth - 8) x = Math.max(8, x - w - 28);
      if (y + h > innerHeight - 8) y = Math.max(8, y - h - 28);
      tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    };
    panel.addEventListener('pointermove', (e) => {
      const el = (e.target as Element).closest('[data-tip]');
      if (el) show(el, e.clientX + 14, e.clientY + 14); else tip.classList.remove('on');
    });
    panel.addEventListener('pointerleave', () => tip.classList.remove('on'));
    panel.addEventListener('focusin', (e) => {
      const el = (e.target as Element).closest?.('[data-tip]');
      if (el) { const r = el.getBoundingClientRect(); show(el, r.left, r.bottom + 8); }
    });
    panel.addEventListener('focusout', () => tip.classList.remove('on'));
  }

  /** Phones: swipe down on the top bar closes the sheet. */
  private swipe(panel: HTMLElement) {
    const head = panel.querySelector<HTMLElement>('.p-head');
    if (!head || head.dataset.swipe) return;
    head.dataset.swipe = '1';
    let y0 = 0;
    head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    head.addEventListener('touchend', (e) => { if (this.phone() && e.changedTouches[0].clientY - y0 > 80) this.requestClose(); }, { passive: true });
  }
}
