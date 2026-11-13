import { safeRemove } from "./storage";

// Keep this entry tiny. Old browsers must reach /lite.html without first
// downloading and parsing React + Ant Design.
const modern = typeof window.CSS !== "undefined" && typeof CSS.supports === "function" &&
  CSS.supports("(--probe: 0)") && CSS.supports("selector(:where(*))");

if (!modern || /[?&]lite=1/.test(location.search)) {
  location.replace("/lite.html" + location.search);
} else {
  safeRemove("snowluma_window_token");
  void import("./bootstrap");
}
