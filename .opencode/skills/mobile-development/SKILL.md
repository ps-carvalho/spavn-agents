---
name: mobile-development
description: Cross-platform (React Native, Flutter) and native (Swift/SwiftUI, Kotlin/Compose) mobile development patterns
license: Apache-2.0
compatibility: opencode
---

# Mobile Development Skill

This skill provides patterns and best practices for building mobile applications, covering both cross-platform and native approaches.

## When to Use

Use this skill when:
- Building new mobile applications (iOS, Android, or both)
- Choosing between cross-platform and native development
- Implementing mobile-specific features (offline, push, deep linking)
- Optimizing mobile app performance
- Distributing apps to stores

## Framework Decision Matrix

| Framework | Language | Performance | Native Feel | Code Sharing | Best For |
|-----------|----------|-------------|-------------|--------------|----------|
| Swift/SwiftUI | Swift | Excellent | Excellent | iOS only | iOS-only apps, Apple ecosystem |
| Kotlin/Compose | Kotlin | Excellent | Excellent | Android only | Android-only, Google ecosystem |
| Flutter | Dart | Very Good | Good | ~95% shared | Cross-platform, custom UI |
| React Native | JS/TS | Good | Good | ~85% shared | Web teams, JS ecosystem |
| Expo | JS/TS | Good | Good | ~90% shared | RN with managed workflow |
| Capacitor | JS/TS | Fair | Fair | ~95% shared | Web app → mobile wrapper |
| KMP | Kotlin | Good | Excellent | Logic only | Shared logic, native UI |

### When to Choose Cross-Platform
- Target both iOS and Android with shared codebase
- Web development team (React Native, Capacitor)
- Uniform UI across platforms (Flutter)
- Rapid prototyping and iteration
- Budget constraints — one team for both platforms

### When to Choose Native
- Deep platform integration (HealthKit, ARKit, Widgets)
- Maximum performance needed (games, video, AR)
- Single-platform target
- Platform-specific design language is critical

## Cross-Platform: React Native

### Architecture (New Architecture)
```
┌────────────────────────────────┐
│       React Native App          │
├────────────────────────────────┤
│  JavaScript / TypeScript        │
│  React Components               │
│  State Management               │
├────────────────────────────────┤
│  JSI (JavaScript Interface)     │  ← Direct JS ↔ Native bridge
│  Fabric Renderer                │  ← Concurrent rendering
│  TurboModules                   │  ← Lazy-loaded native modules
├────────────────────────────────┤
│  Hermes Engine (JS runtime)     │
├────────────────────────────────┤
│  iOS (UIKit)  │  Android (View) │
└───────────────┴────────────────┘
```

### Project Setup
- **Expo** (Recommended) — Managed workflow, easy native module integration via config plugins
- **Bare React Native** — Full control, needed for custom native code
- **Expo + Dev Client** — Best of both: Expo convenience + custom native modules

### State Management
| Library | Style | Best For |
|---------|-------|----------|
| Zustand | Simple, hook-based | Most apps, minimal boilerplate |
| Redux Toolkit | Flux pattern | Large apps, complex state |
| Jotai/Recoil | Atomic state | Fine-grained reactivity |
| TanStack Query | Server state | API data, caching, sync |
| MMKV | Persistent key-value | Fast local storage |

### React Native Best Practices
- Use `FlatList` or `FlashList` for lists — never `.map()` for scrollable content
- Minimize bridge crossings — batch native calls, use JSI
- Avoid inline styles — use `StyleSheet.create()` for performance
- Test on real devices — simulators don't reflect real performance
- Use Hermes engine — faster startup, lower memory

## Cross-Platform: Flutter

### Architecture
```
┌──────────────────────────────┐
│        Flutter App            │
├──────────────────────────────┤
│  Dart Code                    │
│  Widget Tree                  │
│  State Management             │
├──────────────────────────────┤
│  Flutter Framework            │
│  (Material, Cupertino,        │
│   Rendering, Painting)        │
├──────────────────────────────┤
│  Skia / Impeller Engine       │  ← Custom rendering (not native views)
├──────────────────────────────┤
│  Platform Channels            │  ← Bridge to native APIs
├──────────────────────────────┤
│  iOS (Darwin) │ Android (JNI) │
└───────────────┴──────────────┘
```

### State Management
| Library | Pattern | Best For |
|---------|---------|----------|
| Riverpod | Provider-based, compile-safe | Most apps (recommended) |
| BLoC | Stream-based, event-driven | Large apps, enterprise |
| Provider | InheritedWidget wrapper | Simple apps, beginners |
| GetX | All-in-one (state, routing, DI) | Rapid prototyping |

### Widget Patterns
```dart
// Stateless — pure UI, no internal state
class UserCard extends StatelessWidget {
  final User user;
  const UserCard({required this.user});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(user.name),
        subtitle: Text(user.email),
        leading: CircleAvatar(backgroundImage: NetworkImage(user.avatar)),
      ),
    );
  }
}

// Riverpod — reactive state management
final userProvider = FutureProvider<User>((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.getUser();
});

class UserScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProvider);
    return userAsync.when(
      data: (user) => UserCard(user: user),
      loading: () => CircularProgressIndicator(),
      error: (err, stack) => Text('Error: $err'),
    );
  }
}
```

### Flutter Best Practices
- Use `const` constructors wherever possible — reduces rebuilds
- Keep widget tree shallow — extract widgets into separate classes
- Use `ListView.builder()` for long lists — lazy rendering
- Platform-adaptive UI — `Platform.isIOS` for Cupertino vs Material
- Use Impeller renderer (default on iOS, opt-in on Android) for smooth rendering

## Native: iOS (Swift / SwiftUI)

### SwiftUI Patterns
```swift
struct ContentView: View {
    @StateObject private var viewModel = UserViewModel()

    var body: some View {
        NavigationStack {
            List(viewModel.users) { user in
                NavigationLink(value: user) {
                    UserRow(user: user)
                }
            }
            .navigationTitle("Users")
            .navigationDestination(for: User.self) { user in
                UserDetailView(user: user)
            }
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadUsers()
            }
        }
    }
}
```

### iOS Architecture Patterns
- **MVVM** — ViewModel as ObservableObject, View observes with @StateObject
- **Coordinator** — Navigation logic extracted from views
- **Repository** — Data access abstraction (network + cache)
- **async/await** — Modern concurrency with structured tasks

### iOS-Specific Features
- **Widgets** — WidgetKit for home screen and lock screen widgets
- **App Clips** — Lightweight app experiences without full install
- **SharePlay** — Real-time shared experiences
- **Core Data / SwiftData** — Local persistence with sync
- **CloudKit** — Apple's cloud database with sync

## Native: Android (Kotlin / Jetpack Compose)

### Compose Patterns
```kotlin
@Composable
fun UserListScreen(
    viewModel: UserViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Users") }) }
    ) { padding ->
        when (val state = uiState) {
            is UiState.Loading -> CircularProgressIndicator()
            is UiState.Success -> {
                LazyColumn(contentPadding = padding) {
                    items(state.users) { user ->
                        UserCard(user = user, onClick = { viewModel.selectUser(it) })
                    }
                }
            }
            is UiState.Error -> ErrorMessage(state.message)
        }
    }
}
```

### Android Architecture (Recommended)
- **MVVM + Clean Architecture** — Google's recommended approach
- **Hilt** — Dependency injection
- **Navigation Compose** — Type-safe navigation
- **Room** — SQLite abstraction for local persistence
- **DataStore** — Modern replacement for SharedPreferences

### Android-Specific Features
- **App Widgets** — Glance (Jetpack Compose for widgets)
- **WorkManager** — Reliable background processing
- **Foreground Services** — Long-running tasks with notification
- **Dynamic Feature Modules** — Download features on demand
- **Material 3** — Dynamic color, Material You theming

## Mobile-Specific Patterns

### App Lifecycle
| iOS State | Android State | Description |
|-----------|---------------|-------------|
| Active | Resumed | App is in foreground, receiving events |
| Inactive | Paused | App visible but not receiving events |
| Background | Stopped | App not visible, limited execution |
| Suspended | — | App in memory but not executing |
| Not Running | Destroyed | App not in memory |

### Deep Linking / Universal Links
```
// URL scheme: myapp://users/123
// Universal link: https://myapp.com/users/123

// React Native (React Navigation)
const linking = {
  prefixes: ['myapp://', 'https://myapp.com'],
  config: {
    screens: {
      User: 'users/:id',
      Settings: 'settings',
    },
  },
};

// Flutter (go_router)
GoRouter(
  routes: [
    GoRoute(path: '/users/:id', builder: (context, state) =>
      UserScreen(id: state.pathParameters['id']!)),
  ],
);
```

### Push Notifications
- **FCM** (Firebase Cloud Messaging) — Android + iOS
- **APNs** (Apple Push Notification Service) — iOS native
- Request permission gracefully — explain value before asking
- Support notification categories and actions
- Handle notification tap to deep link into specific screen
- Silent/background push for data sync

### Biometric Authentication
- Face ID / Touch ID (iOS) via LocalAuthentication
- Fingerprint / Face (Android) via BiometricPrompt
- Always provide fallback (PIN, password)
- Store sensitive data in Keychain (iOS) / Keystore (Android)

### Permissions
- Request at time of use, not on launch
- Explain why permission is needed before requesting
- Handle denial gracefully — degrade functionality, don't crash
- Check permission status before requesting again

## Offline-First Architecture

### Local Storage Options
| Technology | Platform | Best For |
|------------|----------|----------|
| SQLite / Room | Android | Complex relational data |
| Core Data / SwiftData | iOS | Apple-integrated persistence |
| Realm | Both | Cross-platform object database |
| MMKV | Both | Fast key-value storage |
| Hive | Flutter | Lightweight, Dart-native |
| AsyncStorage / MMKV | React Native | Simple key-value data |

### Sync Strategies
- **Optimistic sync** — Write locally, sync to server in background
- **Conflict resolution** — Last-write-wins, server-wins, or manual merge
- **Queue-based** — Queue mutations offline, replay when online
- **Delta sync** — Only sync changes since last sync timestamp

### Best Practices
- Design for offline first — assume network is unreliable
- Show cached data immediately, refresh in background
- Queue user actions when offline, sync when reconnected
- Visual indicators for sync status (synced, pending, conflict)
- Test with airplane mode and poor network conditions

## Navigation Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| Stack | Linear flows, drill-down | NavigationStack, NavHost, Stack.Navigator |
| Tab | Top-level sections | TabView, BottomNavigation, Tab.Navigator |
| Drawer | Many sections, settings | NavigationDrawer, Drawer.Navigator |
| Modal | Alerts, forms, detail views | .sheet, BottomSheet, Modal |
| Bottom Sheet | Quick actions, filters | .presentationDetents, ModalBottomSheet |

## Performance Optimization

### Render Performance
- Flatten view hierarchy — avoid deeply nested layouts
- Use lazy lists — `LazyColumn`, `FlatList`, `ListView.builder()`
- Minimize re-renders — memoize, use keys, const constructors
- Avoid overdraw — don't stack opaque views unnecessarily

### Startup Performance
- Reduce initial bundle size — code splitting, lazy module loading
- Defer non-critical initialization — load after first frame
- Use splash screen — iOS Launch Storyboard, Android SplashScreen API
- Profile startup — Xcode Instruments, Android Profiler, Flipper

### Memory Management
- Profile with Xcode Instruments (iOS) or Android Profiler
- Watch for retain cycles (iOS) — use `[weak self]` in closures
- Release large resources (images, video) when not visible
- Use image caching libraries — SDWebImage, Coil, cached_network_image

## Platform Design Guidelines

### Apple Human Interface Guidelines (iOS)
- Tab bar for top-level navigation (max 5 tabs)
- Large titles in navigation bars
- SF Symbols for icons
- Haptic feedback for meaningful interactions
- Respect Dynamic Type (accessibility text sizing)

### Material Design 3 (Android)
- Navigation bar (bottom) or navigation rail (tablet)
- Material You — dynamic color from wallpaper
- Top app bars with scroll behavior
- FAB (Floating Action Button) for primary actions
- Predictive back gesture support

## App Distribution

### iOS
- **TestFlight** — Beta testing (up to 10,000 testers)
- **App Store** — Public distribution (Apple review required)
- **Enterprise** — In-house distribution with Enterprise certificate
- **Ad Hoc** — Direct install for up to 100 registered devices

### Android
- **Google Play** — Public distribution (review process)
- **Google Play Internal Testing** — Fast iteration, no review
- **Firebase App Distribution** — Beta testing
- **APK / AAB sideloading** — Direct install (requires opt-in)

### CI/CD for Mobile
- **Fastlane** — Automate screenshots, builds, signing, deployment
- **EAS Build** (Expo) — Cloud builds for React Native
- **Codemagic** — CI/CD for Flutter
- **Xcode Cloud** — Apple's native CI/CD
- **GitHub Actions** — Universal CI with mobile-specific actions

## Technology Recommendations

### By Use Case
| Use Case | Recommended Stack |
|----------|-------------------|
| Startup, both platforms | React Native (Expo) + Zustand + TanStack Query |
| Custom UI, both platforms | Flutter + Riverpod + go_router |
| iOS-only app | SwiftUI + Combine + async/await |
| Android-only app | Kotlin + Jetpack Compose + Hilt + Room |
| Web app → Mobile | Capacitor + existing web frontend |
| Shared logic, native UI | Kotlin Multiplatform + SwiftUI/Compose |
| Enterprise, internal | React Native (Expo) or Flutter |
