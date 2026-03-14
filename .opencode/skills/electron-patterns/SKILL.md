---
name: electron-patterns
description: Electron desktop application patterns covering main/renderer process architecture, IPC, security, packaging, and performance
license: Apache-2.0
compatibility: opencode
---

# Electron Patterns Skill

This skill provides patterns and best practices for building production-quality Electron desktop applications with modern security practices and optimal performance.

## When to Use

Use this skill when:
- Building cross-platform desktop apps with web technologies
- Your team has strong JavaScript/TypeScript expertise
- You need deep Node.js/native module integration
- Building apps that require rich OS integration (tray, menus, notifications)
- Migrating a web application to a desktop form factor
- Working with existing Electron codebases

## Project Structure

```
my-electron-app/
├── src/
│   ├── main/                  # Main process code
│   │   ├── index.ts           # Entry point, app lifecycle
│   │   ├── windows.ts         # BrowserWindow management
│   │   ├── ipc-handlers.ts    # ipcMain.handle registrations
│   │   ├── menu.ts            # Application menu and context menus
│   │   ├── tray.ts            # System tray management
│   │   ├── updater.ts         # Auto-update logic
│   │   └── protocol.ts        # Custom protocol handlers
│   ├── preload/               # Preload scripts (bridge layer)
│   │   ├── index.ts           # contextBridge.exposeInMainWorld
│   │   └── api.ts             # Typed API exposed to renderer
│   ├── renderer/              # Renderer process (React/Vue/Svelte)
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── index.html
│   └── shared/                # Types and utilities shared across processes
│       ├── types.ts
│       └── constants.ts
├── resources/                 # App icons, static assets
├── forge.config.ts            # Electron Forge configuration
├── electron-builder.yml       # Or electron-builder config
├── vite.main.config.ts        # Vite config for main process
├── vite.preload.config.ts     # Vite config for preload
├── vite.renderer.config.ts    # Vite config for renderer
├── package.json
└── tsconfig.json
```

## Key Patterns

### Main Process vs Renderer Process

The main process runs in Node.js and manages the application lifecycle. Renderer processes run in Chromium and display the UI. They must communicate through IPC.

```typescript
// src/main/index.ts — Main process entry
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc-handlers";
import { createMainWindow } from "./windows";

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

### IPC Communication (invoke/handle Pattern)

Always use the invoke/handle pattern instead of send/on for request-response flows. It returns a Promise and provides cleaner error handling.

```typescript
// src/main/ipc-handlers.ts
import { ipcMain, dialog } from "electron";
import { readFile, writeFile } from "fs/promises";

export function registerIpcHandlers() {
  ipcMain.handle("dialog:openFile", async (_event, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters,
    });
    if (result.canceled) return null;
    const content = await readFile(result.filePaths[0], "utf-8");
    return { path: result.filePaths[0], content };
  });

  ipcMain.handle("file:save", async (_event, path: string, content: string) => {
    await writeFile(path, content, "utf-8");
    return { success: true };
  });
}
```

### Preload Script and contextBridge

The preload script is the secure bridge between main and renderer. Never expose the full `ipcRenderer` object.

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";

const api = {
  openFile: (filters: Electron.FileFilter[]) =>
    ipcRenderer.invoke("dialog:openFile", filters),
  saveFile: (path: string, content: string) =>
    ipcRenderer.invoke("file:save", path, content),
  onUpdateAvailable: (callback: () => void) => {
    const subscription = (_event: Electron.IpcRendererEvent) => callback();
    ipcRenderer.on("update:available", subscription);
    return () => ipcRenderer.removeListener("update:available", subscription);
  },
} as const;

export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld("electronAPI", api);
```

```typescript
// src/renderer/hooks/useElectronAPI.ts
export function useElectronAPI() {
  return (window as any).electronAPI as import("../../preload/index").ElectronAPI;
}
```

### BrowserWindow Management

```typescript
// src/main/windows.ts
import { BrowserWindow, screen } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1200, width),
    height: Math.min(800, height),
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,    // Always true
      sandbox: true,             // Enable sandbox
      nodeIntegration: false,    // Always false
      webSecurity: true,         // Never disable
    },
    show: false, // Show when ready to prevent flash
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  return mainWindow;
}
```

## Security Best Practices

Security is the most critical aspect of Electron development. Electron apps have full system access, so mistakes can be severe.

| Setting | Required Value | Why |
|---------|---------------|-----|
| `contextIsolation` | `true` | Prevents renderer from accessing Node.js |
| `nodeIntegration` | `false` | Blocks require() in renderer |
| `sandbox` | `true` | Restricts preload capabilities |
| `webSecurity` | `true` | Enforces same-origin policy |

- Set a strict Content Security Policy in your HTML and via `session.defaultSession.webRequest`
- Validate all IPC inputs in the main process before acting on them
- Never pass unsanitized user input to `shell.openExternal`
- Use `safeStorage` for storing sensitive data (tokens, keys)
- Restrict navigation and new window creation with `webContents` event handlers

```typescript
// Restrict navigation to prevent open redirect attacks
mainWindow.webContents.on("will-navigate", (event, url) => {
  const allowed = ["https://myapp.com"];
  if (!allowed.some((origin) => url.startsWith(origin))) {
    event.preventDefault();
  }
});
```

## State Management

- Use your preferred web framework state management (Zustand, Redux, Pinia) in the renderer
- Persist state via IPC to the main process (electron-store or custom file storage)
- For multi-window shared state, use the main process as the source of truth and broadcast changes via IPC
- Never store secrets in renderer-accessible storage; use `safeStorage` in the main process

## Performance Best Practices

- Lazy-load heavy modules in the main process to reduce startup time
- Use `BrowserWindow` with `show: false` and `ready-to-show` to prevent white flash
- Move CPU-intensive tasks to `utilityProcess` (Electron 22+) or worker threads
- Profile renderer performance with Chrome DevTools
- Minimize IPC payload size; transfer large data via temporary files or shared memory
- Use `V8 snapshots` or precompiled bytecode for faster startup in production
- Avoid synchronous IPC (`ipcRenderer.sendSync`) entirely

## Auto-Updater

```typescript
// src/main/updater.ts
import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";

export function initAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    win.webContents.send("update:available", info);
  });

  autoUpdater.on("download-progress", (progress) => {
    win.webContents.send("update:progress", progress.percent);
  });

  autoUpdater.on("update-downloaded", () => {
    win.webContents.send("update:downloaded");
  });

  autoUpdater.checkForUpdates();
}
```

## Anti-Patterns to Avoid

- **Enabling `nodeIntegration`** — Allows arbitrary code execution from the renderer
- **Disabling `contextIsolation`** — Exposes Node.js APIs to untrusted web content
- **Using `remote` module** — Deprecated, slow, security risk; use invoke/handle instead
- **Synchronous IPC** — Blocks the renderer process, causing UI freezes
- **Exposing full `ipcRenderer`** — Exposes `send`/`sendSync` to arbitrary channels
- **Loading remote URLs without validation** — Open redirect and phishing risks
- **Bundling unnecessary native modules** — Inflates app size and increases attack surface
- **Ignoring memory leaks** — Renderer processes can accumulate memory; monitor with DevTools

## Platform-Specific Considerations

- **macOS**: Support `app.on("activate")` for dock click re-open; use `systemPreferences` for dark mode; handle notarization with `@electron/notarize`
- **Windows**: Handle single-instance lock with `app.requestSingleInstanceLock()`; sign with EV certificate for SmartScreen trust; support NSIS/Squirrel installers
- **Linux**: Provide AppImage, deb, and snap packages; handle tray icon differences; test on both X11 and Wayland

## Testing Approach

- **Unit tests**: Test main process logic (IPC handlers, utilities) with Vitest/Jest; mock Electron APIs
- **Component tests**: Test renderer components with your framework's testing library (React Testing Library, etc.)
- **E2E tests**: Use Playwright with `_electron.launch()` for full integration testing
- **Preload tests**: Test the bridge API contract in isolation
- Spectron is deprecated; Playwright is the recommended replacement

```typescript
// e2e/app.spec.ts — Playwright Electron test
import { test, expect, _electron as electron } from "@playwright/test";

test("app launches and shows main window", async () => {
  const app = await electron.launch({ args: ["."] });
  const window = await app.firstWindow();
  await expect(window.locator("h1")).toHaveText("Welcome");
  await app.close();
});
```

## Distribution and Packaging

### Electron Forge (Recommended)
- Integrated toolchain: dev, package, make, publish
- Supports Vite, Webpack, or custom bundlers
- Built-in makers for DMG, Squirrel, deb, RPM, Flatpak

### electron-builder
- More configuration options, YAML-based config
- Supports auto-update, code signing, notarization
- Wider range of target formats

### Code Signing and Notarization
- **macOS**: Requires Apple Developer ID; use `@electron/notarize` post-build
- **Windows**: EV code signing certificate for SmartScreen; sign with `signtool`
- **Linux**: GPG signing for package repositories

Distribute via GitHub Releases (with electron-updater for auto-updates), Mac App Store, Microsoft Store (MSIX), or Snap Store for Linux.
