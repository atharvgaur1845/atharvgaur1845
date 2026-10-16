import { useEffect } from 'react';
import { PanelHost as Host } from '../panel/host';

/** Island: wires panel behaviour. Renders nothing; the panel markup is server-rendered. */
export default function PanelHost() {
  useEffect(() => {
    const h = new Host();
    h.start();
    (window as unknown as { __panel?: Host }).__panel = h;
    return () => h.destroy();
  }, []);
  return null;
}
