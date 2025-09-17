import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import './Updater.css';

interface UpdaterProps {
  checkOnStartup?: boolean;
}

export function Updater({ checkOnStartup = true }: UpdaterProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async () => {
    try {
      console.log('Checking for updates...');
      const update: Update | null = await check();
      console.log('Update check result:', update);
      
      if (update?.available) {
        console.log('Update available:', update);
        setUpdateAvailable(true);
        
        // Auto-download the update
        setDownloading(true);
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
      } else {
        console.log('No updates available');
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
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
          <p>🎉 Update downloaded and ready to install!</p>
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
      <div className="updater-downloading">
        <p>📥 Downloading update...</p>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="updater-available">
        <p>🔄 Update available! Downloading...</p>
      </div>
    );
  }

  // Manual check button (could be shown in a menu or settings)
  return (
    <button 
      onClick={checkForUpdates} 
      className="update-check-button"
      title="Check for Updates"
    >
      ⬇️
    </button>
  );
}

export default Updater;