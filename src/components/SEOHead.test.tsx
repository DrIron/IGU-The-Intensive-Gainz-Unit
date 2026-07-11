// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SEOHead } from "./SEOHead";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression guard for the T2 OG fix. index.html carries NO overridable
 * title, description, Open Graph, or Twitter tags (only a minimal static
 * title fallback), so react-helmet-async is the sole owner and per-page
 * SEOHead reconciles cleanly. Simulates that head (just a plain title) and
 * asserts SEOHead applies the coach title + a single coach og title/description/image.
 *
 * NB: an earlier version marked static tags data-rh and "passed" here while
 * breaking the live app (helmet skips reconciliation for data-rh SSR tags). The
 * live DOM is the source of truth; this only guards the empty-head path.
 */
let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <HelmetProvider>{ui}</HelmetProvider>
      </QueryClientProvider>,
    );
  });
  // Let react-helmet-async's post-commit DOM sync run (macrotask, not just a
  // microtask — its client emitter defers the head mutation).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("SEOHead — sole owner of per-page title + OG (no static duplicates)", () => {
  beforeEach(() => {
    // Mirror the new index.html: only a minimal static <title>, no og/description.
    document.head.innerHTML = `<title>Intensive Gainz Unit</title>`;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("applies the per-page title + a single coach og:title/description/image", async () => {
    await mount(
      <SEOHead
        title="Hasan Dashti — Head Coach · Lifestyle | IGU"
        description="Physique & strength coach."
        image="https://cdn.test/hasan.jpg"
        type="profile"
      />,
    );

    expect(document.title).toBe("Hasan Dashti — Head Coach · Lifestyle | IGU");

    const titles = document.querySelectorAll('meta[property="og:title"]');
    expect(titles).toHaveLength(1);
    expect(titles[0].getAttribute("content")).toBe("Hasan Dashti — Head Coach · Lifestyle | IGU");

    expect(document.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(
      "Physique & strength coach.",
    );
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://cdn.test/hasan.jpg",
    );
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("profile");
  });
});
