/**
 * Centralized application configuration.
 * 
 * IMPORTANT: All user-facing URLs must use the production domain (theigu.com)
 * to prevent preview/dev URLs from appearing in emails.
 */

/**
 * The canonical production base URL for all user-facing links.
 * This ensures emails always point to the production domain,
 * regardless of whether they're triggered from preview or admin tools.
 */
export const APP_BASE_URL = "https://theigu.com";

/**
 * Auth redirect URLs - always use production domain
 */
export const AUTH_REDIRECT_URLS = {
  onboarding: `${APP_BASE_URL}/onboarding`,
  resetPassword: `${APP_BASE_URL}/reset-password`,
  dashboard: `${APP_BASE_URL}/dashboard`,
  billingPay: `${APP_BASE_URL}/billing/pay`,
  paymentReturn: `${APP_BASE_URL}/payment-return`,
  coachPasswordSetup: (coachId: string) => `${APP_BASE_URL}/coach-password-setup?coach_id=${coachId}`,
  coachSignup: (coachId: string) => `${APP_BASE_URL}/coach-signup?coach_id=${coachId}`,
} as const;

/**
 * Support email address
 */
export const SUPPORT_EMAIL = "support@theigu.com";
