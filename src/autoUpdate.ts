import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
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

function recordAutoUpdateDiagnostic(event: string, detail?: string) {
  if (!isTauriRuntime()) {
    return;
  }
  void invoke("record_renderer_diagnostic", {
    event,
    detail: detail ?? null,
  }).catch(() => undefined);
}

export function setupAutomaticUpdates(
  settings: AutoUpdateSettings,
  callbacks: AutoUpdateCallbacks = {},
) {
  if (!settings.enabled || !shouldRunUpdater()) {
    recordAutoUpdateDiagnostic(
      "updater.setup.skip",
      `enabled=${settings.enabled} should_run=${shouldRunUpdater()}`,
    );
    return () => undefined;
  }

  let disposed = false;
  const intervalMs = normalizeIntervalMs(settings.checkIntervalMinutes);
  recordAutoUpdateDiagnostic(
    "updater.setup",
    `startup_delay_ms=${STARTUP_CHECK_DELAY_MS} interval_ms=${intervalMs}`,
  );

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
  const startedAt = performance.now();
  callbacks.onStatus?.({ phase: "checking" });
  recordAutoUpdateDiagnostic("updater.check.start", "timeout_ms=30000");
  try {
    const update = await check({ timeout: 30_000 });
    if (!update) {
      callbacks.onStatus?.({ phase: "idle", message: "Copicu is up to date." });
      recordAutoUpdateDiagnostic(
        "updater.check.end",
        `outcome=up_to_date duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
      return null;
    }
    callbacks.onStatus?.({ phase: "available", version: update.version });
    recordAutoUpdateDiagnostic(
      "updater.check.end",
      `outcome=available version=${update.version} duration_ms=${Math.round(
        performance.now() - startedAt,
      )}`,
    );
    return update;
  } catch (error) {
    recordAutoUpdateDiagnostic(
      "updater.check.end",
      `outcome=error duration_ms=${Math.round(performance.now() - startedAt)} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}

export async function checkDownloadInstallAndRelaunch(callbacks: AutoUpdateCallbacks = {}) {
  if (autoUpdateInFlight) {
    recordAutoUpdateDiagnostic("updater.run.skip", "reason=in_flight");
    return;
  }

  const startedAt = performance.now();
  autoUpdateInFlight = true;
  recordAutoUpdateDiagnostic("updater.run.start");
  try {
    const update = await checkForAvailableUpdate(callbacks);
    if (!update) {
      recordAutoUpdateDiagnostic(
        "updater.run.end",
        `outcome=no_update duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
      return;
    }
    let downloadedBytes = 0;
    let contentLength: number | null = null;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        contentLength = event.data.contentLength ?? null;
        recordAutoUpdateDiagnostic(
          "updater.download.start",
          `version=${update.version} content_length=${contentLength ?? "unknown"}`,
        );
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
        recordAutoUpdateDiagnostic(
          "updater.download.end",
          `version=${update.version} downloaded_bytes=${downloadedBytes}`,
        );
        callbacks.onStatus?.({ phase: "installing", version: update.version });
      }
    });

    callbacks.onStatus?.({ phase: "relaunching", version: update.version });
    recordAutoUpdateDiagnostic("updater.relaunch.start", `version=${update.version}`);
    await relaunch();
  } catch (error) {
    recordAutoUpdateDiagnostic(
      "updater.run.end",
      `outcome=error duration_ms=${Math.round(performance.now() - startedAt)} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  } finally {
    autoUpdateInFlight = false;
  }
}

function shouldRunUpdater() {
  return isTauriRuntime() && import.meta.env.PROD;
}

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function normalizeIntervalMs(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_AUTO_UPDATE_INTERVAL_MS;
  }
  return Math.max(MIN_AUTO_UPDATE_INTERVAL_MS, Math.round(minutes) * 60 * 1000);
}
