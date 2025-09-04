# Snappy Jason - Fast JSON Viewer

A lightning-fast, desktop JSON viewer built with Tauri, React, and Rust. Snappy Jason provides an intuitive interface for viewing, searching, and navigating large JSON files with ease.

![Snappy Jason Main Interface](public/snappy_jason_main.png)

## Features

- 🚀 **Fast Performance** - Built with Rust backend for blazing-fast JSON parsing
- 🔍 **Powerful Search** - Search through keys, values, and paths with flexible options
- 📁 **Drag & Drop** - Simply drag and drop JSON files to open them
- 💾 **Auto-restore** - Remembers your last opened file across app restarts
- 🎯 **Sticky Header** - Header, filename, and search stay accessible while scrolling
- 🌳 **Tree View** - Expandable/collapsible tree structure for easy navigation
- 🎨 **Clean UI** - Modern, responsive interface optimized for JSON viewing

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://rustup.rs/)
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Run in development mode:
   ```bash
   yarn tauri dev
   ```

### Building

Build the application for production:

```bash
yarn tauri build
```

## Usage

1. **Open a JSON file**: Drag and drop a JSON file onto the application window
2. **Navigate**: Click on objects and arrays to expand/collapse them
3. **Search**: Use the search bar to find specific keys, values, or paths
4. **Search Options**: Toggle search options for keys, values, paths, and case sensitivity
5. **Clear**: Use the "Clear" button to unload the current file

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Styling**: CSS with modern design principles

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
