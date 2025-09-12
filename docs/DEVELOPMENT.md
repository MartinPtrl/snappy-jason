# Development Guide - Snappy Jason

## 🚀 Quick Start for New Developers

### **Understanding the Codebase**

1. **Read** [ARCHITECTURE.md](./ARCHITECTURE.md) for the big picture
2. **Explore** the feature-based folder structure in `src/features/`
3. **Check** `src/shared/types.ts` for core TypeScript interfaces

### **Development Workflow**

#### **Prerequisites**

- Node.js 16+
- Yarn package manager
- Rust (for Tauri backend)

#### **Getting Started**

```bash
# Clone and install
git clone <repo-url>
cd snappy-jason
yarn install

# Start development server
yarn tauri dev

# Run TypeScript checks
yarn tsc --noEmit

# Build for production
yarn tauri build
```

## 🏗️ Feature Development

### **Adding a New Feature**

1. **Create Feature Structure**

   ```bash
   mkdir src/features/my-feature
   touch src/features/my-feature/index.ts
   touch src/features/my-feature/myFeatureStore.ts
   touch src/features/my-feature/useMyFeature.ts
   ```

2. **Create Zustand Store Slice**

   ```typescript
   // src/features/my-feature/myFeatureStore.ts
   import { create } from "zustand";

   interface MyFeatureState {
     data: string;
     loading: boolean;
     setData: (data: string) => void;
     setLoading: (loading: boolean) => void;
   }

   export const useMyFeatureStore = create<MyFeatureState>((set) => ({
     data: "",
     loading: false,
     setData: (data) => set({ data }),
     setLoading: (loading) => set({ loading }),
   }));
   ```

3. **Create Custom Hook**

   ```typescript
   // src/features/my-feature/useMyFeature.ts
   import { useMyFeatureStore } from "./myFeatureStore";

   export const useMyFeature = () => {
     const { data, loading, setData, setLoading } = useMyFeatureStore();

     const loadData = async () => {
       setLoading(true);
       try {
         // Your logic here
         setData("loaded data");
       } finally {
         setLoading(false);
       }
     };

     return { data, loading, loadData };
   };
   ```

4. **Export from Index**
   ```typescript
   // src/features/my-feature/index.ts
   export { useMyFeature } from "./useMyFeature";
   export { useMyFeatureStore } from "./myFeatureStore";
   ```

## 🧪 Testing Strategy

### **Unit Testing Features**

- Test custom hooks with `@testing-library/react-hooks`
- Test Zustand stores in isolation
- Mock Tauri invoke calls

### **Integration Testing**

- Test feature components with user interactions
- Verify state management flows
- Test error scenarios

## 🔄 Migration from Legacy Code

### **Refactoring Checklist**

When moving code from the main App.tsx:

1. **Identify Feature Boundaries**

   - What state belongs together?
   - What functions operate on the same data?
   - What can be tested independently?

2. **Extract State to Zustand**

   - Move useState to store
   - Convert setters to actions
   - Add computed values as getters

3. **Create Custom Hook**

   - Wrap store usage
   - Add business logic
   - Handle side effects

4. **Update Components**
   - Replace direct state usage
   - Use custom hook instead
   - Remove redundant props

## 📝 Code Standards

### **TypeScript**

- Always use explicit types for public APIs
- Prefer interfaces over types for object shapes
- Use strict mode settings

### **Components**

- Keep components focused on presentation
- Extract business logic to hooks
- Use meaningful prop names

### **State Management**

- One store per feature
- Actions should be pure when possible
- Use selectors for computed values

### **File Organization**

- One component per file
- Co-locate types with implementation
- Use index.ts for clean exports

## 🐛 Debugging Tips

### **State Issues**

- Use Zustand DevTools browser extension
- Add console.logs in store actions
- Check React DevTools for prop drilling

### **Performance Issues**

- Use React DevTools Profiler
- Check for unnecessary re-renders
- Optimize Zustand selectors

### **Tauri Issues**

- Check browser console for invoke errors
- Use `console.log` in Rust commands
- Verify Tauri configuration

## 📚 Additional Resources

- [VS Code Extensions](./VS_CODE_SETUP.md) - Recommended extensions
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [Contributing](../CONTRIBUTING.md) - How to contribute to the project
