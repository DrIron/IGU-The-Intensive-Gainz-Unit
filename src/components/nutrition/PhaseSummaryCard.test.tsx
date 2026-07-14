// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * NU6 guard — the shareable phase card.
 *
 * Two contracts:
 *   1. HONESTY. The hero result is NEUTRAL — never crimson/green/red-as-success.
 *      Colouring a weight change as "good" asserts that down is universally good,
 *      which is false under a muscle-gain phase. Same rule PUB6 / CL5 / CO4 enforce.
 *      And the phase name rides with the number, so it reads against the client's OWN
 *      goal.
 *   2. REAL DATA ONLY. A missing summary renders NOTHING — never a zeroed card
 *      claiming a 0.0 kg result the client never had.
 *
 * Plus the share path: PNG produced, native share used where available, download as
 * the fallback, and an AbortError (the client dismissing the sheet) treated as a
 * cancellation rather than silently dumping a file in their Downloads.
 */

// --- html-to-image is dynamically imported by sharePhaseCard; mock the module. ---
const toBlob = vi.fn();
vi.mock("html-to-image", () => ({ toBlob }));
vi.mock("@/lib/errorLogging", () => ({ captureException: vi.fn() }));

const { PhaseSummaryCard } = await import("./PhaseSummaryCard");
const { PhaseSummaryReport } = await import("./PhaseSummaryReport");
const { sharePhaseCard, canShareFiles } = await import("@/lib/sharePhaseCard");

const PHASE = { phase_name: "Summer Cut", start_date: "2026-04-01" };

const SUMMARY = {
  startWeight: 82.4,
  endWeight: 78.2,
  totalChange: -4.2,
  targetChange: -5,
  percentOfTarget: 84,
  averageAdherence: 91,
  dietBreaksTaken: 1,
  avgDailyCalories: 2140,
  avgProtein: 165,
  avgFat: 62,
  avgCarbs: 210,
};

let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<HTMLDivElement> {
  await act(async () => root.render(ui));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
}

describe("PhaseSummaryCard — NU6 honesty contract", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the real phase values: hero result, phase name, duration, name", async () => {
    const el = await render(
      <PhaseSummaryCard
        data={{
          phaseName: "Summer Cut",
          deltaKg: -4.2,
          weeks: 12,
          protein: 165,
          fat: 62,
          carbs: 210,
          firstName: "Sara",
        }}
      />,
    );
    const text = el.textContent ?? "";

    expect(text).toContain("4.2"); // hero magnitude
    expect(text).toContain("kg");
    expect(text).toContain("12 weeks · Summer Cut"); // phase-framed
    expect(text).toContain("Sara");
    expect(text).toContain("IGU"); // brand mark — every share is an impression
  });

  it("the hero number carries NO crimson / green / red success colouring", async () => {
    const el = await render(
      <PhaseSummaryCard
        data={{ phaseName: "Summer Cut", deltaKg: -4.2, weeks: 12, protein: 165, fat: 62, carbs: 210 }}
      />,
    );

    const hero = [...el.querySelectorAll("span")].find((s) => s.textContent?.trim() === "4.2");
    expect(hero).toBeTruthy();
    expect(hero!.className).toContain("font-display"); // Bebas
    expect(hero!.className).not.toMatch(
      /text-primary|text-emerald|text-green|text-destructive|text-red|status-ontrack|status-risk/,
    );
  });

  it("a GAIN is styled identically to a loss — neither is 'good'", async () => {
    const gain = await render(
      <PhaseSummaryCard
        data={{ phaseName: "Lean Bulk", deltaKg: 3.1, weeks: 10, protein: 190, fat: 70, carbs: 320 }}
      />,
    );
    // No success/failure colour anywhere on the card, in either direction.
    expect(gain.innerHTML).not.toMatch(/text-emerald|text-green|text-destructive|text-red|bg-green|bg-red/);
    expect(gain.textContent).toContain("3.1");
    expect(gain.textContent).toContain("Lean Bulk");
  });

  it("omits the name line when the first name is unknown", async () => {
    const el = await render(
      <PhaseSummaryCard
        data={{ phaseName: "Summer Cut", deltaKg: -4.2, weeks: 12, protein: 165, fat: 62, carbs: 210 }}
      />,
    );
    expect(el.querySelector(".border-t")).toBeNull();
  });
});

describe("PhaseSummaryReport — real data only", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders NOTHING when there is no summary — never a zeroed card", async () => {
    const el = await render(<PhaseSummaryReport phase={PHASE} summary={null} />);
    expect(el.textContent).toBe("");
    expect(el.innerHTML).toBe("");
  });

  it("renders NOTHING when the change is not a finite number", async () => {
    const el = await render(
      <PhaseSummaryReport phase={PHASE} summary={{ ...SUMMARY, totalChange: NaN }} />,
    );
    expect(el.textContent).toBe("");
  });

  it("the detail's Change stat is neutral — the old green-up / red-down arrows are gone", async () => {
    const el = await render(<PhaseSummaryReport phase={PHASE} summary={SUMMARY} firstName="Sara" />);

    expect(el.textContent).toContain("-4.2 kg");
    // The pre-NU6 component coloured this green/red. It must not come back.
    expect(el.innerHTML).not.toMatch(/text-green-500|text-red-500|text-emerald|text-destructive/);
  });

  it("offers Share, not the old plain-text download", async () => {
    const el = await render(<PhaseSummaryReport phase={PHASE} summary={SUMMARY} />);
    expect(el.textContent).toContain("Share");
    expect(el.textContent).not.toContain("Download");
  });
});

describe("sharePhaseCard — PNG export + share/download", () => {
  const node = () => {
    const d = document.createElement("div");
    document.body.appendChild(d);
    return d;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    toBlob.mockResolvedValue(new Blob(["png-bytes"], { type: "image/png" }));
  });

  it("produces a PNG file and hands it to the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: () => true,
    });

    expect(canShareFiles()).toBe(true);
    const outcome = await sharePhaseCard(node(), "Summer Cut");

    expect(outcome).toBe("shared");
    expect(toBlob).toHaveBeenCalledOnce();

    const arg = share.mock.calls[0][0];
    const file = arg.files[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("Summer_Cut_IGU.png");

    vi.unstubAllGlobals();
  });

  it("falls back to a PNG DOWNLOAD when file-sharing isn't supported", async () => {
    vi.stubGlobal("navigator", {}); // no canShare
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });

    const outcome = await sharePhaseCard(node(), "Summer Cut");

    expect(outcome).toBe("downloaded");
    expect(toBlob).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("treats a dismissed share sheet as CANCELLED — it does not silently download", async () => {
    const abort = new Error("user cancelled");
    abort.name = "AbortError";
    const share = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const outcome = await sharePhaseCard(node(), "Summer Cut");

    expect(outcome).toBe("cancelled");
    // The client declined to share — dumping the file into Downloads anyway would be
    // doing something they explicitly said no to.
    expect(click).not.toHaveBeenCalled();

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("reports failure rather than throwing when rasterisation fails", async () => {
    toBlob.mockResolvedValue(null);
    vi.stubGlobal("navigator", {});

    const outcome = await sharePhaseCard(node(), "Summer Cut");
    expect(outcome).toBe("failed");

    vi.unstubAllGlobals();
  });
});
