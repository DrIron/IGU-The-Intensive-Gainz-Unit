// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { MessageSquare, type LucideIcon } from "lucide-react";
import { getCoachMobileNavItems, COACH_MESSAGES_MOBILE_PATH } from "./CoachSidebar";
import { formatUnreadBadge } from "@/lib/unread";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MS5 — the coach mobile dock gains a Messages item with an unread badge, at parity with the
 * client dock. These pin: (1) the item exists, at its own path with the MessageSquare icon;
 * (2) the badge is the SUM of the useStaffUnreadCounts map (not a single thread); (3) no unread
 * → no badge. The badge attach mirrors the exact client-dock map used in App.tsx.
 */

type BadgedItem = { path: string; label: string; icon: LucideIcon; badge?: string | null };

// The exact mapping App.tsx applies (sum the per-client counts map → one dock badge).
function withMessagesBadge(
  items: ReturnType<typeof getCoachMobileNavItems>,
  counts: Record<string, number>,
): BadgedItem[] {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return items.map((item) =>
    item.path === COACH_MESSAGES_MOBILE_PATH ? { ...item, badge: formatUnreadBadge(total) } : item,
  );
}

describe("coach mobile dock — Messages item (MS5)", () => {
  it("includes a Messages item at its own path with the MessageSquare icon", () => {
    const items = getCoachMobileNavItems({ isCoach: true });
    const msgs = items.find((i) => i.path === COACH_MESSAGES_MOBILE_PATH);
    expect(msgs).toBeTruthy();
    expect(msgs?.label).toBe("Messages");
    expect(msgs?.icon).toBe(MessageSquare);
    // Distinct from the Clients item (dock keys by path → no collision).
    expect(COACH_MESSAGES_MOBILE_PATH).not.toBe("/coach/clients");
    expect(items.filter((i) => i.path === COACH_MESSAGES_MOBILE_PATH)).toHaveLength(1);
  });

  it("also present for a pure dietitian (parity — dietitians have client threads too)", () => {
    const items = getCoachMobileNavItems({ isDietitian: true, isCoach: false });
    expect(items.some((i) => i.path === COACH_MESSAGES_MOBILE_PATH)).toBe(true);
  });

  it("the badge is the SUM of the counts map, not a single thread", () => {
    const items = getCoachMobileNavItems({ isCoach: true });
    const badged = withMessagesBadge(items, { "client-a": 2, "client-b": 3, "client-c": 1 });
    const msgs = badged.find((i) => i.path === COACH_MESSAGES_MOBILE_PATH);
    expect(msgs?.badge).toBe("6"); // 2 + 3 + 1, aggregated across the roster
    // No other item is badged.
    expect(badged.filter((i) => i.badge != null)).toHaveLength(1);
  });

  it("caps at 99+ like every other unread badge", () => {
    const items = getCoachMobileNavItems({ isCoach: true });
    const badged = withMessagesBadge(items, { a: 80, b: 50 });
    expect(badged.find((i) => i.path === COACH_MESSAGES_MOBILE_PATH)?.badge).toBe("99+");
  });

  it("no unread → the Messages item carries no badge", () => {
    const items = getCoachMobileNavItems({ isCoach: true });
    const badged = withMessagesBadge(items, {}); // empty roster map
    expect(badged.find((i) => i.path === COACH_MESSAGES_MOBILE_PATH)?.badge).toBeNull();
  });
});

describe("coach mobile dock — Messages badge renders (MS5)", () => {
  let container: HTMLDivElement;
  let root: Root;
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

  const mount = async (counts: Record<string, number>) => {
    const items = withMessagesBadge(getCoachMobileNavItems({ isCoach: true }), counts);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/coach/clients"]}>
          <MobileBottomNav items={items} maxVisible={5} />
        </MemoryRouter>,
      );
    });
    return container;
  };

  it("renders the Messages tab, and its summed unread badge when there are unread threads", async () => {
    const el = await mount({ a: 4, b: 3 });
    expect(el.textContent).toContain("Messages");
    // The badge (7) is announced for AT and shown.
    expect(el.querySelector('[aria-label="7 unread"]')).not.toBeNull();
    expect(el.textContent).toContain("7");
  });

  it("renders the Messages tab with NO badge when nothing is unread", async () => {
    const el = await mount({});
    expect(el.textContent).toContain("Messages");
    expect(el.querySelector('[aria-label$="unread"]')).toBeNull();
  });
});
