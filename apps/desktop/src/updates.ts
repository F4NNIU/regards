import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** A later version than the running one (mirrors `Update` in `src-tauri/src/updates.rs`). */
export interface Update {
  version: string;
  /** Its release page, where the installer is downloaded (`openUpdate`). */
  url: string;
  published_at: string | null;
}

export interface UpdateStatus {
  /**
   * Whether Regards checks for updates once a day. `null`: the person was
   * not asked yet. Ask once (a check tells GitHub this computer's address,
   * so it stays off until they say yes; see docs/privacy.md).
   */
  checks: boolean | null;
  /** The running version. */
  current: string;
  /** Found by the last check, this run. */
  available: Update | null;
  /** Unix ms of the last check, this run. */
  checked_at: number | null;
  /**
   * Whether this copy can install an update by itself (`installUpdate`). A
   * development build can't: offer the download (`openUpdate`) instead.
   */
  can_install: boolean;
}

/** How far the download of an update is (`onUpdateProgress`). */
export interface UpdateProgress {
  /** Bytes so far. */
  received: number;
  /** Bytes in all; `null` when the server does not say. */
  total: number | null;
}

export const updateStatus = () => invoke<UpdateStatus>("update_status");

/** The person's answer: check once a day, or never. */
export const setUpdateChecks = (on: boolean) => invoke<void>("update_set_checks", { on });

/** Check now, as the person asked, whatever the setting; rejects with the reason if it could not. */
export const checkForUpdate = () => invoke<Update | null>("update_check");

/** Open the found release's page in the browser, for the download. */
export const openUpdate = () => invoke<void>("update_open");

/**
 * Download the latest version, install it and start Regards again, as the
 * person asked. It does not resolve when it works: the app ends, and the new
 * one starts. Rejects with the reason if it could not; the download
 * (`openUpdate`) is then still there.
 */
export const installUpdate = () => invoke<void>("update_install");

/** While `installUpdate` downloads. */
export const onUpdateProgress = (handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> =>
  listen<UpdateProgress>("update_progress", (event) => handler(event.payload));

/** A daily check found a version the person was not told of yet (also notified once). */
export const onUpdateAvailable = (handler: (update: Update) => void): Promise<UnlistenFn> =>
  listen<Update>("update_available", (event) => handler(event.payload));
