import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

interface Node {
  pointer: string;
  key?: string;
  value_type: string;
  has_children: boolean;
  child_count: number;
  preview: string;
}

interface SearchResult {
  node: Node;
  match_type: string;
  match_text: string;
  context?: string;
}

interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  has_more: boolean;
}

interface TreeNodeProps {
  node: Node;
  level: number;
  onExpand: (pointer: string) => void;
  expandedNodes: Set<string>;
  children?: Node[];
  jsonData?: any;
  getValueAtPointer?: (data: any, pointer: string) => any;
}

const createNodesFromJSON = (data: any, parentPointer: string = ""): Node[] => {
  const nodes: Node[] = [];

  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      data.slice(0, 200).forEach((item, index) => {
        const pointer = `${parentPointer}/${index}`;
        const node = createNodeFromValue(index.toString(), item, pointer);
        nodes.push(node);
      });
    } else {
      Object.entries(data)
        .slice(0, 200)
        .forEach(([key, value]) => {
          const pointer = `${parentPointer}/${key}`;
          const node = createNodeFromValue(key, value, pointer);
          nodes.push(node);
        });
    }
  }

  return nodes;
};

const createNodeFromValue = (
  key: string,
  value: any,
  pointer: string
): Node => {
  let valueType: string;
  let hasChildren: boolean;
  let childCount: number;
  let preview: string;

  if (value === null) {
    valueType = "null";
    hasChildren = false;
    childCount = 0;
    preview = "null";
  } else if (typeof value === "boolean") {
    valueType = "boolean";
    hasChildren = false;
    childCount = 0;
    preview = value.toString();
  } else if (typeof value === "number") {
    valueType = "number";
    hasChildren = false;
    childCount = 0;
    preview = value.toString();
  } else if (typeof value === "string") {
    valueType = "string";
    hasChildren = false;
    childCount = 0;
    preview = value.length > 120 ? `${value.substring(0, 120)}…` : value;
  } else if (Array.isArray(value)) {
    valueType = "array";
    hasChildren = value.length > 0;
    childCount = value.length;
    preview = `[…] ${value.length} items`;
  } else if (typeof value === "object") {
    const keys = Object.keys(value);
    valueType = "object";
    hasChildren = keys.length > 0;
    childCount = keys.length;
    preview = `{…} ${keys.length} keys`;
  } else {
    valueType = typeof value;
    hasChildren = false;
    childCount = 0;
    preview = String(value);
  }

  return {
    pointer,
    key,
    value_type: valueType,
    has_children: hasChildren,
    child_count: childCount,
    preview,
  };
};

function TreeNode({
  node,
  level,
  onExpand,
  expandedNodes,
  children,
  jsonData,
  getValueAtPointer,
}: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.pointer);
  const hasChildren = node.has_children;

  const handleToggle = () => {
    if (hasChildren) {
      onExpand(node.pointer);
    }
  };

  const getIcon = () => {
    if (!hasChildren) return "  ";
    return isExpanded ? "▼ " : "▶ ";
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "object":
        return "#e67e22";
      case "array":
        return "#9b59b6";
      case "string":
        return "#27ae60";
      case "number":
        return "#3498db";
      case "boolean":
        return "#e74c3c";
      case "null":
        return "#95a5a6";
      default:
        return "#34495e";
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`node-header ${hasChildren ? "expandable" : ""}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleToggle}
      >
        <span className="expand-icon">{getIcon()}</span>
        <span className="node-key">{node.key || "root"}</span>
        <span
          className="node-type"
          style={{ color: getTypeColor(node.value_type) }}
        >
          {node.value_type}
        </span>
        {node.child_count > 0 && (
          <span className="child-count">({node.child_count})</span>
        )}
        <span className="node-preview">{node.preview}</span>
      </div>
      {isExpanded && children && (
        <div className="node-children">
          {children.map((child, index) => (
            <TreeNodeContainer
              key={`${child.pointer}-${index}`}
              node={child}
              level={level + 1}
              onExpand={onExpand}
              expandedNodes={expandedNodes}
              jsonData={jsonData}
              getValueAtPointer={getValueAtPointer}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNodeContainer({
  node,
  level,
  onExpand,
  expandedNodes,
  jsonData,
  getValueAtPointer,
}: Omit<TreeNodeProps, "children">) {
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);

  const handleExpand = useCallback(
    async (pointer: string) => {
      if (expandedNodes.has(pointer)) {
        // Collapse - remove from expanded set
        onExpand(pointer);
        return;
      }

      // Expand - load children if needed
      if (node.pointer === pointer && children.length === 0) {
        setLoading(true);
        try {
          // Try backend first, fallback to frontend if jsonData is available
          if (jsonData && getValueAtPointer) {
            // Frontend expansion
            const value = getValueAtPointer(jsonData, pointer);
            const childNodes = createNodesFromJSON(value, pointer);
            setChildren(childNodes);
          } else {
            // Backend expansion
            const result = await invoke<Node[]>("load_children", {
              pointer,
              offset: 0,
              limit: 1000,
            });
            setChildren(result);
          }
        } catch (error) {
          console.error("Failed to load children:", error);
        } finally {
          setLoading(false);
        }
      }
      onExpand(pointer);
    },
    [
      node.pointer,
      children.length,
      expandedNodes,
      onExpand,
      jsonData,
      getValueAtPointer,
    ]
  );

  return (
    <TreeNode
      node={node}
      level={level}
      onExpand={handleExpand}
      expandedNodes={expandedNodes}
      children={loading ? [] : children}
      jsonData={jsonData}
      getValueAtPointer={getValueAtPointer}
    />
  );
}

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [jsonData, setJsonData] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    searchKeys: true,
    searchValues: true,
    searchPaths: false,
    caseSensitive: false,
  });
  const [searchStats, setSearchStats] = useState({
    totalCount: 0,
    hasMore: false,
  });

  const searchTimeoutRef = useRef<number | null>(null);

  // Config file operations
  const saveLastOpenedFile = async (filePath: string) => {
    try {
      await invoke("save_last_opened_file", { filePath });
      console.log("💾 Saved last opened file to config:", filePath);
    } catch (error) {
      console.error("Failed to save last opened file:", error);
    }
  };

  const loadLastOpenedFile = async (): Promise<string | null> => {
    try {
      const filePath = await invoke<string>("load_last_opened_file");
      console.log("📂 Loaded last opened file from config:", filePath);
      return filePath;
    } catch (error) {
      console.log("No last opened file found or error:", error);
      return null;
    }
  };

  const clearLastOpenedFile = async () => {
    try {
      await invoke("clear_last_opened_file");
      console.log("🗑️ Cleared last opened file from config");
    } catch (error) {
      console.error("Failed to clear last opened file:", error);
    }
  };

  // Load last opened file on app startup
  useEffect(() => {
    const restoreLastFile = async () => {
      const lastFilePath = await loadLastOpenedFile();
      if (lastFilePath) {
        console.log("🔄 Restoring last opened file:", lastFilePath);
        loadFile(lastFilePath);
      }
    };
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
                loadFile(jsonFile);
              } else {
                setError("Please drop a JSON file");
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

  const loadFile = async (path: string) => {
    setLoading(true);
    setError("");
    setExpandedNodes(new Set());
    setJsonData(null);

    // Clear search when loading new file
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");

    try {
      const result = await invoke<Node[]>("open_file", { path });
      setNodes(result);
      setFileName(path.split("/").pop() || path);

      // Save the file path to config file for next app startup
      await saveLastOpenedFile(path);
    } catch (error) {
      console.error("Failed to load file:", error);
      setError(`Failed to load file: ${error}`);
      setNodes([]);
      setFileName("");
    } finally {
      setLoading(false);
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

  const unloadFile = async () => {
    setNodes([]);
    setFileName("");
    setError("");
    setExpandedNodes(new Set());
    setJsonData(null);

    // Clear search state
    setIsSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");

    // Clear the saved file path from config file
    await clearLastOpenedFile();
  };

  const getValueAtPointer = (data: any, pointer: string): any => {
    if (!pointer || pointer === "") return data;

    const parts = pointer.split("/").filter((part) => part !== "");
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) return null;

      if (Array.isArray(current)) {
        const index = parseInt(part);
        current = current[index];
      } else if (typeof current === "object") {
        current = current[part];
      } else {
        return null;
      }
    }

    return current;
  };

  const handleExpand = (pointer: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(pointer)) {
      newExpanded.delete(pointer);
    } else {
      newExpanded.add(pointer);
    }
    setExpandedNodes(newExpanded);
  };

  return (
    <div className={`app ${isDragOver ? "drag-over" : ""}`}>
      <div className="sticky-header">
        <header className="app-header">
          <h1>Snappy JSON Viewer</h1>
          <div className="file-input-container">
            {(fileName || nodes.length > 0) && (
              <button
                onClick={unloadFile}
                className="file-button unload-button"
                style={{ marginLeft: "1rem" }}
                disabled={loading}
              >
                Clear
              </button>
            )}
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
                    onChange={(e) =>
                      setSearchOptions((prev) => ({
                        ...prev,
                        caseSensitive: e.target.checked,
                      }))
                    }
                  />
                  Case sensitive
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
              <TreeNodeContainer
                key={`${node.pointer}-${index}`}
                node={node}
                level={0}
                onExpand={handleExpand}
                expandedNodes={expandedNodes}
                jsonData={jsonData}
                getValueAtPointer={getValueAtPointer}
              />
            ))}
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
                    <span className="result-path">
                      {result.node.pointer || "/"}
                    </span>
                  </div>
                  <div className="search-result-content">
                    <TreeNodeContainer
                      node={result.node}
                      level={0}
                      onExpand={handleExpand}
                      expandedNodes={expandedNodes}
                      jsonData={jsonData}
                      getValueAtPointer={getValueAtPointer}
                    />
                  </div>
                  <div className="search-result-match">
                    <strong>Match:</strong> {result.match_text}
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
