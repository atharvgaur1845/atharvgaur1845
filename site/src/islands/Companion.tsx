import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../companion/companion.css';
import { Controller } from '../companion/controller';
import type { Globals, LineMap } from '../companion/lines';
import { PREF_EVENT, getOn, markSeen, seenBefore } from '../companion/pref';
import { W, H } from '../companion/sprite';

export interface ProbeData { lines: LineMap; globals: Globals }

function readData(): ProbeData | null {
  try { return JSON.parse(document.getElementById('probe-data')?.textContent ?? 'null'); } catch { return null; }
}

/** React shell: renders the layer only while Probe is on; the Controller does the imperative work. */
export default function Companion({ lazy = false }: { lazy?: boolean }) {
  const [on, setOn] = useState(false);
  const greeting = useRef<'first' | 'on' | null>(null);
  const ctl = useRef<Controller | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const bang = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const begin = (g: 'first' | 'on' | null) => { greeting.current = g; setOn(true); };
    if (lazy) { markSeen(); begin('on'); }
    else if (getOn()) { const first = !seenBefore(); markSeen(); begin(first ? 'first' : null); }
    const onPref = (e: Event) => {
      const next = (e as CustomEvent).detail.on as boolean;
      if (next) { markSeen(); begin('on'); } else ctl.current?.stop();
    };
    window.addEventListener(PREF_EVENT, onPref);
    return () => window.removeEventListener(PREF_EVENT, onPref);
  }, [lazy]);

  useLayoutEffect(() => {
    if (!on || !layer.current || !canvas.current || !bubble.current || !bang.current) return;
    const data = readData();
    if (!data) return;
    const c = new Controller(
      { layer: layer.current, canvas: canvas.current, bubble: bubble.current, bang: bang.current },
      data.lines, data.globals, () => setOn(false),
    );
    ctl.current = c;
    c.start(greeting.current);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__probeDev = {
        perch() {
          const d = document.createElement('div');
          d.id = 'probe-dev-panel';
          Object.assign(d.style, { position: 'fixed', left: '15vw', top: '14vh', width: '70vw', height: '70vh', zIndex: '80', background: 'var(--surface)', border: '2px solid var(--ink)', borderRadius: '12px' });
          document.body.appendChild(d);
          window.dispatchEvent(new CustomEvent('panel:open', { detail: { rect: d.getBoundingClientRect() } }));
        },
        unperch() { document.getElementById('probe-dev-panel')?.remove(); window.dispatchEvent(new CustomEvent('panel:close')); },
      };
    }
    return () => { c.destroy(); ctl.current = null; };
  }, [on]);

  if (!on) return null;
  return (
    <div ref={layer} className="probe-layer" aria-hidden="true">
      <canvas ref={canvas} className="probe-c" width={W} height={H} />
      <div ref={bubble} className="probe-bubble" data-side="above" hidden />
      <div ref={bang} className="probe-bang" hidden>!</div>
    </div>
  );
}
