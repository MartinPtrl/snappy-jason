import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FileActionsDropdown.css';

interface FileActionsDropdownProps {
  fileName: string;
  disabled?: boolean;
  onFileNameChange?: (newFileName: string) => void;
}

export function FileActionsDropdown({ fileName, disabled = false, onFileNameChange }: FileActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showConfirmModal) {
          setShowConfirmModal(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, showConfirmModal]);

  const hasFile = Boolean(fileName) && fileName !== "[Clipboard]";

  const handleSave = () => {
    if (!hasFile) return;
    setIsOpen(false);
    setShowConfirmModal(true);
  };

  const confirmSave = async () => {
    setShowConfirmModal(false);
    try {
      await invoke('save_file');
      console.log('File saved successfully');
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const handleSaveAs = async () => {
    setIsOpen(false);
    try {
      const result = await invoke<string | null>('save_file_as');
      console.log('Save as result:', result);
      
      if (result && onFileNameChange) {
        // Extract just the filename from the full path
        const newFileName = result.split(/[/\\]/).pop() || result;
        onFileNameChange(newFileName);
        console.log('Updated filename to:', newFileName);
      }
    } catch (error) {
      console.error('Failed to save file as:', error);
    }
  };

  const handleCopyRaw = async () => {
    try {
      await invoke('copy_as_raw');
      console.log('Copied as raw JSON');
    } catch (error) {
      console.error('Failed to copy as raw:', error);
    }
    setIsOpen(false);
  };

  const handleCopyPretty = async () => {
    try {
      await invoke('copy_as_pretty');
      console.log('Copied as pretty JSON');
    } catch (error) {
      console.error('Failed to copy as pretty:', error);
    }
    setIsOpen(false);
  };

  return (
    <>
      {showConfirmModal && (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-confirm-title"
            aria-describedby="save-confirm-desc"
            ref={modalRef}
          >
            <h3 className="modal-title" id="save-confirm-title">
              Overwrite file?
            </h3>
            <p className="modal-body" id="save-confirm-desc">
              This will overwrite the file:<br />
              <strong>{fileName}</strong>
              <br /><br />
              Are you sure you want to continue?
            </p>
            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmSave}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="file-actions-dropdown" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="dropdown-trigger"
          disabled={disabled}
          title="File Actions"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          💾
        </button>
        
        {isOpen && (
          <div className="dropdown-menu" role="menu">
            <button
              className="dropdown-item"
              onClick={handleSave}
              disabled={!hasFile}
              role="menuitem"
              title={!hasFile ? 'Save is only available for files loaded from disk' : 'Save changes to the current file'}
            >
              <span className="dropdown-item-icon">💾</span>
              <span className="dropdown-item-text">Save</span>
              {!hasFile && <span className="dropdown-item-badge">File only</span>}
            </button>
            
            <button
              className="dropdown-item"
              onClick={handleSaveAs}
              role="menuitem"
              title="Save JSON to a new file"
            >
              <span className="dropdown-item-icon">📝</span>
              <span className="dropdown-item-text">Save As...</span>
            </button>
            
            <div className="dropdown-divider" />
            
            <button
              className="dropdown-item"
              onClick={handleCopyRaw}
              role="menuitem"
              title="Copy JSON as compact/raw format"
            >
              <span className="dropdown-item-icon">📋</span>
              <span className="dropdown-item-text">Copy as Raw</span>
            </button>
            
            <button
              className="dropdown-item"
              onClick={handleCopyPretty}
              role="menuitem"
              title="Copy JSON as pretty-printed format"
            >
              <span className="dropdown-item-icon">✨</span>
              <span className="dropdown-item-text">Copy as Pretty</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
