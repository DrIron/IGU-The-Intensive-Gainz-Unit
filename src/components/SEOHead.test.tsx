// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SEOHead } from "./SEOHead";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression guard for the T2 SEO fix: SEOHead uses React 19 native document
 * metadata (NOT react-helmet-async, which is inert under React 19). The <meta>
 * tags it renders are hoisted into <head>, and <title> is set imperatively.
 * index.html carries only a minimal static <title> fallback (no og/description),
 * so per page there is exactly one of each tag.
 */
let container: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("SEOHead — React 19 native metadata (no react-helmet-async)", () => {
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

  it("sets the per-page title + hoists a single coach og:title/description/image", async () => {
    await mount(
      <SEOHead
        title="Hasan Dashti — Head Coach · Lifestyle | IGU"
        description="Physique & strength coach."
        image="https://cdn.test/hasan.jpg"
        type="profile"
      />,
    );

    expect(document.title).toBe("Hasan Dashti — Head Coach · Lifestyle | IGU");

    const titles = document.head.querySelectorAll('meta[property="og:title"]');
    expect(titles).toHaveLength(1);
    expect(titles[0].getAttribute("content")).toBe("Hasan Dashti — Head Coach · Lifestyle | IGU");

    expect(document.head.querySelectorAll('meta[property="og:image"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(
      "Physique & strength coach.",
    );
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://cdn.test/hasan.jpg",
    );
    expect(document.head.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("profile");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Physique & strength coach.",
    );
  });
});
