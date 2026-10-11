/**
 * Scene registry (VISUAL_DESIGN 3.1; landing progress from MOTION_SYSTEM 6.2).
 * `pulse` (S00 intro + S01) is static HTML in index.html so the LCP headline paints before JS.
 * S08 has no nav item: the nav keeps CONTROL ROOM active.
 */
export interface SceneDef { id: string; code: string; nav: string | null; track: string; landing: number; title: string; built: boolean }

export const SCENES: SceneDef[] = [
  { id: "pulse", code: "S01", nav: "PULSE", track: "200vh", landing: 0.78, title: "The invisible machine that powers everything.", built: true },
  { id: "source", code: "S02", nav: "SOURCE", track: "300vh", landing: 0.14, title: "Where every number comes from.", built: false },
  { id: "demand", code: "S03a", nav: "DEMAND", track: "250vh", landing: 0.74, title: "Every window is a hundred megawatts.", built: true },
  { id: "netload", code: "S03b", nav: "NET LOAD", track: "250vh", landing: 0.48, title: "The sun takes a bite out of noon.", built: false },
  { id: "forecast", code: "S04", nav: "FORECAST", track: "300vh", landing: 0.88, title: "Tomorrow, unrolled.", built: false },
  { id: "dispatch", code: "S05", nav: "DISPATCH", track: "300vh", landing: 0.8, title: "The cheapest power goes first.", built: true },
  { id: "stress", code: "S06", nav: "STRESS", track: "250vh", landing: 0.14, title: "Stress the machine.", built: false },
  { id: "evidence", code: "S07", nav: "EVIDENCE", track: "250vh", landing: 0.05, title: "How we know.", built: false },
  { id: "control", code: "CTRL", nav: "CONTROL ROOM", track: "auto", landing: 0, title: "Run tomorrow yourself.", built: false },
  { id: "closing", code: "S08", nav: null, track: "200vh", landing: 0.3, title: "The day closes.", built: false },
];

export const NAV_ITEMS = SCENES.filter((s) => s.nav).map((s) => ({ id: s.id, label: s.nav! }));
export const navActive = (scene: string | null) => (scene === "closing" ? "control" : scene ?? "pulse");
