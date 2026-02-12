/**
 * ============================================================================
 * PAYMENT TYPES AND UTILITIES
 * ============================================================================
 * 
 * Centralized payment status definitions and helper functions.
 * All payment-related components should use these types for consistency.
 * ============================================================================
 */

// =============================================================================
// PAYMENT STATUS TYPES
// =============================================================================

/**
 * Payment statuses in the subscription_payments table.
 */
export type PaymentStatus =
  | "initiated"   // Payment started, awaiting completion
  | "paid"        // Payment successful (CAPTURED)
  | "failed"      // Payment failed
  | "cancelled"   // Payment cancelled by user
  | "refunded"    // Payment refunded
  | "pending";    // Legacy: awaiting processing

/**
 * TAP payment statuses (from TAP API).
 */
export type TapPaymentStatus =
  | "INITIATED"
  | "CAPTURED"
  | "FAILED"
  | "DECLINED"
  | "CANCELLED"
  | "PENDING"
  | "AUTHORIZED"
  | "VOID"
  | "REFUNDED";

/**
 * Subscription statuses.
 */
export type SubscriptionStatus =
  | "pending"     // Awaiting first payment
  | "active"      // Active subscription
  | "past_due"    // Payment overdue, in grace period
  | "inactive"    // Deactivated (grace period expired)
  | "cancelled"   // User cancelled
  | "expired";    // Subscription expired

// =============================================================================
// STATUS DISPLAY HELPERS
// =============================================================================

export interface PaymentStatusDisplay {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: "check" | "clock" | "x" | "alert";
}

export const PAYMENT_STATUS_DISPLAY: Record<PaymentStatus, PaymentStatusDisplay> = {
  initiated: { label: "Processing", variant: "secondary", icon: "clock" },
  paid: { label: "Paid", variant: "default", icon: "check" },
  failed: { label: "Failed", variant: "destructive", icon: "x" },
  cancelled: { label: "Cancelled", variant: "outline", icon: "x" },
  refunded: { label: "Refunded", variant: "outline", icon: "alert" },
  pending: { label: "Pending", variant: "secondary", icon: "clock" },
};

export function getPaymentStatusDisplay(status: PaymentStatus | string): PaymentStatusDisplay {
  return PAYMENT_STATUS_DISPLAY[status as PaymentStatus] || {
    label: status,
    variant: "outline" as const,
    icon: "alert" as const,
  };
}

export const TAP_STATUS_DISPLAY: Record<TapPaymentStatus, PaymentStatusDisplay> = {
  INITIATED: { label: "Processing", variant: "secondary", icon: "clock" },
  CAPTURED: { label: "Paid", variant: "default", icon: "check" },
  FAILED: { label: "Failed", variant: "destructive", icon: "x" },
  DECLINED: { label: "Declined", variant: "destructive", icon: "x" },
  CANCELLED: { label: "Cancelled", variant: "outline", icon: "x" },
  PENDING: { label: "Pending", variant: "secondary", icon: "clock" },
  AUTHORIZED: { label: "Authorized", variant: "secondary", icon: "clock" },
  VOID: { label: "Voided", variant: "outline", icon: "x" },
  REFUNDED: { label: "Refunded", variant: "outline", icon: "alert" },
};

export function getTapStatusDisplay(status: TapPaymentStatus | string): PaymentStatusDisplay {
  return TAP_STATUS_DISPLAY[status as TapPaymentStatus] || {
    label: status,
    variant: "outline" as const,
    icon: "alert" as const,
  };
}

// =============================================================================
// PAYMENT VALIDATION
// =============================================================================

/**
 * Check if a payment status indicates successful payment.
 */
export function isPaymentSuccessful(status: PaymentStatus | TapPaymentStatus | string): boolean {
  return status === "paid" || status === "CAPTURED";
}

/**
 * Check if a payment status indicates the payment is still processing.
 */
export function isPaymentPending(status: PaymentStatus | TapPaymentStatus | string): boolean {
  return ["initiated", "pending", "INITIATED", "PENDING", "AUTHORIZED"].includes(status);
}

/**
 * Check if a payment status indicates failure.
 */
export function isPaymentFailed(status: PaymentStatus | TapPaymentStatus | string): boolean {
  return ["failed", "cancelled", "FAILED", "DECLINED", "CANCELLED", "VOID"].includes(status);
}

// =============================================================================
// PAYMENT DATA TYPES
// =============================================================================

export interface PaymentRecord {
  id: string;
  subscription_id: string;
  user_id: string;
  tap_charge_id: string | null;
  amount_kwd: number;
  status: PaymentStatus;
  is_renewal: boolean;
  billing_period_start: string;
  billing_period_end: string;
  paid_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface PaymentSummary {
  totalPaid: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  nextPaymentDue: string | null;
  nextPaymentAmount: number | null;
  hasPastDueBalance: boolean;
}

/**
 * Calculate payment summary from payment records.
 */
export function calculatePaymentSummary(
  payments: PaymentRecord[],
  subscription?: { next_billing_date?: string | null; billing_amount_kwd?: number | null }
): PaymentSummary {
  const paidPayments = payments.filter(p => p.status === "paid");
  const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount_kwd, 0);
  
  const sortedPaid = paidPayments.sort(
    (a, b) => new Date(b.paid_at || b.created_at).getTime() - new Date(a.paid_at || a.created_at).getTime()
  );
  
  const lastPayment = sortedPaid[0];
  
  return {
    totalPaid,
    lastPaymentDate: lastPayment?.paid_at || lastPayment?.created_at || null,
    lastPaymentAmount: lastPayment?.amount_kwd || null,
    nextPaymentDue: subscription?.next_billing_date || null,
    nextPaymentAmount: subscription?.billing_amount_kwd || null,
    hasPastDueBalance: subscription?.next_billing_date 
      ? new Date(subscription.next_billing_date) < new Date()
      : false,
  };
}

// =============================================================================
// RECEIPT HELPERS
// =============================================================================

/**
 * Generate a receipt URL for a TAP charge.
 */
export function getTapReceiptUrl(chargeId: string): string {
  // TAP provides receipts at this URL pattern
  return `https://receipts.tap.company/${chargeId}`;
}

/**
 * Format currency amount for display.
 */
export function formatCurrency(amount: number, currency: string = "KWD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "KWD" ? 3 : 2,
    maximumFractionDigits: currency === "KWD" ? 3 : 2,
  }).format(amount);
}

// =============================================================================
// ADMIN OVERRIDE TYPES
// =============================================================================

export interface PaymentOverrideEvent {
  subscriptionId: string;
  userId: string;
  newStatus: SubscriptionStatus;
  reason: string;
  overriddenBy: string;
  amount?: number;
  chargeId?: string;
  timestamp: Date;
}

/**
 * Log a manual payment override event.
 */
export function logPaymentOverride(event: PaymentOverrideEvent): void {
  if (import.meta.env.DEV) {
    console.log("[PaymentOverride]", {
      ...event,
      timestamp: event.timestamp.toISOString(),
    });
  }
}
