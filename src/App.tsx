import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Node, SearchResult, SearchOptions } from "@/shared/types";
import { useFileOperations } from "@/features/file";
import { Tree, MultiFileTree, useTreeOperations } from "@/features/tree";
import { CopyIcon, ToggleThemeButton } from "@shared";
import { Updater } from "@/shared/Updater";
import "./App.css";

function App() {
  // File operations hook
  const {
    loadLastOpenedFile,
    // Multi-file operations
    files,
    loadFileMulti,
    removeFileMulti,
    loadMoreNodesMulti,
    clearAllFiles,
  } = useFileOperations();

  // Other state (non-file related)
  const [isDragOver, setIsDragOver] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(1); // highest loaded (1-based)
  // Track expanded preview state for search results (by node pointer)
  const [expandedSearchPreviews, setExpandedSearchPreviews] = useState<
    Record<string, boolean>
  >({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAppending, setSearchAppending] = useState(false); // true when loading additional pages
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
  const { handleCollapseAll, expandedNodes, handleExpandAll } = useTreeOperations();

  // Handle expand one level progressively - Updated for multi-file support with gradual expansion
  const onExpandAll = async () => {
    if (files.length === 0) return;
    
    const allNodePointers: string[] = [];
    
    // First, quickly check root level nodes without loading children
    for (const file of files) {
      if (!file.nodes || file.nodes.length === 0) continue;
      
      for (const rootNode of file.nodes) {
        if (rootNode.has_children && !expandedNodes.has(rootNode.pointer)) {
          allNodePointers.push(rootNode.pointer);
        }
      }
    }
    
    // If we have root level nodes to expand, expand them first
    if (allNodePointers.length > 0) {
      console.log(`Expanding ${allNodePointers.length} root level nodes`);
      handleExpandAll(allNodePointers);
      return;
    }
    
    // No root nodes to expand, so we need to look deeper
    // Use requestAnimationFrame to avoid blocking the UI
    const findNextLevelNodes = async (): Promise<string[]> => {
      const nextLevelNodes: string[] = [];
      const batchSize = 5; // Process files in small batches
      
      for (let i = 0; i < files.length; i += batchSize) {
        const fileBatch = files.slice(i, i + batchSize);
        
        // Process batch and yield to UI
        await new Promise(resolve => {
          setTimeout(async () => {
            for (const file of fileBatch) {
              if (!file.nodes || file.nodes.length === 0) continue;
              
              // Check each expanded root node
              for (const rootNode of file.nodes) {
                if (expandedNodes.has(rootNode.pointer)) {
                  try {
                    const children = await invoke<Node[]>("load_children_multi", {
                      fileId: file.id,
                      pointer: rootNode.pointer,
                      offset: 0,
                      limit: 100 // Smaller batch size
                    });
                    
                    // Find unexpanded children with children
                    for (const child of children) {
                      if (child.has_children && !expandedNodes.has(child.pointer)) {
                        nextLevelNodes.push(child.pointer);
                      }
                    }
                  } catch (error) {
                    console.error(`Failed to load children for ${rootNode.pointer}:`, error);
                  }
                }
              }
            }
            resolve(undefined);
          }, 0); // Yield to event loop
        });
      }
      
      return nextLevelNodes;
    };
    
    // Find and expand next level nodes
    try {
      const nextLevelNodes = await findNextLevelNodes();
      
      if (nextLevelNodes.length > 0) {
        console.log(`Expanding ${nextLevelNodes.length} next level nodes`);
        
        // Expand nodes in smaller batches to avoid UI freeze
        const expandBatchSize = 10;
        for (let i = 0; i < nextLevelNodes.length; i += expandBatchSize) {
          const batch = nextLevelNodes.slice(i, i + expandBatchSize);
          handleExpandAll(batch);
          
          // Small delay between batches if there are many nodes
          if (i + expandBatchSize < nextLevelNodes.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      } else {
        console.log("No more nodes to expand");
      }
    } catch (error) {
      console.error("Error during gradual expansion:", error);
    }
  };

  // Handle collapse all - Works with multi-file support
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
    console.log(`🎯 handleFileLoad called with: ${path}`);
    
    // Clear search when loading new file
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");

    // Use multi-file loading to add to existing files
    try {
      console.log(`📂 Calling loadFileMulti for: ${path}`);
      const fileId = await loadFileMulti(path, {
        onSuccess: (nodes: Node[], fileId: string) => {
          // Check if there might be more nodes at the root level for this file
          console.log(`✅ File ${fileId} loaded successfully with ${nodes.length} nodes`);
        },
        onError: (error: string, fileId: string) => {
          console.error("File load error for", fileId, ":", error);
        },
      });
      console.log("File added with ID:", fileId);
    } catch (error) {
      console.error("Failed to load file:", error);
    }
  }, [loadFileMulti]);

  // Load last opened file on app startup
  useEffect(() => {
    loadLastOpenedFile({
      onSuccess: (nodes: Node[]) => {
        // File loaded successfully - no need to track main pagination anymore
        // since MultiFileTree handles its own pagination
        console.log("Loaded last opened file with", nodes.length, "nodes");
      },
    });
  }, [loadLastOpenedFile]);

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
        files: Array<{
          file_id: string;
          results: SearchResult[];
          total_count: number;
        }>;
        total_count: number;
        has_more: boolean;
      }>("search_multi", {
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
      
      // Flatten results from all files
      const allResults = resp.files.flatMap(file => file.results);
      
      setSearchResults((prev) =>
        append ? [...prev, ...allResults] : allResults
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

    // Clear all files instead of just one
    clearAllFiles();
  }, [clearAllFiles]);

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

  return (
    <div className="app">
      <div className="sticky-header">
        <header className="app-header">
          <h1>Snappy JSON Viewer</h1>
          <div className="header-controls">
            <Updater checkOnStartup={true} />
            <ToggleThemeButton />
            <div className="file-input-container">
              {files.length > 0 && (
                <button
                  onClick={handleFileUnload}
                  className="file-button unload-button"
                  disabled={files.some(file => file.loading)}
                  title="Clear"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        </header>

        {files.length > 0 && (
          <div className="file-info">
            {files.map((file) => (
              <div key={file.id} className="file-name-line">
                📄 {file.fileName}
                {file.loading && (
                  <span className="file-status loading">
                    (Loading {file.parseProgress > 0 ? `${Math.round(file.parseProgress)}%` : '...'})
                  </span>
                )}
                {file.error && (
                  <span className="file-status error">
                    (Error: {file.error})
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Progress bar moved to centered overlay */}

        {files.length > 0 && (
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
        {files.length > 0 && !isSearchMode && (
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
            <MultiFileTree
              files={files}
              onRemoveFile={removeFileMulti}
              onLoadMoreNodes={loadMoreNodesMulti}
            />
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

        {files.length === 0 && (
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
    </div>
  );
}

export default App;
