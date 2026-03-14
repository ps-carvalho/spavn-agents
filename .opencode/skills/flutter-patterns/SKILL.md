---
name: flutter-patterns
description: Flutter 3.x and Dart 3 patterns covering widget architecture, state management, navigation, platform channels, testing, and distribution
license: Apache-2.0
compatibility: opencode
---

# Flutter Patterns Skill

This skill provides patterns and best practices for building production-quality Flutter applications with Dart 3 features, modern state management, and cross-platform distribution.

## When to Use

Use this skill when:
- Building cross-platform mobile apps (iOS, Android) with a single codebase
- Targeting web, desktop (macOS, Windows, Linux), or embedded platforms
- You want pixel-perfect custom UI with high-performance rendering
- Your team is comfortable with Dart or wants a strongly typed language
- You need consistent UI across platforms (no native widget differences)
- Building apps with complex animations or custom paint/draw requirements

## Project Structure (Feature-First)

```
my_flutter_app/
├── lib/
│   ├── main.dart              # Entry point, app configuration
│   ├── app/
│   │   ├── app.dart           # MaterialApp/CupertinoApp widget
│   │   ├── router.dart        # GoRouter configuration
│   │   └── theme.dart         # Theme definitions (Material 3)
│   ├── core/                  # Shared infrastructure
│   │   ├── constants/
│   │   ├── extensions/        # Dart extension methods
│   │   ├── errors/            # Custom exceptions and failures
│   │   ├── network/           # HTTP client, interceptors
│   │   ├── storage/           # Local storage abstractions
│   │   └── utils/
│   ├── features/              # Feature modules
│   │   ├── auth/
│   │   │   ├── data/          # Repositories, data sources, models
│   │   │   ├── domain/        # Entities, repository interfaces
│   │   │   ├── presentation/  # Screens, widgets, providers/blocs
│   │   │   └── auth.dart      # Barrel export
│   │   ├── home/
│   │   │   ├── data/
│   │   │   ├── domain/
│   │   │   └── presentation/
│   │   └── settings/
│   └── shared/                # Shared widgets and utilities
│       ├── widgets/
│       └── providers/
├── test/
│   ├── features/
│   │   └── auth/
│   │       ├── data/
│   │       ├── domain/
│   │       └── presentation/
│   ├── core/
│   └── helpers/               # Test utilities, mocks, fakes
├── integration_test/
│   └── app_test.dart
├── assets/
│   ├── images/
│   ├── fonts/
│   └── l10n/                  # Localization ARB files
├── android/
├── ios/
├── pubspec.yaml
├── analysis_options.yaml
└── l10n.yaml
```

## Key Patterns

### Widget Architecture

```dart
// Stateless widget — use for purely presentational UI
class UserCard extends StatelessWidget {
  const UserCard({super.key, required this.user, this.onTap});

  final User user;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ListTile(
        leading: CircleAvatar(backgroundImage: NetworkImage(user.avatarUrl)),
        title: Text(user.name, style: theme.textTheme.titleMedium),
        subtitle: Text(user.email),
        onTap: onTap,
      ),
    );
  }
}
```

Use `StatefulWidget` when managing local mutable state (text controllers, timers, animations). Always dispose controllers and timers in `dispose()`. Keep `StatefulWidget` usage minimal; prefer extracting logic into providers or hooks.

### Dart 3 Features

```dart
// Sealed classes for exhaustive pattern matching
sealed class AuthState {}

class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthAuthenticated extends AuthState {
  final User user;
  AuthAuthenticated(this.user);
}
class AuthError extends AuthState {
  final String message;
  AuthError(this.message);
}

// Pattern matching with switch expressions
Widget buildAuthUI(AuthState state) {
  return switch (state) {
    AuthInitial() => const LoginScreen(),
    AuthLoading() => const CircularProgressIndicator(),
    AuthAuthenticated(:final user) => HomeScreen(user: user),
    AuthError(:final message) => ErrorWidget(message: message),
  };
}

// Records for multiple return values
(String name, int age) parseUser(Map<String, dynamic> json) {
  return (json['name'] as String, json['age'] as int);
}
```

### Navigation (GoRouter)

- Define routes with `GoRouter(routes: [...])` and use `ShellRoute` for persistent navigation shells (bottom tabs)
- Use `redirect` callback for auth guards (check auth state, redirect to login if unauthenticated)
- Access path parameters via `state.pathParameters['id']` and query parameters via `state.uri.queryParameters`
- Use `context.go('/path')` for navigation and `context.push('/path')` for pushing onto the stack
- Configure deep linking by defining URL paths that map to your route structure

## State Management

### Riverpod 2.0 (Recommended)

```dart
// Providers
@riverpod
Future<List<Post>> posts(PostsRef ref) async {
  final repository = ref.watch(postRepositoryProvider);
  return repository.getPosts();
}

@riverpod
class PostNotifier extends _$PostNotifier {
  @override
  Future<List<Post>> build() async {
    return ref.watch(postRepositoryProvider).getPosts();
  }

  Future<void> addPost(CreatePostInput input) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(postRepositoryProvider).createPost(input);
      return ref.read(postRepositoryProvider).getPosts();
    });
  }
}
```

```dart
// Consuming in widgets
class PostListScreen extends ConsumerWidget {
  const PostListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final postsAsync = ref.watch(postsProvider);

    return postsAsync.when(
      data: (posts) => ListView.builder(
        itemCount: posts.length,
        itemBuilder: (context, index) => PostCard(post: posts[index]),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(child: Text('Error: $error')),
    );
  }
}
```

### BLoC/Cubit (Alternative)
- Use `Cubit<State>` for simpler state machines (emit new states directly)
- Use full `Bloc<Event, State>` when you need event-driven architecture with `mapEventToState`
- Pair with `BlocBuilder`, `BlocListener`, and `BlocConsumer` widgets
- Use `bloc_test` package for testing: `blocTest('description', build: () => MyCubit(), act: ..., expect: [...])`

## Performance Best Practices

- Use `const` constructors everywhere possible to enable widget caching
- Use `RepaintBoundary` to isolate frequently updating widgets from the rest of the tree
- Avoid rebuilding large widget subtrees; split into smaller widgets
- Use `ListView.builder` and `GridView.builder` for large lists (lazy rendering)
- Cache network images with `cached_network_image` package
- Profile with Flutter DevTools (widget rebuild tracker, timeline, memory)
- Minimize `setState` scope; only rebuild what changed
- Use `Isolate.run` for heavy computation (JSON parsing, image processing)
- Avoid `Opacity` widget for hiding content; use `Visibility` or conditional rendering
- Pre-compile shaders with `--bundle-sksl-path` for smoother first-run animations

```dart
// Offload heavy work to an isolate
Future<List<User>> parseUsers(String jsonString) async {
  return Isolate.run(() {
    final List<dynamic> data = jsonDecode(jsonString);
    return data.map((e) => User.fromJson(e)).toList();
  });
}
```

## Platform Channels
- Use `MethodChannel('com.myapp/feature')` for request-response calls to native code (Swift/Kotlin)
- Use `EventChannel` for streaming data from native to Dart (sensors, location updates)
- Define channel names with reverse-domain notation to avoid conflicts
- Always handle `MissingPluginException` for platforms that do not implement the channel
- Prefer existing plugins from pub.dev before writing custom platform channels

## Theming (Material 3)
- Use `ColorScheme.fromSeed()` to generate a full Material 3 color scheme from a single seed color
- Set `useMaterial3: true` in `ThemeData` (default in Flutter 3.16+)
- Customize component themes (`CardTheme`, `InputDecorationTheme`, `AppBarTheme`) for consistency
- Support dark mode by creating both light and dark themes with the same seed color
- Use `GoogleFonts` package for custom typography or define a custom `TextTheme`

## Anti-Patterns to Avoid

- **Putting logic in widgets** — Extract business logic into providers, cubits, or services
- **Deep nesting** — Break large `build` methods into smaller extracted widgets or methods
- **Using GlobalKey excessively** — Expensive; prefer passing data via constructor or state management
- **setState in the root widget** — Rebuilds the entire tree; scope state changes narrowly
- **Ignoring `dispose`** — Always dispose controllers, timers, streams, and animation controllers
- **String-based routing** — Use typed routing (GoRouter with code generation or typed helpers)
- **Blocking the UI isolate** — Move JSON parsing, file I/O, and image processing to `Isolate.run`
- **Not using const constructors** — Missing `const` on static widgets wastes rebuild cycles
- **Overusing InheritedWidget directly** — Use Riverpod or Provider instead for cleaner API

## Platform-Specific Considerations

- **iOS**: Follow Human Interface Guidelines for navigation patterns; use `CupertinoPageRoute` for iOS-native transitions; handle safe areas with `SafeArea` widget
- **Android**: Handle back button with `WillPopScope` or `PopScope`; request permissions with `permission_handler`; support Material You dynamic colors
- **Web**: Use `kIsWeb` for web-specific logic; configure URL strategy (`usePathUrlStrategy`); optimize asset loading and initial bundle size
- **Desktop**: Handle window management, keyboard shortcuts, and mouse events; use `window_manager` for window control

## Testing Approach

- **Unit tests**: Test business logic (cubits, repositories, utilities) with `test` package; use `mocktail` for mocking
- **Widget tests**: Use `testWidgets` with `pumpWidget(MaterialApp(home: ...))` to test widget rendering and interaction
- **Golden tests**: Use `matchesGoldenFile('goldens/widget.png')` to catch visual regressions; run `flutter test --update-goldens` to regenerate
- **Integration tests**: Use `integration_test` package with `IntegrationTestWidgetsFlutterBinding`; test full user flows on real devices or emulators
- **BLoC tests**: Use `bloc_test` for stream-based assertion (`expect: [isA<Loading>(), isA<Loaded>()]`)

## Distribution and Packaging

### Build Commands

| Platform | Command | Output |
|----------|---------|--------|
| Android APK | `flutter build apk --release` | `.apk` |
| Android Bundle | `flutter build appbundle` | `.aab` (Play Store) |
| iOS | `flutter build ipa` | `.ipa` (App Store) |
| Web | `flutter build web` | Static files |
| macOS | `flutter build macos` | `.app` |
| Windows | `flutter build windows` | `.exe` |
| Linux | `flutter build linux` | Binary |

### CI/CD
- Use Fastlane for iOS/Android store submission automation
- Use Codemagic or GitHub Actions with Flutter-specific actions
- Run `flutter analyze` and `flutter test` in CI before every build
- Use `--dart-define` for environment-specific configuration
- Configure flavor/schemes for dev, staging, and production builds

### Firebase Integration
- `firebase_core` + `flutterfire_cli` for project setup
- `firebase_auth` for authentication
- `cloud_firestore` for real-time database
- `firebase_messaging` for push notifications
- `firebase_crashlytics` for crash reporting

### Local Storage Options

| Package | Use Case | Performance |
|---------|----------|-------------|
| `shared_preferences` | Simple key-value (settings, flags) | Good |
| `hive` | Structured NoSQL, fast reads | Excellent |
| `isar` | Complex queries, full-text search | Excellent |
| `drift` (SQLite) | Relational data, complex queries | Good |
| `flutter_secure_storage` | Tokens, secrets, credentials | N/A (security) |
