import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";
import { applyTheme, getStoredTheme } from "./appearance";
import { safeGet, safeRemove } from "./storage";
import { startSunlightClock } from "./sunlight";

// 渐进增强：CSS 变量 / :where 不可用的旧浏览器直接进轻量版（无框架、ES5）。
const modern = typeof window.CSS !== "undefined" && typeof CSS.supports === "function" &&
  CSS.supports("(--probe: 0)") && CSS.supports("selector(:where(*))");
if (!modern || /[?&]lite=1/.test(location.search)) location.replace("/lite.html" + location.search);

if (safeGet("signal_lite") === "1") document.documentElement.classList.add("lite");
applyTheme(getStoredTheme());
startSunlightClock();

safeRemove("snowluma_window_token");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
