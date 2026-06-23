import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { AppSettings } from "./shared/settings";

type AutoUpdateSettings = AppSettings["autoUpdate"];

type AutoUpdateCallbacks = {
  onStatus?: (status: AutoUpdateStatus) => void;
  onError?: (message: string) => void;
};

export type AutoUpdateStatus =
  | { phase: "checking" }
  | { phase: "idle"; message: string }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; downloadedBytes: number; contentLength: number | null }
  | { phase: "installing"; version: string }
  | { phase: "relaunching"; version: string };

const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 20 * 1000;
const MIN_AUTO_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
let autoUpdateInFlight = false;

export function setupAutomaticUpdates(
  settings: AutoUpdateSettings,
  callbacks: AutoUpdateCallbacks = {},
) {
  if (!settings.enabled || !shouldRunUpdater()) {
    return () => undefined;
  }

  let disposed = false;
  const intervalMs = normalizeIntervalMs(settings.checkIntervalMinutes);

  const run = () => {
    if (disposed) {
      return;
    }
    void checkDownloadInstallAndRelaunch(callbacks).catch((error) => {
      callbacks.onError?.(error instanceof Error ? error.message : String(error));
    });
  };

  const startupTimer = window.setTimeout(run, STARTUP_CHECK_DELAY_MS);
  const interval = window.setInterval(run, intervalMs);

  return () => {
    disposed = true;
    window.clearTimeout(startupTimer);
    window.clearInterval(interval);
  };
}

export async function checkForAvailableUpdate(callbacks: AutoUpdateCallbacks = {}) {
  callbacks.onStatus?.({ phase: "checking" });
  const update = await check({ timeout: 30_000 });
  if (!update) {
    callbacks.onStatus?.({ phase: "idle", message: "Copicu is up to date." });
    return null;
  }
  callbacks.onStatus?.({ phase: "available", version: update.version });
  return update;
}

export async function checkDownloadInstallAndRelaunch(callbacks: AutoUpdateCallbacks = {}) {
  if (autoUpdateInFlight) {
    return;
  }

  autoUpdateInFlight = true;
  try {
    const update = await checkForAvailableUpdate(callbacks);
    if (!update) {
      return;
    }
    let downloadedBytes = 0;
    let contentLength: number | null = null;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        contentLength = event.data.contentLength ?? null;
        callbacks.onStatus?.({
          phase: "downloading",
          version: update.version,
          downloadedBytes,
          contentLength,
        });
        return;
      }
      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        callbacks.onStatus?.({
          phase: "downloading",
          version: update.version,
          downloadedBytes,
          contentLength,
        });
        return;
      }
      if (event.event === "Finished") {
        callbacks.onStatus?.({ phase: "installing", version: update.version });
      }
    });

    callbacks.onStatus?.({ phase: "relaunching", version: update.version });
    await relaunch();
  } finally {
    autoUpdateInFlight = false;
  }
}

function shouldRunUpdater() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) && import.meta.env.PROD;
}

function normalizeIntervalMs(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_AUTO_UPDATE_INTERVAL_MS;
  }
  return Math.max(MIN_AUTO_UPDATE_INTERVAL_MS, Math.round(minutes) * 60 * 1000);
}
