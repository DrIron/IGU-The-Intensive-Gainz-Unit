/**
 * Shared configuration for all edge functions.
 * 
 * IMPORTANT: All user-facing URLs MUST use the production domain (theigu.com)
 * to prevent preview/dev/localhost URLs from appearing in emails.
 */

/**
 * The canonical production base URL for all user-facing links.
 * This ensures emails always point to the production domain,
 * regardless of the request origin or environment.
 */
export const APP_BASE_URL = "https://theigu.com";

/**
 * Auth redirect URLs - always use production domain
 */
export const AUTH_REDIRECT_URLS = {
  onboarding: `${APP_BASE_URL}/onboarding`,
  resetPassword: `${APP_BASE_URL}/reset-password`,
  dashboard: `${APP_BASE_URL}/dashboard`,
  services: `${APP_BASE_URL}/services`,
  auth: `${APP_BASE_URL}/auth`,
  billingPay: `${APP_BASE_URL}/billing/pay`,
  paymentReturn: `${APP_BASE_URL}/payment-return`,
  coachPasswordSetup: (coachId: string) => `${APP_BASE_URL}/coach-password-setup?coach_id=${coachId}`,
  coachSignup: (coachId: string) => `${APP_BASE_URL}/coach-signup?coach_id=${coachId}`,
  testimonial: (coachId: string) => `${APP_BASE_URL}/testimonial?coach=${coachId}`,
} as const;

/**
 * Email sender configuration
 * All system emails must use domain-based senders - NO personal emails or @resend.dev
 */
export const EMAIL_FROM = "Dr Iron <noreply@mail.theigu.com>";
export const EMAIL_FROM_COACHING = "Dr Iron Coaching <noreply@mail.theigu.com>";
export const EMAIL_FROM_IGU = "IGU Coaching <noreply@mail.theigu.com>";
export const EMAIL_FROM_ADMIN = "IGU Admin <admin@mail.theigu.com>";
export const EMAIL_FROM_BILLING = "IGU Billing <billing@mail.theigu.com>";

/**
 * Reply-to addresses (intentional routing)
 */
export const REPLY_TO_SUPPORT = "support@theigu.com";
export const REPLY_TO_ADMIN = "admin@theigu.com";

/**
 * Support email
 */
export const SUPPORT_EMAIL = "support@theigu.com";
