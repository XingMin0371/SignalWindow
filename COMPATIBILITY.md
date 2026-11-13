# Compatibility matrix

## Runtime

| Environment | Status | Notes |
|---|---|---|
| Windows 10/11 + Node 24 | supported | `START-WINDOWS.cmd` |
| Linux x64 + Node 24 | supported | `start-linux.sh` |
| Docker Desktop / Linux Compose | supported | `infra/docker-compose.yml` |
| Android Chrome/Edge | client only | PWA, see `ANDROID.md` |
| iOS Safari | client only | add to Home Screen; HTTPS preferred |
| Android/iOS native APK/IPA | not included | web/PWA source; wrapper needed |

## Browser baseline

The production target is:

```text
JavaScript: ES2017
CSS: Chrome 64 / Safari 12 baseline
```

The app still uses React 18 and Ant Design 5. Those libraries have their own
browser floors. "10-year-old device" is not a guaranteed support claim; use
Lite mode, static backgrounds, and the latest available browser.

## Feature fallbacks

```text
ResizeObserver unavailable -> fixed-height virtual rows
IndexedDB unavailable      -> background feature disabled, chat still works
WebP canvas unavailable    -> original image fallback
100dvh unavailable         -> 100vh fallback
Service worker unavailable -> normal HTTP/WebSocket mode
```

## APK / IPA

The current repository is a web application and PWA. An APK is a separate
debugging/signing artifact:

```text
TWA:        needs HTTPS + Digital Asset Links + Android SDK
WebView:    Capacitor/Cordova wrapper, can use HTTP but weaker isolation
IPA:        needs Apple signing, normally not practical for local sideloading
```

The web/PWA implementation is not less compatible. It simply has no Android
wrapper project in this repository.
