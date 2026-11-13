import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";
import { applyTheme, getStoredTheme } from "./appearance";
import { safeGet, safeRemove } from "./storage";
import { startSunlightClock } from "./sunlight";

if (safeGet("signal_lite") === "1") document.documentElement.classList.add("lite");
applyTheme(getStoredTheme());
startSunlightClock();

safeRemove("snowluma_window_token");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
