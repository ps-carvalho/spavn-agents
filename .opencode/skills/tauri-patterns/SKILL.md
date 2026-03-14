---
name: tauri-patterns
description: Tauri 2.0 desktop and mobile application patterns covering Rust backend, commands, plugins, security capabilities, and distribution
license: Apache-2.0
compatibility: opencode
---

# Tauri Patterns Skill

This skill provides patterns and best practices for building production-quality Tauri 2.0 applications with Rust backends and web frontends.

## When to Use

Use this skill when:
- Building cross-platform desktop apps with minimal bundle size
- You want Rust-level performance and memory safety on the backend
- Security and small attack surface are priorities
- Targeting desktop and mobile (iOS/Android) from a single codebase
- Your frontend team uses React, Vue, Svelte, or Solid
- Migrating from Electron to reduce resource usage

## Project Structure

```
my-tauri-app/
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── lib.rs             # Tauri app builder and plugin registration
│   │   ├── main.rs            # Entry point (calls lib::run)
│   │   ├── commands/          # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── files.rs
│   │   │   └── settings.rs
│   │   ├── state.rs           # Application state definitions
│   │   ├── menu.rs            # Native menu setup
│   │   ├── tray.rs            # System tray setup
│   │   └── error.rs           # Custom error types
│   ├── capabilities/          # Permission capabilities (Tauri 2.0)
│   │   ├── default.json
│   │   └── main-window.json
│   ├── icons/                 # App icons for all platforms
│   ├── tauri.conf.json        # Tauri configuration
│   ├── Cargo.toml
│   └── build.rs
├── src/                       # Frontend (React/Vue/Svelte/Solid)
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   └── tauri.ts           # Typed wrappers for invoke calls
│   ├── pages/
│   └── main.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Key Patterns

### Commands (Rust Backend)

Commands are the primary way the frontend communicates with the Rust backend. They replace Electron's IPC handlers.

```rust
// src-tauri/src/commands/files.rs
use std::fs;
use tauri::command;

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| e.to_string())
}
```

```rust
// src-tauri/src/lib.rs
mod commands;
mod state;

use commands::files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Frontend Invocation

```typescript
// src/lib/tauri.ts
import { invoke } from "@tauri-apps/api/core";

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}
```

### State Management (Rust Side)

Use Tauri's managed state for shared backend state. Wrap mutable state in `Arc<Mutex<T>>` or `Arc<RwLock<T>>`.

```rust
// src-tauri/src/state.rs
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub last_opened: Option<String>,
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
    pub db_pool: sqlx::SqlitePool, // Example: database connection
}
```

```rust
// Using state in commands
use tauri::State;
use crate::state::AppState;

#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}
```

### Event System (Frontend to Backend)

```rust
// Emit from Rust to frontend
use tauri::{AppHandle, Emitter};

fn notify_progress(app: &AppHandle, progress: f64) {
    app.emit("download:progress", progress).unwrap();
}
```

```typescript
// Listen in frontend
import { listen } from "@tauri-apps/api/event";

const unlisten = await listen<number>("download:progress", (event) => {
  console.log(`Progress: ${event.payload}%`);
});

// Clean up when done
unlisten();
```

### Permissions and Capabilities (Tauri 2.0)

Tauri 2.0 uses a fine-grained capability system. Each window gets explicit permissions.

```json
// src-tauri/capabilities/main-window.json
{
  "identifier": "main-window",
  "description": "Permissions for the main application window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:scope-app-data",
    "shell:allow-open",
    "notification:default",
    "clipboard-manager:allow-write"
  ]
}
```

### Plugin System

Tauri 2.0 uses a plugin architecture for OS features. Add plugins in `Cargo.toml` and register in `lib.rs`.

| Plugin | Purpose | Crate |
|--------|---------|-------|
| fs | File system access | `tauri-plugin-fs` |
| dialog | Open/save dialogs | `tauri-plugin-dialog` |
| clipboard | Clipboard read/write | `tauri-plugin-clipboard-manager` |
| notification | System notifications | `tauri-plugin-notification` |
| shell | Open URLs, run commands | `tauri-plugin-shell` |
| updater | Auto-updates | `tauri-plugin-updater` |
| deep-link | URI scheme handling | `tauri-plugin-deep-link` |
| store | Persistent key-value storage | `tauri-plugin-store` |
| log | Cross-platform logging | `tauri-plugin-log` |

## Security Model

Tauri's security model is allowlist-based: nothing is permitted unless explicitly granted.

- Each window has a capability file defining its permissions
- File system access is scoped to specific directories (`fs:scope-app-data`, `fs:scope-home`)
- Plugins require explicit permission grants per window
- The Rust backend validates all inputs before processing
- No Node.js in the rendering process; the webview has no direct system access
- CSP is configured in `tauri.conf.json` under `app.security.csp`

## State Management (Frontend)

- Use your preferred frontend state library (Zustand, Pinia, Svelte stores, Jotai)
- Backend state lives in Tauri managed state; frontend fetches via `invoke`
- Use `tauri-plugin-store` for simple persistent key-value data
- For complex persistence, use SQLite via `sqlx` in the Rust backend
- Keep the Rust backend as the source of truth for critical state

## Performance Best Practices

- Tauri apps are inherently lighter than Electron (3-10 MB vs 80-150 MB)
- Use async commands to avoid blocking the main thread
- Move heavy computation to Rust (image processing, parsing, crypto)
- Use `tokio::spawn` for concurrent background tasks in the backend
- Minimize `invoke` round-trips; batch related data in single command calls
- Use events for streaming data (progress, logs) instead of polling
- Lazy-load frontend routes and heavy components
- Profile with `cargo flamegraph` for Rust and browser DevTools for frontend

## Anti-Patterns to Avoid

- **Overly broad permissions** — Grant only the specific permissions each window needs
- **Blocking the main thread** — Always use `async` commands for I/O or computation
- **Unwrap everywhere** — Use proper `Result` types and error handling in commands
- **String error types** — Define custom error enums that implement `serde::Serialize`
- **Direct file paths from frontend** — Validate and scope all paths server-side
- **Ignoring the capability system** — Do not use `core:default` as a catch-all
- **Mixing concerns in lib.rs** — Separate commands, state, and setup into modules
- **Not handling `Mutex` poisoning** — Use `.lock().map_err()` instead of `.lock().unwrap()`

## Platform-Specific Considerations

- **macOS**: Native webview (WebKit); supports notarization via `tauri-cli`; handle `activate` event for dock behavior
- **Windows**: Uses WebView2 (Chromium-based); requires WebView2 runtime (bundled or bootstrapper); sign with Authenticode
- **Linux**: Uses WebKitGTK; ensure `libwebkit2gtk-4.1` dependency; provide AppImage, deb, and RPM targets
- **iOS** (Tauri 2.0): Uses WKWebView; configure in `tauri.conf.json` under `bundle.iOS`; requires Xcode
- **Android** (Tauri 2.0): Uses Android WebView; configure Gradle settings; requires Android Studio

## Testing Approach

- **Rust unit tests**: Test command logic independently with `#[cfg(test)]` modules
- **Rust integration tests**: Use `tauri::test` utilities to test commands with mocked app state
- **Frontend unit tests**: Test components with Vitest + Testing Library (no Tauri dependency)
- **Frontend integration**: Mock `@tauri-apps/api` in tests with `vi.mock`
- **E2E tests**: Use WebDriver (via `tauri-driver`) or Playwright with appropriate setup

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_read_file() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(temp.path(), "hello").unwrap();
        let result = read_file(temp.path().to_string_lossy().to_string()).await;
        assert_eq!(result.unwrap(), "hello");
    }
}
```

## Distribution and Packaging

### Build Targets

| Platform | Format | Command |
|----------|--------|---------|
| macOS | DMG, .app | `tauri build --target universal-apple-darwin` |
| Windows | MSI, NSIS | `tauri build` |
| Linux | AppImage, deb, RPM | `tauri build` |
| iOS | IPA | `tauri ios build` |
| Android | APK, AAB | `tauri android build` |

### Auto-Updates
- Use `tauri-plugin-updater` with a JSON endpoint or GitHub Releases
- Configure update endpoints in `tauri.conf.json` under `plugins.updater`
- Sign updates with a private key (generated via `tauri signer generate`)

### Migration from Tauri v1
- Commands now use `#[command]` attribute directly (no `#[tauri::command]`)
- Allowlist replaced by capabilities system
- Plugins moved to separate crates (`tauri-plugin-*`)
- Mobile support added; configure in `tauri.conf.json`
- Event system API changed: use `Emitter` and `Listener` traits
