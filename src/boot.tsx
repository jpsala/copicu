declare global {
  interface Window {
    __copicuBoot?: {
      htmlAt?: number;
      htmlEpoch?: number;
      bootAt?: number;
      appImportStartAt?: number;
      appImportEndAt?: number;
      appImportError?: string;
    };
  }
}

export {};

const boot = (window.__copicuBoot ??= {});
boot.bootAt = performance.now();

console.info("[copicu:boot] bootstrap module loaded", {
  elapsedFromHtml: boot.htmlAt === undefined ? null : boot.bootAt - boot.htmlAt,
  readyState: document.readyState,
});

boot.appImportStartAt = performance.now();
import("./main")
  .then(() => {
    boot.appImportEndAt = performance.now();
    console.info("[copicu:boot] app module loaded", {
      elapsedFromHtml: boot.htmlAt === undefined ? null : boot.appImportEndAt - boot.htmlAt,
      importDuration: boot.appImportEndAt - (boot.appImportStartAt ?? boot.appImportEndAt),
    });
  })
  .catch((error) => {
    boot.appImportError = error instanceof Error ? error.message : String(error);
    console.error("[copicu:boot] app module import failed", error);
  });
