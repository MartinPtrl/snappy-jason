import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Node, SearchResult, SearchOptions } from "@/shared/types";
import { useFileOperations } from "@/features/file";
import { Tree, useTreeOperations } from "@/features/tree";
import { CopyIcon, ProgressBar, ToggleThemeButton } from "@shared";
import { Updater } from "@/shared/Updater";
import "./App.css";

function App() {
  // File operations hook
  const {
    fileName,
    loading,
    error,
    nodes,
    loadFile,
    loadClipboard,
    loadLastOpenedFile,
    unloadFile,
    loadMoreNodes,
    parseProgress,
    cancelLoad,
  } = useFileOperations();

  // Other state (non-file related)
  const [isDragOver, setIsDragOver] = useState(false);

  // Main level pagination state
  const [mainHasMore, setMainHasMore] = useState(false);
  const [mainLoading, setMainLoading] = useState(false);
  const mainLoadMoreRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(1); // highest loaded (1-based)
  const [expandedSearchPreviews, setExpandedSearchPreviews] = useState<
    Record<string, boolean>
  >({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAppending, setSearchAppending] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    searchKeys: true,
    searchValues: true,
    searchPaths: false,
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });
  const [searchStats, setSearchStats] = useState({
    totalCount: 0,
    hasMore: false,
  });
  const [showSearchTargetNotification, setShowSearchTargetNotification] =
    useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const searchLoadMoreRef = useRef<HTMLDivElement>(null);

  // Tree operations
  const { handleExpandAll, handleCollapseAll, expandedNodes } =
    useTreeOperations();

  // Clipboard modal & toast state (already declared earlier in code; ensure not duplicated)
  const [showPasteConfirm, setShowPasteConfirm] = useState(false);
  const pastePendingRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const toastTimeoutRef = useRef<number | null>(null);
  // Modal focus management
  const modalRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusableRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const showToast = useCallback((msg: string, duration = 2600) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimeoutRef.current = null;
    }, duration);
  }, []);

  // Helper function to collect expandable node pointers from current level
  const collectExpandablePointers = (nodeArray: any[]): string[] => {
    const pointers: string[] = [];
    nodeArray.forEach((node) => {
      if (
        (node.value_type === "object" || node.value_type === "array") &&
        node.has_children
      ) {
        pointers.push(node.pointer);
      }
    });
    return pointers;
  };

  // Get all currently visible unexpanded nodes by examining the tree structure
  const getNextLevelExpandableNodes = async (): Promise<string[]> => {
    // Start with top-level nodes
    const topLevelPointers = collectExpandablePointers(nodes);

    // Find the first level that has unexpanded nodes
    let currentPointers = topLevelPointers;
    const maxDepth = 10; // Prevent infinite loops

    for (let depth = 0; depth < maxDepth; depth++) {
      const unexpandedAtCurrentLevel = currentPointers.filter(
        (pointer) => !expandedNodes.has(pointer)
      );

      if (unexpandedAtCurrentLevel.length > 0) {
        // Found unexpanded nodes at this level, return them
        return unexpandedAtCurrentLevel;
      }

      // All nodes at this level are expanded, get their children for the next level
      const nextLevelPointers: string[] = [];

      for (const pointer of currentPointers) {
        try {
          const children = await invoke<any[]>("load_children", {
            pointer: pointer,
            offset: 0,
            limit: 1000,
          });

          const expandableChildren = children
            .filter(
              (child) =>
                (child.value_type === "object" ||
                  child.value_type === "array") &&
                child.has_children
            )
            .map((child) => child.pointer);

          nextLevelPointers.push(...expandableChildren);
        } catch (error) {
          console.log(`Failed to load children for ${pointer}:`, error);
        }
      }

      if (nextLevelPointers.length === 0) {
        // No more expandable nodes found
        break;
      }

      currentPointers = nextLevelPointers;
    }

    return [];
  };

  // Handle expand one level progressively
  const onExpandAll = async () => {
    const pointers = await getNextLevelExpandableNodes();
    if (pointers.length > 0) {
      handleExpandAll(pointers);
    }
  };

  // Handle collapse all
  const onCollapseAll = () => {
    handleCollapseAll();
  };

  // Re-run search when options change
  useEffect(() => {
    setShowSearchTargetNotification(false);
    if (isSearchMode && searchQuery.trim()) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery, 1, 50, { append: false });
        setSearchPage(1);
      }, 300);
    }
  }, [searchOptions]);

  const handleFileLoad = useCallback(async (path: string) => {
    // Clear search when loading new file
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");

    await loadFile(path, {
      onSuccess: (nodes: Node[]) => {
        // Check if there might be more nodes at the root level
        setMainHasMore(nodes.length === 100);
      },
      onError: (error: string) => {
        console.error("File load error:", error);
      },
    });
  }, []);

  // Load last opened file on app startup
  useEffect(() => {
    loadLastOpenedFile({
      onSuccess: (nodes: Node[]) => {
        // Check if there might be more nodes at the root level
        setMainHasMore(nodes.length === 100);
      },
    });
  }, []);

  // Listen for Tauri file drop events (this is the ONLY way that works in Tauri)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenHover: (() => void) | null = null;
    let unlistenCancelled: (() => void) | null = null;

    const setupFileDropListener = async () => {
      try {
        console.log("🔧 Setting up Tauri file drop listeners...");

        unlisten = await listen<{ paths: string[] }>(
          "tauri://drag-drop",
          (event: { payload: { paths: string[] } }) => {
            console.log("✅ TAURI DRAG DROP EVENT:", event.payload);
            const filePaths = event.payload.paths;
            if (filePaths.length > 0) {
              const jsonFile = filePaths.find((path: string) =>
                path.toLowerCase().endsWith(".json")
              );
              if (jsonFile) {
                console.log("📁 Loading JSON file via Tauri:", jsonFile);
                // handleFileUnload();
                handleFileLoad(jsonFile);
              } else {
                // Show error in UI by setting a temporary error state
                const tempError = "Please drop a JSON file";
                setSearchError(tempError);
                setTimeout(() => setSearchError(""), 3000);
              }
            }
            setIsDragOver(false);
          }
        );

        unlistenHover = await listen("tauri://drag-enter", () => {
          console.log("📁 TAURI DRAG ENTER");
          setIsDragOver(true);
        });

        unlistenCancelled = await listen("tauri://drag-leave", () => {
          console.log("❌ TAURI DRAG LEAVE");
          setIsDragOver(false);
        });

        console.log("✅ Tauri file drop listeners set up successfully");

        // Store the all events unlisten function
        return () => {
          if (unlisten) unlisten();
          if (unlistenHover) unlistenHover();
          if (unlistenCancelled) unlistenCancelled();
        };
      } catch (error) {
        console.warn("⚠️ Tauri file drop listener setup failed:", error);
        return () => {};
      }
    };

    setupFileDropListener();

    return () => {
      if (unlisten) unlisten();
      if (unlistenHover) unlistenHover();
      if (unlistenCancelled) unlistenCancelled();
    };
  }, []);

  // Main level infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && mainHasMore && !mainLoading) {
          loadMoreMain();
        }
      },
      { threshold: 0.1 }
    );

    if (mainLoadMoreRef.current) {
      observer.observe(mainLoadMoreRef.current);
    }

    return () => {
      if (mainLoadMoreRef.current) {
        observer.unobserve(mainLoadMoreRef.current);
      }
    };
  }, [mainHasMore, mainLoading, nodes.length]);

  const loadMoreMain = async () => {
    if (mainLoading || !mainHasMore) return;

    setMainLoading(true);
    try {
      const result = await loadMoreNodes(nodes.length, 100);
      setMainHasMore(result.length === 100); // If we got exactly 100, there might be more
    } catch (error) {
      console.error("Failed to load more nodes:", error);
    } finally {
      setMainLoading(false);
    }
  };

  const currentSearchIdRef = useRef<number>(0);
  const performSearch = async (
    query: string,
    page: number,
    pageSize: number,
    { append }: { append: boolean }
  ) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchStats({ totalCount: 0, hasMore: false });
      setIsSearchMode(false);
      setShowSearchTargetNotification(false);
      return;
    }
    if (
      !searchOptions.searchKeys &&
      !searchOptions.searchValues &&
      !searchOptions.searchPaths
    ) {
      setShowSearchTargetNotification(true);
      setTimeout(() => setShowSearchTargetNotification(false), 3000);
      return;
    }
    const newId = currentSearchIdRef.current + 1;
    currentSearchIdRef.current = newId;
    if (append) {
      setSearchAppending(true);
    } else {
      setSearchLoading(true);
    }
    setSearchError("");
    setIsSearchMode(true);
    setShowSearchTargetNotification(false);
    try {
      const offset = (page - 1) * pageSize;
      const limit = pageSize;
      const resp = await invoke<{
        results: SearchResult[];
        total_count: number;
        has_more: boolean;
      }>("search", {
        query: query.trim(),
        searchKeys: searchOptions.searchKeys,
        searchValues: searchOptions.searchValues,
        searchPaths: searchOptions.searchPaths,
        caseSensitive: searchOptions.caseSensitive,
        regex: searchOptions.regex,
        wholeWord: searchOptions.wholeWord,
        offset,
        limit,
      });
      if (currentSearchIdRef.current !== newId) return;
      setSearchResults((prev) =>
        append ? [...prev, ...resp.results] : resp.results
      );
      setSearchStats({ totalCount: resp.total_count, hasMore: resp.has_more });
    } catch (error) {
      if (currentSearchIdRef.current !== newId) return;
      setSearchError(`Search failed: ${error}`);
      setSearchResults([]);
      setSearchStats({ totalCount: 0, hasMore: false });
    } finally {
      if (currentSearchIdRef.current === newId) {
        if (append) {
          setSearchAppending(false);
        } else {
          setSearchLoading(false);
        }
      }
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Debounce search by 300ms
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query, 1, 50, { append: false });
      setSearchPage(1);
    }, 300);
  };

  // Pagination disabled in streaming mode

  const handleFileUnload = useCallback(() => {
    // Clear search state
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchPage(1);
    setSearchError("");

    // Clear main level pagination state
    setMainHasMore(false);
    setMainLoading(false);

    unloadFile();
  }, [unloadFile]);

  // Infinite scroll for search results
  useEffect(() => {
    if (!isSearchMode) return;
    if (!searchStats.hasMore) return;
    if (searchLoading || searchAppending) return;
    const el = searchLoadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          // Load next page
          const nextPage = searchPage + 1;
          setSearchPage(nextPage);
          performSearch(searchQuery, nextPage, 50, {
            append: true,
          });
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [
    isSearchMode,
    searchStats.hasMore,
    searchLoading,
    searchAppending,
    searchPage,
    searchQuery,
  ]);

  // Global paste (Ctrl/Cmd+V) to load JSON from clipboard via Rust backend (top-level effect)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      console.log("Keydown event:");
      console.log({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
      const isPaste = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v";
      if (!isPaste) return;
      // Ignore if focused element is an editable field
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          (active as any).isContentEditable
        )
          return;
      }
      e.preventDefault();
      if (loading || pastePendingRef.current) return;
      const hasExisting = nodes.length > 0;
      if (!hasExisting) {
        pastePendingRef.current = true;
        loadClipboard({
          onSuccess: () => showToast("Loaded JSON from clipboard"),
          onError: () => showToast("Clipboard JSON failed", 3000),
        }).finally(() => {
          pastePendingRef.current = false;
        });
        return;
      }
      // Show custom confirm modal
      pastePendingRef.current = true;
      setShowPasteConfirm(true);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [nodes.length, loadClipboard, loading, showToast]);

  // Modal accessibility: ESC close, focus trap, initial focus, and restore focus
  useEffect(() => {
    if (!showPasteConfirm) return;

    previouslyFocusedElementRef.current =
      document.activeElement as HTMLElement | null;

    // Wait for modal to mount, then focus the first button (Cancel)
    requestAnimationFrame(() => {
      firstFocusableRef.current?.focus();
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowPasteConfirm(false);
        pastePendingRef.current = false;
        return;
      }
      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            (last as HTMLElement).focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            (first as HTMLElement).focus();
          }
        }
      }
    };
    window.addEventListener("keydown", keyHandler, { capture: true });
    return () => {
      window.removeEventListener("keydown", keyHandler, {
        capture: true,
      } as any);
      // Restore focus to previously focused trigger element
      previouslyFocusedElementRef.current?.focus();
    };
  }, [showPasteConfirm]);

  return (
    <div className="app">
      {showPasteConfirm && (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paste-confirm-title"
            aria-describedby="paste-confirm-desc"
            ref={modalRef}
          >
            <h3 className="modal-title" id="paste-confirm-title">
              Replace current JSON?
            </h3>
            <p className="modal-body" id="paste-confirm-desc">
              Loading from the clipboard will discard the currently viewed JSON
              tree.
            </p>
            <div className="modal-actions">
              <button
                ref={firstFocusableRef}
                className="btn"
                onClick={() => {
                  setShowPasteConfirm(false);
                  pastePendingRef.current = false;
                }}
              >
                Cancel
              </button>
              <button
                ref={lastFocusableRef}
                className="btn btn-danger"
                onClick={() => {
                  setShowPasteConfirm(false);
                  loadClipboard({
                    onSuccess: () => showToast("Loaded JSON from clipboard"),
                    onError: () => showToast("Clipboard JSON failed", 3000),
                  }).finally(() => {
                    pastePendingRef.current = false;
                  });
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast" role="status" aria-live="polite">
            {toastMessage}
          </div>
        </div>
      )}
      <div className="sticky-header">
        <header className="app-header">
          <h1>Snappy JSON Viewer</h1>
          <div className="header-controls">
            <Updater checkOnStartup={true} />
            <ToggleThemeButton />
            <div className="file-input-container">
              {(fileName || nodes.length > 0) && (
                <button
                  onClick={handleFileUnload}
                  className="file-button unload-button"
                  disabled={loading}
                  title="Clear"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </header>

        {fileName && (
          <div className="file-info">
            <span className="file-name">📄 {fileName}</span>
          </div>
        )}

        {/* Progress bar moved to centered overlay */}

        {((!loading && fileName) || nodes.length > 0) && (
          <div className="search-container">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search keys, values, or paths..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="search-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <div className="search-options">
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.searchKeys}
                    onChange={(e) =>
                      setSearchOptions((prev) => ({
                        ...prev,
                        searchKeys: e.target.checked,
                      }))
                    }
                  />
                  Keys
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.searchValues}
                    onChange={(e) =>
                      setSearchOptions((prev) => ({
                        ...prev,
                        searchValues: e.target.checked,
                      }))
                    }
                  />
                  Values
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.searchPaths}
                    onChange={(e) =>
                      setSearchOptions((prev) => ({
                        ...prev,
                        searchPaths: e.target.checked,
                      }))
                    }
                  />
                  Paths
                </label>
                <label title="Case sensitive">
                  <input
                    type="checkbox"
                    checked={searchOptions.caseSensitive}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSearchOptions((prev) => ({
                        ...prev,
                        caseSensitive: isChecked,
                        ...(isChecked && { regex: false }),
                      }));
                    }}
                  />
                  Aa
                </label>
                <label className="search-option" title="Match whole word">
                  <input
                    type="checkbox"
                    checked={searchOptions.wholeWord}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSearchOptions((prev) => ({
                        ...prev,
                        wholeWord: isChecked,
                        ...(isChecked && { regex: false }),
                      }));
                    }}
                  />
                  |w|
                </label>
                <label className="search-option" title="Regular expression">
                  <input
                    type="checkbox"
                    checked={searchOptions.regex}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSearchOptions((prev) => ({
                        ...prev,
                        regex: isChecked,
                        ...(isChecked && {
                          caseSensitive: false,
                          wholeWord: false,
                        }),
                      }));
                    }}
                  />
                  .*
                </label>
              </div>
            </div>

            {searchLoading && (
              <div className="search-loading">🔍 Searching...</div>
            )}

            {showSearchTargetNotification && (
              <div className="search-target-notification">
                ⚠️ Please select at least one search target: Keys, Values, or
                Paths
              </div>
            )}

            {searchError && (
              <div className="error-message">❌ {searchError}</div>
            )}

            {isSearchMode && (
              <div className="search-stats">
                {searchLoading ? (
                  <>Searching…</>
                ) : (
                  <>
                    Found {searchStats.totalCount} matches · Showing{" "}
                    {searchResults.length} of {searchStats.totalCount}
                    {searchAppending && " (loading more...)"}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="main-content">
        {error && <div className="error-message">❌ {error}</div>}

        {nodes.length > 0 && !isSearchMode && (
          <div className="json-viewer">
            <div className="tree-controls">
              <button
                className="tree-control-btn"
                onClick={onExpandAll}
                title="Expand All Visible Nodes"
              >
                Expand 1 level
              </button>
              <button
                className="tree-control-btn"
                onClick={onCollapseAll}
                title="Collapse All"
              >
                Collapse all
              </button>
            </div>
            {nodes.map((node, index) => (
              <Tree key={`${node.pointer}-${index}`} node={node} level={0} />
            ))}
            {mainHasMore && (
              <div
                ref={mainLoadMoreRef}
                className="infinite-scroll-trigger"
                style={{
                  height: "20px",
                  opacity: 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mainLoading && (
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Loading more items...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isSearchMode && searchResults.length > 0 && (
          <div className="search-results">
            <div className="search-results-list">
              {searchResults.map((result, index) => (
                <div
                  key={`search-result-${result.node.pointer}-${index}`}
                  className="search-result-item"
                >
                  <div className="search-result-header">
                    <span
                      className="match-type-badge"
                      data-type={result.match_type}
                    >
                      {result.match_type}
                    </span>
                    <span className="result-path copyable-item">
                      {result.node.pointer || "/"}
                      <CopyIcon
                        text={result.node.pointer || "/"}
                        title="Copy path"
                      />
                      {(() => {
                        // Determine if this node can have a clipped snippet (string preview with search active)
                        const pointer = result.node.pointer;
                        const isString = result.node.value_type === "string";
                        const showToggle =
                          isString &&
                          searchQuery.trim().length > 0 &&
                          searchOptions.searchValues;
                        if (!showToggle) return null;
                        const isExpanded = !!expandedSearchPreviews[pointer];
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedSearchPreviews((prev) => ({
                                ...prev,
                                [pointer]: !isExpanded,
                              }));
                            }}
                            title={isExpanded ? "Show less" : "Show full"}
                            style={{
                              marginLeft: 8,
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              color: "#0a84ff",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                            }}
                          >
                            {isExpanded ? "Show less" : "Show full"}
                          </button>
                        );
                      })()}
                    </span>
                  </div>
                  <div className="search-result-content">
                    <Tree
                      node={result.node}
                      level={0}
                      searchQuery={searchQuery}
                      searchOptions={searchOptions}
                      externalShowFull={
                        !!expandedSearchPreviews[result.node.pointer]
                      }
                      suppressInternalToggle={true}
                    />
                  </div>
                </div>
              ))}
              {searchStats.hasMore && (
                <div
                  ref={searchLoadMoreRef}
                  className="infinite-scroll-trigger"
                  style={{
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    opacity: 0.6,
                  }}
                >
                  {searchAppending
                    ? "Loading more results…"
                    : "Scroll to load more"}
                </div>
              )}
            </div>
          </div>
        )}

        {isSearchMode &&
          searchResults.length === 0 &&
          !searchLoading &&
          searchQuery.trim() && (
            <div className="no-results">
              <p>🔍 No results found for "{searchQuery}"</p>
              <p>Try adjusting your search options or query.</p>
            </div>
          )}

        {nodes.length === 0 && !loading && !error && (
          <div className="empty-state">
            <p>💡 Drag and drop a JSON file anywhere on this window</p>
          </div>
        )}
      </div>

      {isDragOver && (
        <div className="drag-overlay">
          <div className="drag-message">📁 Drop your JSON file here</div>
        </div>
      )}
      {loading && nodes.length === 0 && (
        <div className="progress-center-overlay">
          <ProgressBar
            percent={parseProgress}
            detail={fileName || undefined}
            onCancel={cancelLoad}
          />
        </div>
      )}
    </div>
  );
}

export default App;
