---
name: desktop-development
description: Cross-platform (Electron, Tauri) and native (SwiftUI, WPF/WinUI, GTK) desktop application development patterns
license: Apache-2.0
compatibility: opencode
---

# Desktop Development Skill

This skill provides patterns and best practices for building desktop applications, covering both cross-platform and native approaches.

## When to Use

Use this skill when:
- Building new desktop applications
- Choosing between cross-platform and native development
- Implementing desktop-specific features (system tray, file access, menus)
- Packaging and distributing desktop applications
- Optimizing desktop app performance

## Framework Decision Matrix

| Framework | Language | Bundle Size | Performance | Native Feel | Best For |
|-----------|----------|-------------|-------------|-------------|----------|
| Tauri | Rust + Web | ~3-10 MB | Excellent | Good | Modern cross-platform, small bundles |
| Electron | JS/TS | ~80-150 MB | Good | Fair | Web team building desktop app |
| .NET MAUI | C# | ~30-50 MB | Good | Good | Microsoft ecosystem, mobile + desktop |
| Qt/QML | C++ | ~20-40 MB | Excellent | Excellent | Performance-critical, embedded |
| SwiftUI | Swift | Native | Excellent | Excellent | macOS-only, Apple ecosystem |
| WPF/WinUI | C# | Native | Good | Excellent | Windows-only, enterprise |
| GTK 4 | C/Rust/Python | Native | Good | Good (Linux) | Linux-native, GNOME |

### When to Choose Cross-Platform
- Target multiple OS (Windows, macOS, Linux)
- Web development team (Electron, Tauri)
- Rapid prototyping and iteration
- Content-focused apps (editors, dashboards)

### When to Choose Native
- Deep OS integration required
- Maximum performance needed
- Single-platform target
- Platform-specific design language

## Cross-Platform: Tauri

### Architecture
```
┌────────────────────────────────┐
│         Tauri Application       │
├────────────────────────────────┤
│  Frontend (Web)    │  Backend   │
│  ─────────────     │  (Rust)    │
│  HTML/CSS/JS       │           │
│  React/Vue/Svelte  │  Commands │
│  Any web framework │  Plugins  │
│                    │  System    │
│                    │  Access    │
├────────────────────────────────┤
│     System WebView (OS-native)  │
│  macOS: WKWebView               │
│  Windows: WebView2 (Edge)       │
│  Linux: WebKitGTK               │
└────────────────────────────────┘
```

### Key Concepts
- **Commands** — Rust functions callable from frontend via IPC
- **Events** — Bidirectional event system between frontend and backend
- **Plugins** — Modular system capabilities (file system, dialog, shell, etc.)
- **Permissions** — Fine-grained security model (allowlist for system access)

### Tauri Command Example
```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

// Frontend call
import { invoke } from '@tauri-apps/api/core';
const content = await invoke('read_file', { path: '/tmp/data.txt' });
```

### Tauri Best Practices
- Use permission system — never allow unrestricted file/shell access
- Keep Rust backend thin — handle system calls, delegate logic to frontend
- Use Tauri plugins for common needs (fs, dialog, clipboard, notification)
- Embed frontend assets for offline capability
- Target specific WebView versions for consistent behavior

## Cross-Platform: Electron

### Architecture
```
┌──────────────────────────────┐
│       Electron Application    │
├───────────────┬──────────────┤
│  Main Process │  Renderer    │
│  (Node.js)    │  (Chromium)  │
│               │              │
│  App lifecycle│  UI (HTML/   │
│  Native APIs  │  CSS/JS)     │
│  System access│  Web APIs    │
│  IPC handling │  IPC calls   │
├───────────────┴──────────────┤
│  Chromium + Node.js Runtime   │
└──────────────────────────────┘
```

### IPC Communication
```typescript
// Main process — handle IPC
import { ipcMain, dialog } from 'electron';

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text', extensions: ['txt', 'md'] }],
  });
  if (result.canceled) return null;
  return fs.readFileSync(result.filePaths[0], 'utf-8');
});

// Renderer process — invoke IPC
const content = await window.electronAPI.openFile();
```

### Security Best Practices
- Enable `contextIsolation: true` (default in modern Electron)
- Disable `nodeIntegration` in renderer (use preload scripts)
- Use `contextBridge` to expose safe APIs to renderer
- Validate all IPC inputs — treat renderer as untrusted
- Enable `sandbox: true` for renderer processes
- Keep Electron updated — security patches for Chromium

### Electron Performance
- Use `BrowserView` for multi-panel UIs instead of multiple windows
- Lazy-load heavy modules in main process
- Offload CPU work to worker threads or child processes
- Monitor memory — Chromium per-process can be expensive
- Use Electron Forge or electron-builder for optimized builds

## Native: macOS (SwiftUI / AppKit)

### SwiftUI Desktop Patterns
```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            CommandMenu("File") {
                Button("Open...") { openFile() }
                    .keyboardShortcut("o")
            }
        }

        MenuBarExtra("Status", systemImage: "circle.fill") {
            StatusView()
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
        }
    }
}
```

### macOS-Specific Features
- **Menu bar apps** — `MenuBarExtra` for status bar items
- **Settings window** — `Settings` scene for preferences
- **Toolbar** — `.toolbar { }` modifier for window toolbars
- **Sidebar** — `NavigationSplitView` for master-detail layouts
- **Drag & drop** — `.onDrop()` and `.draggable()` modifiers
- **Sandboxing** — App Sandbox for Mac App Store distribution

## Native: Windows (WPF / WinUI 3)

### WinUI 3 Architecture
- **XAML** for declarative UI layout
- **MVVM** pattern (Model-View-ViewModel)
- **Windows App SDK** for modern APIs
- **WinGet / MSIX** for distribution

### Key Features
- Fluent Design System integration
- Acrylic/Mica material backgrounds
- Toast notifications via Windows API
- File system and registry access
- MSI/MSIX packaging for enterprise deployment

## Native: Linux (GTK 4)

### GTK 4 Key Concepts
- **Widgets** — composable UI elements
- **Signals** — event-driven communication between widgets
- **CSS styling** — GTK supports CSS for theming
- **Flatpak** — recommended packaging format for distribution

### GNOME Integration
- Follow GNOME Human Interface Guidelines (HIG)
- Use libadwaita for adaptive, modern GNOME UI
- Support dark/light theme switching via system preference
- Use GSettings for persistent configuration

## Desktop-Specific Patterns

### System Tray / Menu Bar
- Minimize to tray for background apps
- Show status indicators and quick actions
- Right-click context menu for common operations
- Notifications from tray icon

### File System Access
- Use native file dialogs for open/save (never custom file pickers)
- Watch file system for changes (fs.watch, FSEvents, inotify)
- Handle file associations — register as handler for file types
- Recent files list — track and display recently opened files

### Native Menus & Keyboard Shortcuts
- Follow platform conventions (Cmd on macOS, Ctrl on Windows/Linux)
- Standard menu structure: File, Edit, View, Window, Help
- Global shortcuts for power users
- Context menus for right-click actions

### Window Management
- Remember window size and position between launches
- Support multiple windows when appropriate
- Handle fullscreen/maximize/minimize states
- Multi-monitor awareness

### Drag & Drop
- Support drag from file explorer into app
- Internal drag for reordering, organizing
- Drag out to export (files, text, images)
- Visual feedback during drag operations

## Auto-Update

| Framework | Update Mechanism |
|-----------|-----------------|
| Tauri | Built-in updater plugin (checks remote endpoint) |
| Electron | electron-updater (GitHub Releases, S3, generic server) |
| macOS Native | Sparkle framework (RSS-based updates) |
| Windows Native | WinGet, MSIX auto-update, ClickOnce |
| Linux | Flatpak auto-update, AppImage with AppImageUpdate |

### Update Best Practices
- Check for updates on launch (non-blocking)
- Allow user to defer updates
- Show changelog/release notes
- Delta updates when possible (reduce download size)
- Rollback mechanism for failed updates
- Code sign updates to prevent tampering

## Packaging & Distribution

### macOS
- **DMG** — Disk image with drag-to-Applications install
- **pkg** — Installer package for complex setups
- **Mac App Store** — Sandboxed, Apple review required
- **Code signing** — Required for Gatekeeper (Developer ID)
- **Notarization** — Required for distribution outside App Store

### Windows
- **MSI** — Traditional Windows installer
- **MSIX** — Modern packaging, auto-update, sandboxed
- **Portable** — Single .exe, no installation
- **Code signing** — EV certificate to avoid SmartScreen warnings
- **Microsoft Store** — Optional, sandboxed distribution

### Linux
- **AppImage** — Single-file, no installation, runs on most distros
- **Flatpak** — Sandboxed, auto-update, Flathub distribution
- **Snap** — Canonical's universal package (Ubuntu-focused)
- **deb/rpm** — Traditional packages for specific distros

## Technology Recommendations

### By Use Case
| Use Case | Recommended Stack |
|----------|-------------------|
| Web team → Desktop | Tauri + React/Vue/Svelte |
| Legacy web app → Desktop | Electron + existing frontend |
| macOS-only tool | SwiftUI + AppKit |
| Windows enterprise app | WinUI 3 + .NET |
| Linux GNOME app | GTK 4 + Rust (gtk-rs) or Python |
| Cross-platform + mobile | .NET MAUI (C#) |
| Performance-critical (CAD, games) | Qt/QML + C++ |
| Small utility / CLI with UI | Tauri + minimal frontend |
