# Snappy Jason - Architecture & Refactoring Vision

## 🎯 Project Vision

Snappy Jason is evolving from a monolithic React application into a well-structured, maintainable codebase using feature-based architecture. This document outlines our architectural decisions and refactoring approach.

## 📁 Architecture Overview

### **Feature-Based Organization**

We organize code by **features** rather than technical layers, making it easier to understand, maintain, and extend as new features are added.

```
src/
├── features/            # Feature-based modules
│   ├── file/            # File operations (load, save, config)
│   ├── tree/            # JSON tree view & navigation
│   └── search/          # Search functionality
├── shared/              # Shared utilities and types
│   ├── types.ts         # TypeScript interfaces
│   ├── utils/           # Utility functions
│   └── hooks/           # Shared custom hooks
└── App.tsx              # Main orchestrator component
```

### **State Management - Zustand**

- **Why Zustand?** Lightweight, TypeScript-friendly, no boilerplate
- **Store Structure:** Feature-based slices that can be combined
- **Benefits:** Better DevTools, easier testing, clear data flow

### **Component Strategy**

- **Custom Hooks:** Extract complex logic (useFileOperations, useSearch, useInfiniteScroll)
- **Feature Components:** Self-contained within their feature folders
- **Shared Components:** Only truly reusable components go in shared/

## 🚀 Migration Strategy

### **Incremental Refactoring**

We're refactoring **incrementally** to maintain stability:

1. **Phase 1:** Foundation (✅ Complete)

   - Install Zustand
   - Create folder structure
   - Extract shared types

2. **Phase 2:** File Operations Feature

   - Extract file loading, saving, config management
   - Create fileStore.ts (Zustand slice)
   - Create useFileOperations.ts (custom hook)

3. **Phase 3:** Tree Feature

   - Extract TreeNode components
   - Implement infinite scroll logic
   - Create treeStore.ts for expansion state

4. **Phase 4:** Search Feature

   - Extract search components and logic
   - Create searchStore.ts
   - Implement search state management

5. **Phase 5:** App Cleanup
   - Refactor main App.tsx to orchestrate features
   - Remove redundant state
   - Optimize performance

### **Benefits of This Approach**

- ✅ **Non-breaking:** App continues working throughout refactor
- ✅ **Testable:** Each feature can be tested in isolation
- ✅ **Maintainable:** Clear separation of concerns
- ✅ **Scalable:** Easy to add new features without affecting existing ones

## 🔧 Development Guidelines

### **Adding New Features**

1. Create feature folder: `src/features/my-feature/`
2. Add store slice: `myFeatureStore.ts`
3. Create custom hook: `useMyFeature.ts`
4. Add components: `MyFeatureComponent.tsx`
5. Export from `index.ts`

### **File Naming Conventions**

- **Stores:** `featureStore.ts` (e.g., `fileStore.ts`)
- **Hooks:** `useFeatureName.ts` (e.g., `useFileOperations.ts`)
- **Components:** `PascalCase.tsx` (e.g., `TreeNode.tsx`)
- **Types:** Co-located with feature or in `shared/types.ts`

### **Import Strategy**

- **Absolute imports:** From feature root (`@features/file`)
- **Relative imports:** Within same feature only
- **Shared imports:** From `@shared/`

## 📊 Current Progress

### ✅ Completed (Phase 1)

- [x] Zustand installation
- [x] Folder structure creation
- [x] TypeScript interfaces extraction
- [x] Updated imports to use absolute paths
- [x] Configured TypeScript and Vite path mapping

### ✅ Completed (Phase 2)

- [x] Extract file operations to `src/features/file/`
- [x] Create fileStore.ts with Zustand
- [x] Build useFileOperations hook with pagination support
- [x] Update App.tsx to use new file feature
- [x] Fixed broken pagination functionality

### 🚧 Next Steps (Phase 3)

- [ ] Extract tree view components to `src/features/tree/`
- [ ] Create treeStore.ts for expansion state
- [ ] Build useTreeOperations hook
- [ ] Extract infinite scroll logic

## 🎓 Learning Resources

- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Feature-Based Architecture](https://feature-sliced.design/)
- [React Custom Hooks Best Practices](https://react.dev/learn/reusing-logic-with-custom-hooks)

---

_This architecture is designed to grow with the project. As new features are added, the pattern becomes clearer and more valuable._
