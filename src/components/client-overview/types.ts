/**
 * Stable interface contract for the coach-facing "Client Overview" page.
 *
 * The shell (CoachClientOverview.tsx + ClientOverviewHeader.tsx + tab strip)
 * is owned by another engineer. Each tab is owned by a separate engineer and
 * receives a single `ClientContext` prop so the shell remains the single place
 * that resolves the viewed client, profile, subscription, and viewer role.
 *
 * Change this file only with cross-owner agreement -- tabs rely on it.
 */

export type ViewerRole = "coach" | "admin" | "dietitian";

export interface ClientOverviewProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** profiles_public.status -- 'active' | 'pending' | 'suspended' | ... */
  status: string;
}

export interface ClientOverviewSubscription {
  id: string;
  /** subscriptions.status -- 'active' | 'cancelled' | 'past_due' | ... */
  status: string;
  /** services.type -- 'one_to_one' | 'team' | 'hybrid' | 'in_person' */
  serviceType: string;
  /** services.name for display */
  serviceName: string | null;
}

export interface ClientContext {
  clientUserId: string;
  profile: ClientOverviewProfile;
  /** null when the client never subscribed (edge case: admin-created shells). */
  subscription: ClientOverviewSubscription | null;
  /** Resolved from the viewer's user_roles + care-team membership. */
  viewerRole: ViewerRole;
}

export interface ClientOverviewTabProps {
  context: ClientContext;
}
