/**
 * Utility functions for formatting statuses and labels
 * Converts snake_case to human-readable format
 */

// Profile/Account status labels
export const profileStatusLabels: Record<string, string> = {
  pending: 'Pending',
  pending_payment: 'Pending Payment',
  pending_coach_approval: 'Pending Coach Approval',
  needs_medical_review: 'Medical Review Required',
  active: 'Active',
  inactive: 'Inactive',
  cancelled: 'Cancelled',
  expired: 'Expired',
  suspended: 'Suspended',
  approved: 'Approved',
};

// Subscription status labels
export const subscriptionStatusLabels: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  cancelled: 'Cancelled',
  expired: 'Expired',
  paused: 'Paused',
};

// TAP payment status labels
export const tapStatusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  CANCELLED: 'Cancelled',
  DECLINED: 'Declined',
  PENDING: 'Pending',
  FAILED: 'Failed',
  INITIATED: 'Initiated',
  CAPTURED: 'Captured',
};

// Service type labels
export const serviceTypeLabels: Record<string, string> = {
  one_to_one: '1:1 Coaching',
  team: 'Team Training',
  one_to_one_online: '1:1 Online',
  one_to_one_in_person: '1:1 In-Person',
  one_to_one_hybrid: '1:1 Hybrid',
};

// Generic function to format any snake_case string
export function formatSnakeCase(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Get human-readable profile status
export function formatProfileStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return profileStatusLabels[status] || formatSnakeCase(status);
}

// Get human-readable subscription status
export function formatSubscriptionStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return subscriptionStatusLabels[status] || formatSnakeCase(status);
}

// Get human-readable TAP status
export function formatTapStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return tapStatusLabels[status] || formatSnakeCase(status);
}

// Get human-readable service type
export function formatServiceType(type: string | null | undefined): string {
  if (!type) return 'Unknown';
  return serviceTypeLabels[type] || formatSnakeCase(type);
}

// Badge variant based on profile status
export function getProfileStatusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'pending':
    case 'pending_payment':
    case 'pending_coach_approval':
      return 'secondary';
    case 'needs_medical_review':
    case 'suspended':
      return 'destructive';
    case 'cancelled':
    case 'expired':
    case 'inactive':
    default:
      return 'outline';
  }
}

// Badge variant based on subscription status
export function getSubscriptionStatusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'cancelled':
    case 'expired':
    case 'inactive':
    default:
      return 'outline';
  }
}

// Coach load percentage → Tailwind background color class
export function getLoadColor(loadPercent: number | null): string {
  if (loadPercent === null) return 'bg-muted';
  if (loadPercent > 100) return 'bg-destructive';
  if (loadPercent >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

// Coach load percentage → Tailwind text color class
export function getLoadTextColor(loadPercent: number | null): string {
  if (loadPercent === null) return 'text-muted-foreground';
  if (loadPercent > 100) return 'text-destructive';
  if (loadPercent >= 70) return 'text-amber-600';
  return 'text-green-600';
}
