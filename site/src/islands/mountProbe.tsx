// Notes pages: Probe stays unloaded until the visitor asks for it.
import { createRoot } from 'react-dom/client';
import Companion from './Companion';

let root: ReturnType<typeof createRoot> | null = null;
export function mountProbe() {
  if (root) return;
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<Companion lazy />);
}
