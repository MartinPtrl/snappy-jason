# Snappy Jason - Architecture & Refactoring Vision

## 🎯 Project Vision

Snappy Jason is evolving from a monolithic React application into a well-structured, maintainable codebase using feature-based architecture. This document outlines our architectural decisions and the state of the ongoing refactor.

## 📁 Architecture Overview

### Feature-Based Organization

We organize code by features instead of technical layers to keep modules cohesive and easy to evolve.

```
src/
├── features/                  # Feature-based modules
│   ├── file/                  # Open/restore file, parse progress, cancel
│   └── tree/                  # JSON tree view, expand/collapse, lazy loading
├── shared/                    # Shared UI, utilities and types
│   ├── types.ts               # TypeScript interfaces
│   ├── highlightUtils.tsx     # Highlighting helpers for search
│   ├── ProgressBar.tsx        # Parsing progress UI (+ Cancel)
│   ├── Updater.tsx            # Auto-update UI (Tauri updater)
│   └── index.ts               # Shared exports (icons, toggles, etc.)
└── App.tsx                    # Main orchestrator + Search UI & paging
```

### State Management - Zustand

- Why Zustand: lightweight, TypeScript-friendly, minimal boilerplate
- Structure: one store slice per feature (e.g., `fileStore`, `treeStore`)
- Benefits: clear data flow, easy testing, minimal re-renders

### Component Strategy

- Custom hooks encapsulate business logic (e.g., `useFileOperations`, `useTreeOperations`)
- UI components stay focused on presentation; reusable parts live in `shared/`
- Absolute imports via Vite path aliases: `@`, `@features`, `@shared`

## 🚀 Migration Strategy

We refactor incrementally to keep the app running at all times.

1. Phase 1: Foundation (✅ Complete)

- Install Zustand, create folder structure, extract shared types

2. Phase 2: File Feature (✅ Complete)

- Extract file open/restore to `features/file`
- Add parse progress and cancel (`ProgressBar` + `cancel_parse`)
- Persist last-opened file via Tauri config

3. Phase 3: Tree Feature (✅ Complete)

- Move `Tree`, `TreeNode`, `TreeNodeContainer` to `features/tree`
- Add expand/collapse controls and lazy loading
- Root-level infinite scroll with IntersectionObserver

4. Phase 4: Search (🚧 In Progress)

- Search UI in `App.tsx` with options: keys, values, paths; case-sensitive, whole-word, regex
- Backend paging (`offset/limit`) and infinite scroll for results
- Match highlighting and optional full string previews per result
- Next: consider extracting search state to `features/search`

5. Phase 5: App Cleanup (📋 Planned)

- Simplify `App.tsx` to orchestrate features and layout
- Add error boundaries and optimize re-renders

## 📊 Current Progress

### ✅ Completed

- Feature-based folder structure and path aliases
- File feature with parse progress + cancel and last-file persistence
- Tree feature with expand/collapse and infinite scroll

### 🚧 In Progress

- Search with paging, highlighting, and result infinite scroll

## 🧩 Cross-Cutting Concerns

### Progress & Cancellation

- Backend emits `parse_progress` events; `useFileOperations` tracks `parseProgress` (0–100)
- `ProgressBar` displays progress and wires `onCancel` to the `cancel_parse` command

### Auto-Update

- `shared/Updater.tsx` uses `@tauri-apps/plugin-updater` to check/download updates and prompt for restart

### Infinite Scroll

- Root nodes: sentinel triggers `load_children` to fetch next page
- Search: sentinel appends next `search` page (offset/limit) when visible

## 🎓 Learning Resources

- Zustand: https://github.com/pmndrs/zustand
- Feature-based architecture: https://feature-sliced.design/
- React hooks best practices: https://react.dev/learn/reusing-logic-with-custom-hooks

---

This architecture is designed to grow with the project. As new features are added, the pattern becomes clearer and more valuable.
