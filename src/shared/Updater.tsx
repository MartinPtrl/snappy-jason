import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import './Updater.css';

interface UpdaterProps {
  checkOnStartup?: boolean;
}

export function Updater({ checkOnStartup = true }: UpdaterProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [noUpdatesMessage, setNoUpdatesMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      setError(null);
      setNoUpdatesMessage(false);
      console.log('Checking for updates...');
      
      // Get current app version
      const currentVersion = await getVersion();
      console.log('Current application version:', currentVersion);
      
      const updateResult: Update | null = await check();
      console.log('Update check result:', updateResult);
      
      if (updateResult?.available) {
        console.log('Latest available version:', updateResult.version);
        console.log('Update available:', updateResult);
        setUpdateAvailable(true);
        setUpdate(updateResult);
        
        // Don't auto-download, wait for user confirmation
      } else {
        console.log('No updates available');
        setNoUpdatesMessage(true);
        // Auto-hide the message after 3 seconds
        setTimeout(() => setNoUpdatesMessage(false), 3000);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (!update) return;
    
    try {
      setDownloading(true);
      setUpdateAvailable(false);
      
      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            console.log('Update download started');
            break;
          case 'Progress':
            console.log(`Downloaded ${event.data.chunkLength} bytes of ${event.data.contentLength}`);
            break;
          case 'Finished':
            console.log('Update download finished');
            setDownloading(false);
            setDownloaded(true);
            break;
        }
      });
      
      // After download completes, ask user to restart
      console.log('Update downloaded and installed, ready to restart');
    } catch (err) {
      console.error('Failed to download update:', err);
      setError(err instanceof Error ? err.message : 'Failed to download update');
      setDownloading(false);
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error('Failed to restart:', err);
      setError(err instanceof Error ? err.message : 'Failed to restart application');
    }
  };

  useEffect(() => {
    if (checkOnStartup) {
      // Check for updates on startup (with a small delay)
      const timer = setTimeout(checkForUpdates, 3000);
      return () => clearTimeout(timer);
    }
  }, [checkOnStartup]);

  if (error) {
    return (
      <div className="updater-error">
        <p>Update check failed: {error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  if (downloaded) {
    return (
      <div className="updater-ready">
        <div className="update-notification">
          <p>✅ Update downloaded and ready to install!</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, margin: '8px 0' }}>
            The application needs to restart to complete the update installation.
          </p>
          <div className="update-actions">
            <button onClick={handleRestart} className="restart-button">
              Restart Now
            </button>
            <button onClick={() => setDownloaded(false)} className="later-button">
              Restart Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (downloading) {
    return (
      <div className="updater-container">
        <span className="update-status-message">📥 Downloading the latest version</span>
        <button 
          className="update-check-button"
          disabled={true}
        >
          ⏳
        </button>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="updater-available">
        <div className="update-notification">
          <p>🎉 New version {update?.version} is available!</p>
          <div className="update-actions">
            <button onClick={downloadUpdate} className="restart-button">
              Download Update
            </button>
            <button onClick={() => setUpdateAvailable(false)} className="later-button">
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Manual check button (could be shown in a menu or settings)
  return (
    <div className="updater-container">
      {noUpdatesMessage && (
        <span className="update-status-message">No available updates</span>
      )}
      <button 
        onClick={checkForUpdates} 
        className="update-check-button"
        title="Check for Updates"
        disabled={checking}
      >
        {checking ? '⏳' : '⬇️'}
      </button>
    </div>
  );
}

export default Updater;