# Troubleshooting - Snappy Jason

## Auto-Update

- In development, the updater often reports no updates — this is expected.
- Ensure `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` are installed and configured in Tauri.
- If update download fails, check network/proxy and Tauri logs.

## File Parsing Progress

- If the progress bar never moves from 0%, verify backend emits `parse_progress` events and that file path matches the one being parsed.
- Cancelling a parse should clear UI state; if it doesn’t, confirm `cancel_parse` command is implemented.

## Drag and Drop

- Tauri uses `tauri://drag-enter`, `tauri://drag-drop`, and `tauri://drag-leave` events — standard DOM `drop` won’t fire.
- Only `.json` files are accepted; other files show a temporary error.

## Infinite Scroll

- If main tree stops loading more, ensure the sentinel element is visible in the viewport and `mainHasMore` is true.
- For search, results load in pages of 50 when the sentinel is intersecting and `hasMore` is true.

## Common Build Issues

- Rust toolchain issues: run `rustup update` and ensure correct target for your OS.
- Node toolchain issues: delete `node_modules` and run `yarn install`.
- Tauri config changes: re-run `yarn tauri dev` after modifying `tauri.conf.json`.
