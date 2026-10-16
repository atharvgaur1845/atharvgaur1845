// Registry of generated figures.
import * as cxx from './cuhk-x';
import * as rex from './reo2-floor';
import * as bbx from './bidbrain';
import * as lmx from './lam';
import * as flx from './flashlob';
import * as fwx from './flow-game';
import * as ndx from './neural-debris';
import * as bdx from './bdh-narrative';
export const FIGURES = {
  'cuhk-x': cxx,
  'reo2-floor': rex,
  'bidbrain': bbx,
  'lam': lmx,
  'flashlob': flx,
  'flow-game': fwx,
  'neural-debris': ndx,
  'bdh-narrative': bdx,
} as const;
export type FigureId = keyof typeof FIGURES;
