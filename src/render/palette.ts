// Single source of colours for the canvas and the page (TD-016).
export const PALETTE = {
  page: '#101418',
  panel: '#1b2127',
  panelEdge: '#2c353e',
  text: '#e8e4d8',
  textDim: '#a9a493',
  accent: '#f2b632',
  accentText: '#1a1406',
  focus: '#7cc4ff',
  button: '#2a333c',
  buttonActive: '#4a3a14',
  fire: '#a83a2a',
  overlay: 'rgba(10, 12, 14, 0.72)',

  ground: '#20262b',
  groundGrain: '#262d33',
  brick: '#a0522d',
  brickLight: '#c06a3c',
  brickMortar: '#5e3018',
  steel: '#8d99a6',
  steelLight: '#c4ced8',
  steelDark: '#56616c',
  water: '#1f5f8b',
  waterLight: '#3b86b8',
  base: '#d9b44a',
  baseDark: '#7a6020',
  baseDestroyed: '#4a4440',

  outline: '#14181c',
  shadow: 'rgba(0, 0, 0, 0.35)',
  player: '#e2b93b',
  playerLight: '#f6d873',
  playerDark: '#8f6d12',
  bullet: '#fff3c4',
} as const;

const CSS_VARS: Record<string, keyof typeof PALETTE> = {
  '--c-page': 'page',
  '--c-panel': 'panel',
  '--c-panel-edge': 'panelEdge',
  '--c-text': 'text',
  '--c-text-dim': 'textDim',
  '--c-accent': 'accent',
  '--c-accent-text': 'accentText',
  '--c-focus': 'focus',
  '--c-button': 'button',
  '--c-button-active': 'buttonActive',
  '--c-fire': 'fire',
  '--c-overlay': 'overlay',
  '--c-ground': 'ground',
};

export function applyCssPalette(root: HTMLElement): void {
  for (const [name, key] of Object.entries(CSS_VARS)) root.style.setProperty(name, PALETTE[key]);
}
