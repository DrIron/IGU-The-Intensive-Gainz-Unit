import { captureException } from "@/lib/errorLogging";

/**
 * sharePhaseCard (NU6) — rasterise a DOM node to PNG, then share or download it.
 *
 * BUNDLE: `html-to-image` is DYNAMICALLY imported here, so it lands in its own chunk
 * and adds NOTHING to the initial bundle — it only loads when a client actually taps
 * Share, on a surface most clients see once per phase. (Zero transitive deps.)
 *
 * Native share where supported (iOS/Android Safari + Chrome), falling back to a
 * download everywhere else — which also replaces the old plain-.txt export.
 */

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

/** Can this browser share an actual FILE (not just a URL)? */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    // A probe file: canShare() is the only honest way to ask.
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function sharePhaseCard(node: HTMLElement, phaseName: string): Promise<ShareOutcome> {
  const filename = `${phaseName.replace(/\s+/g, "_")}_IGU.png`;

  try {
    // Dynamic import — keeps html-to-image out of the initial bundle entirely.
    const { toBlob } = await import("html-to-image");

    const blob = await toBlob(node, {
      // 2x for a crisp image on retina + when re-shared into a story.
      pixelRatio: 2,
      // The card is bg-card, but a transparent backdrop would rasterise badly in
      // a share sheet — pin the computed background.
      backgroundColor: getComputedStyle(node).backgroundColor || undefined,
      cacheBust: true,
    });

    if (!blob) throw new Error("html-to-image produced no blob");

    const file = new File([blob], filename, { type: "image/png" });

    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (err) {
        // The user dismissing the share sheet throws AbortError — that is a
        // cancellation, NOT a failure, and must not fall through to a download
        // (which would silently drop a file into their Downloads folder they
        // explicitly declined to share).
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
        throw err;
      }
    }

    download(blob, filename);
    return "downloaded";
  } catch (err) {
    captureException(err, { source: "sharePhaseCard" });
    return "failed";
  }
}
