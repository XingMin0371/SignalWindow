/**
 * Time-of-day sun tint. This only writes two CSS variables once per hour;
 * the beam itself is a static CSS gradient (no animation/filter).
 */
type SunPhase = {
  from: number;
  to: number;
  rgb: string;
  opacity: number;
};

const PHASES: SunPhase[] = [
  { from: 0, to: 5, rgb: "150,170,200", opacity: 0.16 }, // night, cool and dim
  { from: 6, to: 8, rgb: "255,188,120", opacity: 0.52 }, // sunrise, amber
  { from: 9, to: 11, rgb: "255,226,170", opacity: 0.72 }, // morning, warm white
  { from: 12, to: 15, rgb: "255,250,236", opacity: 0.82 }, // noon, near white
  { from: 16, to: 18, rgb: "255,206,138", opacity: 0.68 }, // afternoon, gold
  { from: 19, to: 21, rgb: "255,160,96", opacity: 0.42 }, // sunset, orange
  { from: 22, to: 23, rgb: "150,170,200", opacity: 0.18 }, // night
];

export function applySunlight(date = new Date()): void {
  const hour = date.getHours();
  const phase = PHASES.find((item) => hour >= item.from && hour <= item.to) || PHASES[0];
  const root = document.documentElement;
  root.style.setProperty("--sun-rgb", phase.rgb);
  root.style.setProperty("--sun-opacity", String(phase.opacity));
}

export function startSunlightClock(): void {
  applySunlight();
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  window.setTimeout(() => {
    applySunlight();
    window.setInterval(applySunlight, 60 * 60 * 1000);
  }, nextHour.getTime() - now.getTime());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applySunlight();
  });
}
