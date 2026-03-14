---
name: react-native-patterns
description: React Native 0.73+ patterns covering New Architecture, Expo, navigation, state management, native modules, and performance
license: Apache-2.0
compatibility: opencode
---

# React Native Patterns Skill

This skill provides patterns and best practices for building production-quality React Native mobile applications using modern tooling and the New Architecture.

## When to Use

Use this skill when:
- Building cross-platform mobile apps for iOS and Android
- Your team has React/TypeScript expertise
- You need native-level performance with JavaScript developer experience
- Using Expo for managed or bare workflow
- Integrating with native iOS (Swift/ObjC) or Android (Kotlin/Java) code
- Targeting OTA update capabilities with EAS Update or CodePush

## Project Structure

```
my-rn-app/
├── app/                       # Expo Router file-based routes (if using Expo Router)
│   ├── (tabs)/                # Tab layout group
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   └── settings.tsx
│   ├── (auth)/                # Auth flow group
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── _layout.tsx            # Root layout
│   └── +not-found.tsx
├── src/
│   ├── components/            # Shared UI components
│   │   ├── ui/                # Primitives (Button, Input, Card)
│   │   └── features/          # Feature-specific components
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Utilities, API client, constants
│   ├── stores/                # Zustand/Jotai stores
│   ├── services/              # API service layer
│   ├── types/                 # TypeScript type definitions
│   └── theme/                 # Design tokens, colors, spacing
├── modules/                   # Turbo Native Modules (if needed)
│   └── my-native-module/
│       ├── android/
│       ├── ios/
│       └── src/
├── assets/                    # Images, fonts, animations
├── ios/                       # iOS native project
├── android/                   # Android native project
├── app.json                   # Expo config (or app.config.ts)
├── metro.config.js
├── babel.config.js
├── tsconfig.json
└── eas.json                   # EAS Build configuration
```

## Key Patterns

### Navigation (React Navigation)

```typescript
// app/_layout.tsx — Expo Router root layout
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
```

For traditional React Navigation, use `createNativeStackNavigator` with typed `ParamList` generics. Always type your navigation params for compile-time safety. Configure deep linking via `app.config.ts` with `scheme` and `expo-router` plugin origin.

### Platform-Specific Code

```typescript
// Using Platform.select
import { Platform, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.select({ ios: 44, android: 0 }),
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 4 },
    }),
  },
});

// Using file extensions: Button.ios.tsx / Button.android.tsx
// Metro bundler auto-resolves the correct file per platform
```

## State Management

### Zustand (Recommended)

```typescript
// src/stores/auth-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: async (email, password) => {
        const { token, user } = await api.login(email, password);
        set({ token, user });
      },
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### React Query for Server State

```typescript
// src/hooks/use-posts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function usePosts() {
  return useQuery({
    queryKey: ["posts"],
    queryFn: () => api.getPosts(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePostInput) => api.createPost(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });
}
```

## Performance Best Practices

### FlatList Optimization

```typescript
import { FlatList } from "react-native";
import { useCallback } from "react";

function PostList({ posts }: { posts: Post[] }) {
  const renderItem = useCallback(
    ({ item }: { item: Post }) => <PostCard post={item} />,
    []
  );
  const keyExtractor = useCallback((item: Post) => item.id, []);

  return (
    <FlatList
      data={posts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={5}
      removeClippedSubviews={true}
      getItemLayout={(_, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
    />
  );
}
```

### General Performance

- Use Hermes engine (enabled by default in RN 0.70+) for faster startup and lower memory
- Avoid inline styles and anonymous functions in render (causes re-renders)
- Use `React.memo` for list item components
- Use `useMemo`/`useCallback` for expensive computations and stable references
- Prefer `FlashList` from Shopify over `FlatList` for large lists
- Use `react-native-mmkv` instead of AsyncStorage for fast synchronous storage
- Minimize bridge crossings; batch native calls where possible
- Profile with Flipper, React DevTools, and Xcode Instruments / Android Profiler

### Animations
- Use `react-native-reanimated` with `useSharedValue` and `useAnimatedStyle` for performant animations that run on the UI thread
- Pair with `react-native-gesture-handler` using the `Gesture` API (Pan, Pinch, Tap) for gesture-driven animations
- Use `withSpring`, `withTiming`, and `withDecay` for natural animation curves
- Avoid the legacy `Animated` API for complex animations; Reanimated runs on the native thread

## New Architecture

React Native 0.73+ includes the New Architecture by default:

- **Fabric**: New rendering system with synchronous access to native views
- **TurboModules**: Lazy-loaded native modules with type-safe codegen
- **Codegen**: Generates native interfaces from TypeScript/Flow specs
- Enable in `app.json`: `"newArchEnabled": true`

### Turbo Native Modules

```typescript
// modules/my-module/src/NativeMyModule.ts
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
  getDeviceName(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("MyModule");
```

## Anti-Patterns to Avoid

- **Inline functions in JSX props** — Creates new references every render, breaks memoization
- **Using ScrollView for long lists** — Renders all items; use FlatList or FlashList instead
- **Ignoring TypeScript for navigation** — Type your param lists to catch errors at compile time
- **Console.log in production** — Remove or use `__DEV__` guard; logs are expensive on the bridge
- **Large images without resizing** — Use `expo-image` or `react-native-fast-image` with proper sizing
- **Storing large data in AsyncStorage** — Use SQLite (expo-sqlite) or MMKV for structured/large data
- **Ignoring keyboard behavior** — Use `KeyboardAvoidingView` and test on both platforms
- **Not testing on real devices** — Simulators miss performance issues, gesture bugs, and native quirks

## Platform-Specific Considerations

- **iOS**: Test on multiple screen sizes; handle safe areas with `SafeAreaView` or `useSafeAreaInsets`; configure push notifications via APNs; handle universal links
- **Android**: Handle back button behavior; test on low-end devices; configure Firebase Cloud Messaging for push; handle deep links via intent filters
- **Both**: Use `Platform.OS` checks sparingly; prefer responsive design; test dark mode and accessibility settings

## Testing Approach

- **Unit tests**: Vitest or Jest for utility functions, stores, and hooks
- **Component tests**: React Native Testing Library for rendering and interaction
- **Snapshot tests**: Use sparingly; prefer behavioral assertions
- **E2E tests**: Detox (recommended) or Maestro for full integration flows
- **Type checking**: Strict TypeScript with typed navigation params

```typescript
// __tests__/PostCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { PostCard } from "../src/components/PostCard";

test("displays post title and handles press", () => {
  const onPress = jest.fn();
  render(<PostCard post={{ id: "1", title: "Hello" }} onPress={onPress} />);

  expect(screen.getByText("Hello")).toBeTruthy();
  fireEvent.press(screen.getByText("Hello"));
  expect(onPress).toHaveBeenCalledWith("1");
});
```

## Distribution and Packaging

### Expo Application Services (EAS)
- Configure `eas.json` with build profiles: `development` (dev client, internal), `preview` (internal distribution), `production` (auto-increment, store)
- Configure `submit` profiles with Apple ID and Google service account for automated store submission

### OTA Updates
- **EAS Update**: Native Expo solution; supports runtime version targeting and rollbacks
- **CodePush** (App Center): Microsoft solution; supports staged rollouts
- OTA updates can only change JavaScript and assets, not native code
- Always test OTA updates against production native builds

### Build Commands
- `eas build --platform all` — Build for iOS and Android
- `eas submit --platform all` — Submit to App Store and Play Store
- `eas update --branch production` — Push OTA update
- For bare workflow: use Xcode and Android Studio, or Fastlane for CI/CD
