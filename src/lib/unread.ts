/**
 * Unread-count badge formatting — single source shared by the desktop
 * ClientSidebar and the mobile bottom nav (CC3) so both render identically.
 * Returns the pre-formatted badge string ("1".."99", "99+") or null when there
 * is nothing unread.
 */
export function formatUnreadBadge(count: number): string | null {
  if (!count || count <= 0) return null;
  return count >= 100 ? "99+" : String(count);
}
