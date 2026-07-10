import { ChevronDown, Cloud } from "lucide-react";
import { memo, useId, useMemo, useState } from "react";
import { toFiniteNumber } from "../../utils/numbers";

/*
 * Cloud backup, not cloud sync.
 *
 * Saved cities are stored against this device's anonymous Supabase session.
 * A second device is a different anonymous user and, by RLS, cannot see these
 * rows. There is therefore no sync key to share and no way to reconnect from
 * elsewhere — the paste-a-key "Connect" flow was removed rather than left in
 * place promising something the storage layer cannot do.
 */
function SyncAccountPanel({
  syncConnected,
  syncState,
  onCreateSyncAccount,
  onDisconnectSyncAccount,
  onSyncNow,
}) {
  const syncStatusText =
    typeof syncState?.message === "string" && syncState.message.trim()
      ? syncState.message.trim()
      : syncConnected
        ? "Backed up"
        : "Not backed up";
  const syncErrorText =
    typeof syncState?.error === "string" && syncState.error.trim()
      ? syncState.error.trim()
      : "";
  const isSyncing = syncState?.status === "syncing";
  const panelId = useId();
  /*
   * The panel stays collapsed by default. The audit flagged the
   * always-expanded body (when connected) as an outsized header
   * footprint for a feature most users never touch. The toggle
   * itself is enough on every page load — the user expands it
   * intentionally when they need to manage the backup. A syncing
   * state or live error still force-opens the panel so the user
   * can act on the situation.
   */
  const [isExpanded, setIsExpanded] = useState(false);
  const isPanelVisible = isExpanded || isSyncing || Boolean(syncErrorText);
  const syncSummaryHint = useMemo(() => {
    if (syncConnected) {
      return "Backed up";
    }
    if (syncErrorText) {
      return "Needs attention";
    }
    return "Optional";
  }, [syncConnected, syncErrorText]);
  const syncLastUpdatedLabel = useMemo(() => {
    // Strict coercion: a null syncState.lastSyncedAt would otherwise
    // coerce to 0 and render as "Last backed up 12:00 AM" (epoch).
    const lastSyncedAt = toFiniteNumber(syncState?.lastSyncedAt);
    if (lastSyncedAt === null) {
      return "";
    }

    return new Date(lastSyncedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [syncState?.lastSyncedAt]);

  return (
    <div className="sync-account-shell">
      <button
        type="button"
        className={`sync-account-toggle ${isPanelVisible ? "is-expanded" : ""}`.trim()}
        aria-expanded={isPanelVisible}
        aria-controls={panelId}
        aria-label={
          isPanelVisible
            ? "Collapse cloud backup controls"
            : "Expand cloud backup controls"
        }
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
      >
        <span className="sync-account-toggle-copy">
          <span className="sync-account-title">
            <Cloud size={13} aria-hidden="true" />
            <span>Cloud Backup</span>
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
        <div id={panelId} className="sync-account-panel">
          {/*
            The note states a fact, so it has to track the actual state. The
            backed-up sentence renders only when the device really is backed
            up; before that it would be a claim about data we have not stored.
          */}
          <p className="sync-account-note">
            {syncConnected
              ? "Your saved cities are backed up to the cloud from this device. Clearing your browser data starts a fresh backup."
              : "Your saved cities are stored on this device only. Back them up to the cloud, and note that clearing your browser data starts a fresh backup."}
          </p>
          {syncLastUpdatedLabel ? (
            <p className="sync-account-meta" role="status">
              Last backed up {syncLastUpdatedLabel}
            </p>
          ) : null}
          {syncConnected ? (
            <div className="sync-account-actions">
              <button
                type="button"
                className="sync-account-btn"
                onClick={onSyncNow}
                disabled={isSyncing}
                aria-busy={isSyncing || undefined}
              >
                Back up now
              </button>
              <button
                type="button"
                className="sync-account-btn sync-account-btn--subtle"
                onClick={onDisconnectSyncAccount}
                disabled={isSyncing}
                aria-busy={isSyncing || undefined}
              >
                Stop backup
              </button>
            </div>
          ) : (
            <div className="sync-account-actions">
              <button
                type="button"
                className="sync-account-btn"
                onClick={onCreateSyncAccount}
                disabled={isSyncing}
                aria-busy={isSyncing || undefined}
              >
                Start backup
              </button>
            </div>
          )}
          {syncErrorText && (
            <p className="sync-account-error" role="alert">
              {syncErrorText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(SyncAccountPanel);
