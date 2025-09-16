import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  Node,
  SearchResult,
  SearchResponse,
  SearchOptions,
} from "@/shared/types";
import { useFileOperations } from "@/features/file";
import { Tree } from "@/features/tree";
import { CopyIcon } from "@/shared/CopyIcon";
import "./App.css";

function App() {
  // File operations hook
  const {
    fileName,
    loading,
    error,
    nodes,
    loadFile,
    unloadFile,
    restoreLastFile,
    loadMoreNodes,
  } = useFileOperations();

  // Other state (non-file related)
  const [jsonData, setJsonData] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Main level pagination state
  const [mainHasMore, setMainHasMore] = useState(false);
  const [mainLoading, setMainLoading] = useState(false);
  const mainLoadMoreRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    searchKeys: true,
    searchValues: true,
    searchPaths: false,
    caseSensitive: false,
    regex: false,
  });
  const [searchStats, setSearchStats] = useState({
    totalCount: 0,
    hasMore: false,
  });

  const searchTimeoutRef = useRef<number | null>(null);

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Toggle theme
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // Apply theme to body
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // Re-run search when options change
  useEffect(() => {
    if (isSearchMode && searchQuery.trim()) {
      // Debounce search to avoid rapid-fire requests
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);
    }
  }, [searchOptions]);

  // Load last opened file on app startup
  useEffect(() => {
    // Restore last opened file on startup
    restoreLastFile();
  }, []);

  // Listen for Tauri file drop events (this is the ONLY way that works in Tauri)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenHover: (() => void) | null = null;
    let unlistenCancelled: (() => void) | null = null;

    const setupFileDropListener = async () => {
      try {
        console.log("🔧 Setting up Tauri file drop listeners...");
        console.log("🔧 Tauri config dragDropEnabled should be true");

        // Check window configuration
        const window = getCurrentWindow();
        console.log("🪟 Current window:", window.label);

        unlisten = await listen<{ paths: string[] }>(
          "tauri://drag-drop",
          (event) => {
            console.log("✅ TAURI DRAG DROP EVENT:", event.payload);
            const filePaths = event.payload.paths;
            if (filePaths.length > 0) {
              const jsonFile = filePaths.find((path) =>
                path.toLowerCase().endsWith(".json")
              );
              if (jsonFile) {
                console.log("📁 Loading JSON file via Tauri:", jsonFile);
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
        console.log("✅ Listening to ALL events for debugging");

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

  const handleFileLoad = async (path: string) => {
    setJsonData(null);

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
  };

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

  const performSearch = async (
    query: string,
    offset: number = 0,
    limit: number = 100
  ) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchStats({ totalCount: 0, hasMore: false });
      setIsSearchMode(false);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setIsSearchMode(true);

    try {
      const response = await invoke<SearchResponse>("search", {
        query: query.trim(),
        searchKeys: searchOptions.searchKeys,
        searchValues: searchOptions.searchValues,
        searchPaths: searchOptions.searchPaths,
        caseSensitive: searchOptions.caseSensitive,
        regex: searchOptions.regex,
        offset,
        limit,
      });

      if (offset === 0) {
        // New search
        setSearchResults(response.results);
      } else {
        // Load more results
        setSearchResults((prev) => [...prev, ...response.results]);
      }

      setSearchStats({
        totalCount: response.total_count,
        hasMore: response.has_more,
      });
    } catch (error) {
      console.error("Search failed:", error);
      setSearchError(`Search failed: ${error}`);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Debounce search by 300ms
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);
  };

  const loadMoreResults = () => {
    if (searchStats.hasMore && !searchLoading) {
      performSearch(searchQuery, searchResults.length);
    }
  };

  const handleFileUnload = async () => {
    setJsonData(null);

    // Clear search state
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");

    // Clear main level pagination state
    setMainHasMore(false);
    setMainLoading(false);

    await unloadFile(() => {
      // Clear tree state
      setJsonData(null);

      // Clear search state
      setIsSearchMode(false);
      setSearchQuery("");
      setSearchResults([]);
      setSearchError("");

      // Clear main level pagination state
      setMainHasMore(false);
      setMainLoading(false);
    });
  };

  return (
    <div className={`app ${isDragOver ? "drag-over" : ""}`}>
      <div className="sticky-header">
        <header className="app-header">
          <h1>Snappy JSON Viewer</h1>
          <div className="header-controls">
            <button onClick={toggleTheme} className="theme-toggle-button">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <div className="file-input-container">
              {(fileName || nodes.length > 0) && (
                <button
                  onClick={handleFileUnload}
                  className="file-button unload-button"
                  disabled={loading}
                >
                  Clear
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

        {(fileName || nodes.length > 0) && (
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
                <label>
                  <input
                    type="checkbox"
                    checked={searchOptions.caseSensitive}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSearchOptions((prev) => ({
                        ...prev,
                        caseSensitive: isChecked,
                        ...(isChecked && { regex: false }),
                      }))
                    }}
                  />
                  Case sensitive
                </label>
                <label className="search-option">
                  <input
                    type="checkbox"
                    checked={searchOptions.regex}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setSearchOptions((prev) => ({
                        ...prev,
                        regex: isChecked,
                        ...(isChecked && { caseSensitive: false }),
                      }));
                    }}
                  />
                  Regex
                </label>
              </div>
            </div>

            {searchLoading && (
              <div className="search-loading">🔍 Searching...</div>
            )}
            {searchError && (
              <div className="error-message">❌ {searchError}</div>
            )}

            {isSearchMode && searchStats.totalCount > 0 && (
              <div className="search-stats">
                Found {searchStats.totalCount} results
                {searchStats.hasMore &&
                  ` (showing first ${searchResults.length})`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="main-content">
        {error && <div className="error-message">❌ {error}</div>}

        {nodes.length > 0 && !isSearchMode && (
          <div className="json-viewer">
            {nodes.map((node, index) => (
              <Tree
                key={`${node.pointer}-${index}`}
                node={node}
                level={0}
                jsonData={jsonData}
              />
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
                <div key={`search-${index}`} className="search-result-item">
                  <div className="search-result-header">
                    <span
                      className="match-type-badge"
                      data-type={result.match_type}
                    >
                      {result.match_type}
                    </span>
                    <span className="result-path copyable-item">
                      {result.node.pointer || "/"}
                      <CopyIcon text={result.node.pointer || "/"} title="Copy path" />
                    </span>
                  </div>
                  <div className="search-result-content">
                    <Tree node={result.node} level={0} jsonData={jsonData} />
                  </div>
                  <div className="search-result-match">
                    <strong>Match:</strong> 
                    <span className="match-text copyable-item">
                      {result.match_text}
                      <CopyIcon text={result.match_text} title="Copy match text" />
                    </span>
                    {result.context && (
                      <span className="match-context"> ({result.context})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {searchStats.hasMore && (
              <div className="load-more-container">
                <button
                  onClick={loadMoreResults}
                  disabled={searchLoading}
                  className="load-more-button"
                >
                  {searchLoading ? "Loading..." : "Load More Results"}
                </button>
              </div>
            )}
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
    </div>
  );
}

export default App;
