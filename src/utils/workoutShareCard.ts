/**
 * Renders a branded IGU workout summary to a shareable PNG (no dependency —
 * drawn on a <canvas>). Portrait 1080×1350 so it sits well in IG/Stories and
 * crops fine for a square post. Flat dark IGU palette + Geist; numbers mono.
 */
import { fromCanonicalKg, type WeightUnit } from "@/utils/weightUnits";
import type { WorkoutSummary } from "@/components/workout/WorkoutCompletionSheet";

interface ShareCardOpts {
  moduleTitle?: string;
  dateLabel?: string;
}

function elapsedLabel(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export async function generateWorkoutShareImage(
  summary: WorkoutSummary,
  unit: WeightUnit,
  opts: ShareCardOpts = {},
): Promise<Blob | null> {
  // Make sure Geist is loaded before measuring/drawing text.
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* fonts API unavailable — fall back to system font */
  }

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const SANS = "Geist, system-ui, -apple-system, sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, monospace";
  const bg = "#0B0B0C";
  const card = "#161616";
  const light = "#F5F5F4";
  const muted = "#A1A1A0";
  const dim = "#6B6B6A";
  const emerald = "#34D399";
  const amber = "#F59E0B";
  const pad = 84;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ---- Header: IGU wordmark + date · workout ----
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = light;
  ctx.font = `600 46px ${SANS}`;
  ctx.fillText("IGU", pad, 128);

  ctx.textAlign = "right";
  ctx.fillStyle = muted;
  ctx.font = `400 30px ${SANS}`;
  const headerRight = [opts.dateLabel, opts.moduleTitle].filter(Boolean).join("  ·  ") || "Workout";
  ctx.fillText(headerRight, W - pad, 124);

  // ---- Hero: total volume ----
  const vol = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = `400 36px ${SANS}`;
  ctx.fillText("TOTAL VOLUME", pad, 380);

  ctx.fillStyle = light;
  ctx.font = `600 168px ${MONO}`;
  const volStr = vol.toLocaleString();
  ctx.fillText(volStr, pad, 540);
  const volWidth = ctx.measureText(volStr).width;
  ctx.fillStyle = muted;
  ctx.font = `400 52px ${SANS}`;
  ctx.fillText(` ${unit}`, pad + volWidth, 540);

  // ---- Divider ----
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 640);
  ctx.lineTo(W - pad, 640);
  ctx.stroke();

  // ---- Stat columns: Exercises · Sets · Time ----
  const elapsed = elapsedLabel(summary.elapsedSeconds);
  const stats: Array<{ value: string; label: string }> = [
    { value: `${summary.exerciseCount}`, label: "EXERCISES" },
    { value: `${summary.setsCompleted}`, label: "SETS" },
    { value: elapsed ?? "--", label: "TIME" },
  ];
  const colCenters = [W * 0.24, W * 0.5, W * 0.76];
  ctx.textAlign = "center";
  stats.forEach((s, i) => {
    ctx.fillStyle = light;
    ctx.font = `600 84px ${MONO}`;
    ctx.fillText(s.value, colCenters[i], 770);
    ctx.fillStyle = dim;
    ctx.font = `400 28px ${SANS}`;
    ctx.fillText(s.label, colCenters[i], 818);
  });

  // ---- PR highlight ----
  if (summary.prs.length > 0) {
    const top = summary.prs[0];
    const prVal = `${fromCanonicalKg(top.weightKg, unit, unit === "kg" ? 1 : 0)} ${unit} × ${top.reps}`;
    const boxY = 900;
    const boxH = 150;
    ctx.fillStyle = "rgba(52,211,153,0.12)";
    roundRect(ctx, pad, boxY, W - pad * 2, boxH, 22);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = emerald;
    ctx.font = `600 32px ${SANS}`;
    const prCount = summary.prs.length;
    ctx.fillText(`🏆  ${prCount} personal record${prCount > 1 ? "s" : ""}`, pad + 36, boxY + 58);
    ctx.fillStyle = light;
    ctx.font = `500 40px ${SANS}`;
    ctx.fillText(top.name, pad + 36, boxY + 108);
    ctx.textAlign = "right";
    ctx.fillStyle = light;
    ctx.font = `600 40px ${MONO}`;
    ctx.fillText(prVal, W - pad - 36, boxY + 108);
  } else {
    const boxY = 900;
    ctx.fillStyle = card;
    roundRect(ctx, pad, boxY, W - pad * 2, 150, 22);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.font = `400 36px ${SANS}`;
    ctx.fillText("Session logged 💪", W / 2, boxY + 90);
  }

  // ---- Footer ----
  ctx.textAlign = "center";
  ctx.fillStyle = dim;
  ctx.font = `400 30px ${SANS}`;
  ctx.fillText("theigu.com", W / 2, H - 90);

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
