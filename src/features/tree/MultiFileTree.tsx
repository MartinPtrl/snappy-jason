import { useState, useCallback, useRef } from "react";
import type { Node, SearchOptions } from "@shared/types";
import type { FileData } from "@/features/file";
import { Tree } from "./Tree";
import "./MultiFileTree.css";

interface MultiFileTreeProps {
  files: FileData[];
  searchQuery?: string;
  searchOptions?: SearchOptions;
  externalShowFull?: boolean;
  suppressInternalToggle?: boolean;
  onRemoveFile?: (fileId: string) => void;
  onLoadMoreNodes?: (fileId: string, offset: number) => Promise<Node[]>;
}

export function MultiFileTree({
  files,
  searchQuery,
  searchOptions,
  externalShowFull,
  suppressInternalToggle,
  onRemoveFile,
  onLoadMoreNodes,
}: MultiFileTreeProps) {
  const [fileLoadingStates, setFileLoadingStates] = useState<Record<string, boolean>>({});
  const [fileHasMore, setFileHasMore] = useState<Record<string, boolean>>({});
  const loadMoreRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleLoadMoreNodes = useCallback(
    async (fileId: string) => {
      if (fileLoadingStates[fileId] || !onLoadMoreNodes) return;

      setFileLoadingStates(prev => ({ ...prev, [fileId]: true }));
      
      try {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        const result = await onLoadMoreNodes(fileId, file.nodes.length);
        
        // Update hasMore state based on whether we got a full batch
        setFileHasMore(prev => ({ 
          ...prev, 
          [fileId]: result.length === 100 
        }));
      } catch (error) {
        console.error("Failed to load more nodes for file:", fileId, error);
      } finally {
        setFileLoadingStates(prev => ({ ...prev, [fileId]: false }));
      }
    },
    [files, fileLoadingStates, onLoadMoreNodes]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      if (onRemoveFile) {
        onRemoveFile(fileId);
      }
    },
    [onRemoveFile]
  );

  if (files.length === 0) {
    return (
      <div className="multi-file-tree empty-state">
        <p>No files loaded. Drop JSON files here to view them.</p>
      </div>
    );
  }

  return (
    <div className="multi-file-tree">
      {files.map((file) => (
        <div key={file.id} className="file-section">
          {/* File separator with name for all files */}
          <div className="file-separator-with-name">
            <div className="file-separator-line" />
            <span className="file-name-on-separator" title={file.fullPath}>
              {file.fileName}
            </span>
            <button
              className="remove-file-button-inline"
              onClick={() => handleRemoveFile(file.id)}
              title={`Remove ${file.fileName}`}
              disabled={file.loading}
            >
              ×
            </button>
          </div>

          {/* File status messages */}
          {file.error && (
            <div className="file-error">
              ❌ {file.error}
            </div>
          )}
          {file.loading && (
            <div className="file-loading">
              ⏳ Loading... {file.parseProgress > 0 ? `${Math.round(file.parseProgress)}%` : ''}
            </div>
          )}

          {/* File content */}
          {!file.loading && !file.error && file.nodes.length > 0 && (
            <div className="file-content">
              {/* Render root level nodes */}
              {file.nodes.map((node) => (
                <Tree
                  key={node.pointer}
                  node={node}
                  level={0}
                  fileId={file.id}
                  searchQuery={searchQuery}
                  searchOptions={searchOptions}
                  externalShowFull={externalShowFull}
                  suppressInternalToggle={suppressInternalToggle}
                />
              ))}

              {/* Load more button for root level pagination */}
              {fileHasMore[file.id] && (
                <div className="load-more-section">
                  <button
                    className="load-more-button"
                    onClick={() => handleLoadMoreNodes(file.id)}
                    disabled={fileLoadingStates[file.id]}
                  >
                    {fileLoadingStates[file.id] ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}

              {/* Intersection observer target for infinite scroll */}
              <div
                ref={(el) => {
                  loadMoreRefs.current[file.id] = el;
                }}
                className="load-more-trigger"
              />
            </div>
          )}

          {/* Empty file state */}
          {!file.loading && !file.error && file.nodes.length === 0 && (
            <div className="file-empty">
              <p>This file appears to be empty or could not be parsed.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default MultiFileTree;