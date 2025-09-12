# Recommended VS Code Setup - Snappy Jason

## 🔧 Essential Extensions

### **TypeScript & React**

- **TypeScript Importer** - Auto import TypeScript modules
- **ES7+ React/Redux/React-Native snippets** - Code snippets
- **Bracket Pair Colorizer 2** - Color matching brackets
- **Auto Rename Tag** - Rename paired HTML/JSX tags

### **Code Quality**

- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Code Spell Checker** - Catch typos in code
- **SonarLint** - Code quality and security

### **Tauri Development**

- **rust-analyzer** - Rust language support
- **Better TOML** - TOML file support for Cargo.toml
- **Tauri** - Official Tauri extension

### **Git & Productivity**

- **GitLens** - Enhanced Git capabilities
- **Git Graph** - Visual git history
- **Todo Tree** - Highlight TODO comments
- **Path Intellisense** - Autocomplete file paths

## ⚙️ Workspace Settings

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "editor.codeActionsOnSave": {
    "source.organizeImports": true,
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.exclude": {
    "**/node_modules": true,
    "**/target": true,
    "**/.git": true,
    "**/dist": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/target": true,
    "**/dist": true
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
```

## 🎯 Code Snippets

Create `.vscode/snippets.json`:

```json
{
  "Zustand Store": {
    "prefix": "zustore",
    "body": [
      "import { create } from 'zustand';",
      "",
      "interface ${1:Feature}State {",
      "  ${2:data}: ${3:string};",
      "  loading: boolean;",
      "  error: string | null;",
      "  set${1/(.*)/${1:/capitalize}/}: (${2:data}: ${3:string}) => void;",
      "  setLoading: (loading: boolean) => void;",
      "  setError: (error: string | null) => void;",
      "}",
      "",
      "export const use${1/(.*)/${1:/capitalize}/}Store = create<${1:Feature}State>((set) => ({",
      "  ${2:data}: ${4:''},",
      "  loading: false,",
      "  error: null,",
      "  set${1/(.*)/${1:/capitalize}/}: (${2:data}) => set({ ${2:data} }),",
      "  setLoading: (loading) => set({ loading }),",
      "  setError: (error) => set({ error }),",
      "}));"
    ],
    "description": "Create a Zustand store with common state"
  },
  "Custom Hook": {
    "prefix": "usehook",
    "body": [
      "import { use${1:Feature}Store } from './${2:featureStore}';",
      "",
      "export const use${1:Feature} = () => {",
      "  const { ${3:data}, loading, error, set${1:Feature}, setLoading, setError } = use${1:Feature}Store();",
      "",
      "  const ${4:action} = async () => {",
      "    setLoading(true);",
      "    setError(null);",
      "    try {",
      "      // Your logic here",
      "      $0",
      "    } catch (err) {",
      "      setError(err instanceof Error ? err.message : 'Unknown error');",
      "    } finally {",
      "      setLoading(false);",
      "    }",
      "  };",
      "",
      "  return {",
      "    ${3:data},",
      "    loading,",
      "    error,",
      "    ${4:action},",
      "  };",
      "};"
    ],
    "description": "Create a custom hook with common patterns"
  },
  "Feature Index": {
    "prefix": "featindex",
    "body": [
      "export { use${1:Feature} } from './use${1:Feature}';",
      "export { use${1:Feature}Store } from './${2:featureStore}';",
      "export type { ${1:Feature}State } from './${2:featureStore}';"
    ],
    "description": "Create feature index exports"
  }
}
```

## 🔍 Debug Configuration

Your existing `.vscode/launch.json` is already set up! It includes:

- **Tauri Dev** - Start development server
- **Tauri Build** - Build for production
- **Yarn Install** - Install dependencies

## 🚀 Productivity Tips

### **Quick Navigation**

- `Ctrl/Cmd + P` - Quick file open
- `Ctrl/Cmd + Shift + P` - Command palette
- `Ctrl/Cmd + T` - Go to symbol in workspace
- `F12` - Go to definition

### **Multi-cursor Editing**

- `Alt + Click` - Add cursor
- `Ctrl/Cmd + D` - Select next occurrence
- `Ctrl/Cmd + Shift + L` - Select all occurrences

### **Refactoring**

- `F2` - Rename symbol
- `Ctrl/Cmd + Shift + R` - Refactor (extract function, etc.)
- `Alt + Shift + O` - Organize imports

### **Code Organization**

- Use `// TODO:` comments - they'll show in Todo Tree
- Use `// FIXME:` for urgent issues
- Use `// NOTE:` for important information

## 📁 Workspace Organization

Keep your workspace organized:

```
.vscode/
├── settings.json     # Workspace settings
├── launch.json       # Debug configurations
├── tasks.json        # Custom tasks
└── extensions.json   # Recommended extensions
```

## 🎨 Theme Recommendations

Popular themes that work well for React/TypeScript:

- **One Dark Pro** - Dark theme with great syntax highlighting
- **Material Theme** - Clean, modern colors
- **GitHub Theme** - Light/dark themes from GitHub
- **Dracula** - High contrast, easy on eyes
