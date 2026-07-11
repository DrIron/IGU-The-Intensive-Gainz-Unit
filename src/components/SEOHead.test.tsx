// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SEOHead } from "./SEOHead";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression guard for the T2 OG follow-up: the static OG tags in index.html
 * carry data-rh="true" so react-helmet-async ADOPTS them and a per-page
 * <SEOHead> REPLACES them (single tag, page-specific value) instead of leaving
 * a duplicate that shadows it. Simulates index.html's static tag, mounts
 * SEOHead with coach values, and asserts the DOM og:title reflects the coach.
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
  // Let react-helmet-async's post-commit DOM sync run.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("SEOHead — per-page OG wins over static index.html defaults", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta property="og:title" content="STATIC DEFAULT" data-rh="true" />
      <meta property="og:description" content="static description" data-rh="true" />
      <meta property="og:image" content="https://theigu.com/og-image.png" data-rh="true" />
    `;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("replaces (not duplicates) og:title/description/image with the coach values", async () => {
    await mount(
      <SEOHead
        title="Hasan Dashti — Head Coach · Lifestyle | IGU"
        description="Physique & strength coach."
        image="https://cdn.test/hasan.jpg"
        type="profile"
      />,
    );

    const titles = document.querySelectorAll('meta[property="og:title"]');
    expect(titles).toHaveLength(1);
    expect(titles[0].getAttribute("content")).toBe("Hasan Dashti — Head Coach · Lifestyle | IGU");
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(
      "Physique & strength coach.",
    );
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://cdn.test/hasan.jpg",
    );
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("profile");
  });

  it("falls back to the default og:image when none is supplied", async () => {
    await mount(<SEOHead title="No image page" description="desc" />);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://theigu.com/og-image.png",
    );
  });
});
