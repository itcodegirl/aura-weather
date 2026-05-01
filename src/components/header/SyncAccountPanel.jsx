import { ChevronDown, Cloud } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

function SyncAccountPanel({
  syncConnected,
  syncAccount,
  syncState,
  onCreateSyncAccount,
  onConnectSyncAccount,
  onDisconnectSyncAccount,
  onSyncNow,
}) {
  const [syncKeyInput, setSyncKeyInput] = useState("");
  const wasConnectedRef = useRef(syncConnected);
  const syncStatusText =
    typeof syncState?.message === "string" && syncState.message.trim()
      ? syncState.message.trim()
      : syncConnected
        ? "Sync connected"
        : "Sync not connected";
  const syncErrorText =
    typeof syncState?.error === "string" && syncState.error.trim()
      ? syncState.error.trim()
      : "";
  const isSyncing = syncState?.status === "syncing";
  const panelId = useId();
  const [isExpanded, setIsExpanded] = useState(() => Boolean(syncConnected));
  const isPanelVisible = isExpanded || isSyncing || Boolean(syncErrorText);
  const syncSummaryHint = useMemo(() => {
    if (syncConnected) {
      return "Connected";
    }
    if (syncErrorText) {
      return "Needs attention";
    }
    return "Optional";
  }, [syncConnected, syncErrorText]);
  const handleConnect = useCallback(() => {
    if (typeof onConnectSyncAccount === "function") {
      void onConnectSyncAccount(syncKeyInput);
    }
  }, [onConnectSyncAccount, syncKeyInput]);

  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    if (syncConnected || wasConnected !== syncConnected) {
      if (syncConnected || wasConnected) {
        setSyncKeyInput("");
      }
    }

    wasConnectedRef.current = syncConnected;
  }, [syncConnected]);

  return (
    <div className="sync-account-shell">
      <button
        type="button"
        className={`sync-account-toggle ${isPanelVisible ? "is-expanded" : ""}`.trim()}
        aria-expanded={isPanelVisible}
        aria-controls={panelId}
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
      >
        <span className="sync-account-toggle-copy">
          <span className="sync-account-title">
            <Cloud size={13} aria-hidden="true" />
            <span>Cloud Sync</span>
          </span>
          <span className="sync-account-status">{syncStatusText}</span>
        </span>
        <span className="sync-account-toggle-hint">{syncSummaryHint}</span>
        <ChevronDown
          size={16}
          className="sync-account-toggle-icon"
          aria-hidden="true"
        />
      </button>

      {isPanelVisible && (
        <div id={panelId} className="sync-account-panel" aria-live="polite">
          <p className="sync-account-note">
            Keep your saved cities in sync across devices with a shareable sync key.
          </p>
          {syncConnected ? (
            <div className="sync-account-actions">
              <button
                type="button"
                className="sync-account-btn"
                onClick={onSyncNow}
                disabled={isSyncing}
              >
                Sync now
              </button>
              <button
                type="button"
                className="sync-account-btn sync-account-btn--subtle"
                onClick={onDisconnectSyncAccount}
                disabled={isSyncing}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="sync-account-connect">
              <button
                type="button"
                className="sync-account-btn"
                onClick={onCreateSyncAccount}
                disabled={isSyncing}
              >
                Create cloud account
              </button>
              <div className="sync-account-manual">
                <input
                  type="text"
                  className="sync-account-input"
                  value={syncKeyInput}
                  onChange={(event) => setSyncKeyInput(event.target.value)}
                  placeholder="Paste sync key or URL"
                  aria-label="Sync key"
                  disabled={isSyncing}
                />
                <button
                  type="button"
                  className="sync-account-btn sync-account-btn--subtle"
                  onClick={handleConnect}
                  disabled={isSyncing || !syncKeyInput.trim()}
                >
                  Connect
                </button>
              </div>
            </div>
          )}
          {syncConnected && (
            <p className="sync-account-key" title={syncAccount?.syncKey || undefined}>
              Key: {typeof syncAccount?.syncKey === "string"
                ? syncAccount.syncKey.slice(0, 32)
                : ""}
            </p>
          )}
          {syncErrorText && <p className="sync-account-error">{syncErrorText}</p>}
        </div>
      )}
    </div>
  );
}

export default memo(SyncAccountPanel);
