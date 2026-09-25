// Visual themes for the game screen: CSS for the panels + colors for the maze canvas.
// Each theme's CSS is scoped under `.theme-<id>` on the game screen root.

export type BoardTheme = {
  tileA: string; // checkerboard tiles
  tileB: string;
  grid?: string; // optional dotted grid line color
  wall: string;
  wallWidth: number;
  wallGlow?: string; // neon glow around walls
  wallShade?: string; // offset shadow under walls (3D look)
  wallHighlight?: string; // thin shine on top of walls
  start: string; // start field tint
  finish: string; // tile under the crown
  finishGlow: string; // pulsing glow around the finish
  activeRing: string; // ring around the current player
};

export type Theme = {
  id: string;
  label: string;
  swatch: string; // color of the theme's switcher button
  board: BoardTheme;
  css: string;
};

export const themes: Theme[] = [
  {
    id: "garden",
    label: "Garden Board",
    swatch: "#5cae4a",
    board: {
      tileA: "#92d36c", tileB: "#86c860",
      wall: "#2f7d32", wallWidth: 8, wallShade: "#1d5220", wallHighlight: "rgba(160, 230, 120, 0.8)",
      start: "rgba(255, 255, 255, 0.45)", finish: "#ffe38a", finishGlow: "rgba(255, 236, 120, 0.8)",
      activeRing: "#fff4d6",
    },
    css: `
      .theme-garden { background: #3f7d3a; background-image: radial-gradient(rgba(255,255,255,0.07) 3px, transparent 3px); background-size: 34px 34px; color: #fff4d6; }
      .theme-garden .gs-panel { background: linear-gradient(180deg, #c98b4f 0%, #a86b35 100%); border: 5px solid #6d4323; border-radius: 20px; box-shadow: inset 0 3px 0 rgba(255,255,255,0.25), 0 8px 0 #4a2c15, 0 14px 24px rgba(0,0,0,0.3); }
      .theme-garden .gs-maze { background: linear-gradient(180deg, #7a4b27, #5c3519); }
      .theme-garden .gs-title { font-family: "Lilita One", Arial, sans-serif; letter-spacing: 1px; color: #ffe08a; text-shadow: 0 3px 0 #6d4323; }
      .theme-garden .gs-row { background: rgba(0,0,0,0.12); }
      .theme-garden .gs-row.active { background: rgba(255,244,214,0.25); box-shadow: inset 0 0 0 3px #ffe08a; }
      .theme-garden .gs-points { font-family: "Lilita One", Arial, sans-serif; font-size: 22px; color: #ffe08a; text-shadow: 0 2px 0 #6d4323; }
      .theme-garden .gs-big { font-family: "Lilita One", Arial, sans-serif; color: #ffe08a; text-shadow: 0 3px 0 #6d4323; }
      .theme-garden .gs-label { color: #ffe9c4; }
      .theme-garden .gs-pip { background: rgba(0,0,0,0.22); }
      .theme-garden .gs-pip.on { background: #ffe08a; box-shadow: 0 3px 0 #b7892d; }
      .theme-garden .gs-mute input { accent-color: #6d4323; }
      .theme-garden .gs-avatar { background: rgba(255,244,214,0.3); border: 4px solid #ffe08a; }
    `,
  },
  {
    id: "neon",
    label: "Neon Night",
    swatch: "#7dffb2",
    board: {
      tileA: "#0d1024", tileB: "#10142c",
      grid: "rgba(125, 255, 178, 0.16)",
      wall: "#7dffb2", wallWidth: 3.5, wallGlow: "rgba(125, 255, 178, 0.8)",
      start: "rgba(125, 255, 178, 0.14)", finish: "rgba(255, 228, 92, 0.18)", finishGlow: "rgba(255, 228, 92, 0.55)",
      activeRing: "#ffe45c",
    },
    css: `
      .theme-neon { background: radial-gradient(circle at 30% 20%, #2a1f5c 0%, #120f2b 45%, #07060f 100%); color: #eef; font-family: "Baloo 2", Fredoka, Arial, sans-serif; }
      .theme-neon .gs-panel { background: rgba(255,255,255,0.05); border: 1px solid rgba(125,255,178,0.35); border-radius: 18px; backdrop-filter: blur(8px); box-shadow: 0 0 24px rgba(125,255,178,0.12), inset 0 0 20px rgba(125,255,178,0.05); }
      .theme-neon .gs-title { font-family: "Lilita One", Arial, sans-serif; letter-spacing: 1px; color: #7dffb2; text-shadow: 0 0 12px rgba(125,255,178,0.7); }
      .theme-neon .gs-row.active { background: rgba(255,228,92,0.12); box-shadow: inset 0 0 0 2px rgba(255,228,92,0.7), 0 0 18px rgba(255,228,92,0.25); }
      .theme-neon .gs-points { font-family: "Lilita One", Arial, sans-serif; color: #ffe45c; text-shadow: 0 0 10px rgba(255,228,92,0.6); }
      .theme-neon .gs-big { font-family: "Lilita One", Arial, sans-serif; color: #ffe45c; text-shadow: 0 0 14px rgba(255,228,92,0.6); }
      .theme-neon .gs-label { color: #9aa3d6; }
      .theme-neon .gs-pip { background: rgba(255,255,255,0.12); }
      .theme-neon .gs-pip.on { background: #ffe45c; box-shadow: 0 0 10px #ffe45c; }
      .theme-neon .gs-mute input { accent-color: #7dffb2; }
      .theme-neon .gs-avatar { background: radial-gradient(circle, rgba(255,228,92,0.35), transparent 70%); }
    `,
  },
  {
    id: "candy",
    label: "Candy Pop",
    swatch: "#ff5fa2",
    board: {
      tileA: "#fff7fb", tileB: "#ffeef6",
      wall: "#ff5fa2", wallWidth: 7, wallShade: "#c93d7c", wallHighlight: "rgba(255,255,255,0.65)",
      start: "rgba(134, 239, 172, 0.55)", finish: "#ffe38a", finishGlow: "rgba(255, 200, 60, 0.6)",
      activeRing: "#8b5cf6",
    },
    css: `
      .theme-candy { background: #ffd6e8; background-image: radial-gradient(#ffffff 2px, transparent 2px), linear-gradient(135deg, #ffd1e6 0%, #e9d5ff 100%); background-size: 26px 26px, 100% 100%; color: #5b2a4a; }
      .theme-candy .gs-panel { background: #fff; border: 5px solid #ffc2dc; border-radius: 28px; box-shadow: 0 8px 0 #f49ac1, 0 16px 30px rgba(201,61,124,0.2); }
      .theme-candy .gs-title { font-weight: 700; color: #ff5fa2; }
      .theme-candy .gs-row { background: #fff5fa; border-radius: 18px; }
      .theme-candy .gs-row.active { background: #f3e8ff; box-shadow: inset 0 0 0 3px #a78bfa; }
      .theme-candy .gs-points { background: #ff5fa2; color: #fff; border-radius: 999px; padding: 2px 12px; font-weight: 700; box-shadow: 0 3px 0 #c93d7c; }
      .theme-candy .gs-big { font-weight: 700; color: #8b5cf6; }
      .theme-candy .gs-label { color: #b0799b; font-weight: 600; }
      .theme-candy .gs-pip { background: #fde2ef; }
      .theme-candy .gs-pip.on { background: #8b5cf6; box-shadow: 0 3px 0 #6d28d9; }
      .theme-candy .gs-mute input { accent-color: #ff5fa2; }
      .theme-candy .gs-avatar { background: #f3e8ff; border: 4px solid #a78bfa; }
    `,
  },
];

export const DEFAULT_THEME_ID = "garden";
const STORAGE_KEY = "mazegame.theme";

export function getTheme(id: string | null | undefined): Theme {
  return themes.find((t) => t.id === id) ?? themes.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/** Theme the player picked last time (falls back to the default) */
export function loadSavedTheme(): Theme {
  try {
    return getTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return getTheme(DEFAULT_THEME_ID);
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice just won't persist
  }
}
