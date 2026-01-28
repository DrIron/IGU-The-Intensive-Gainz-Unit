/**
 * ============================================================================
 * ERROR LOGGING SERVICE
 * ============================================================================
 * 
 * Centralized error logging for the application.
 * Integrates with:
 * 1. Sentry (primary error tracking)
 * 2. Browser console (always)
 * 3. Supabase security_audit_log table (for audit trail)
 * ============================================================================
 */

import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";

// Error severity levels
export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

// Error context for structured logging
export interface ErrorContext {
  /** Component or function where error occurred */
  source: string;
  /** User ID if authenticated */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Error severity */
  severity?: ErrorSeverity;
  /** Tags for categorization */
  tags?: string[];
}

// Logged error structure
interface LoggedError {
  timestamp: string;
  message: string;
  stack?: string;
  source: string;
  userId?: string;
  severity: ErrorSeverity;
  metadata?: Record<string, unknown>;
  tags?: string[];
  url: string;
  userAgent: string;
}

// In-memory error buffer (for debugging)
const errorBuffer: LoggedError[] = [];
const MAX_BUFFER_SIZE = 100;

/**
 * Capture and log an exception.
 */
export async function captureException(
  error: Error | unknown,
  context: ErrorContext
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const severity = context.severity || "error";

  const loggedError: LoggedError = {
    timestamp: new Date().toISOString(),
    message: err.message,
    stack: err.stack,
    source: context.source,
    userId: context.userId,
    severity,
    metadata: context.metadata,
    tags: context.tags,
    url: typeof window !== "undefined" ? window.location.href : "server",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
  };

  // Always log to console
  const consoleMethod = severity === "fatal" || severity === "error" 
    ? console.error 
    : severity === "warning" 
      ? console.warn 
      : console.log;

  consoleMethod(`[${severity.toUpperCase()}] ${context.source}:`, err.message, {
    ...context.metadata,
    stack: err.stack,
  });

  // Add to buffer
  errorBuffer.push(loggedError);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  // Log to Supabase (non-blocking)
  logToSupabase(loggedError).catch(() => {
    // Silently fail - don't cause more errors
  });

  // Send to Sentry
  try {
    Sentry.withScope((scope) => {
      // Set severity level
      scope.setLevel(severity === "fatal" ? "fatal" : severity === "error" ? "error" : "warning");
      
      // Set tags for filtering in Sentry
      scope.setTag("source", context.source);
      if (context.tags) {
        context.tags.forEach(tag => scope.setTag(tag, "true"));
      }
      
      // Set user context if available
      if (context.userId) {
        scope.setUser({ id: context.userId });
      }
      
      // Add extra context
      scope.setExtras({
        ...context.metadata,
        url: loggedError.url,
      });
      
      // Capture the exception
      Sentry.captureException(err);
    });
  } catch {
    // Silently fail if Sentry isn't initialized
  }
}

/**
 * Capture a message (non-error event).
 */
export async function captureMessage(
  message: string,
  context: ErrorContext
): Promise<void> {
  const severity = context.severity || "info";

  const loggedError: LoggedError = {
    timestamp: new Date().toISOString(),
    message,
    source: context.source,
    userId: context.userId,
    severity,
    metadata: context.metadata,
    tags: context.tags,
    url: typeof window !== "undefined" ? window.location.href : "server",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
  };

  // Log to console
  console.log(`[${severity.toUpperCase()}] ${context.source}:`, message, context.metadata);

  // Add to buffer
  errorBuffer.push(loggedError);
  if (errorBuffer.length > MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }

  // Log to Supabase for important messages
  if (severity === "warning" || severity === "error" || severity === "fatal") {
    logToSupabase(loggedError).catch(() => {});
    
    // Also send to Sentry
    try {
      Sentry.withScope((scope) => {
        scope.setLevel(severity === "warning" ? "warning" : "error");
        scope.setTag("source", context.source);
        if (context.tags) {
          context.tags.forEach(tag => scope.setTag(tag, "true"));
        }
        if (context.userId) {
          scope.setUser({ id: context.userId });
        }
        scope.setExtras(context.metadata || {});
        Sentry.captureMessage(message);
      });
    } catch {
      // Silently fail if Sentry isn't initialized
    }
  }
}

/**
 * Log error to Supabase security_audit_log.
 */
async function logToSupabase(loggedError: LoggedError): Promise<void> {
  try {
    await supabase.from("security_audit_log").insert({
      event_type: `frontend_${loggedError.severity}`,
      user_id: loggedError.userId || null,
      details: {
        message: loggedError.message,
        source: loggedError.source,
        stack: loggedError.stack?.slice(0, 2000), // Limit stack size
        url: loggedError.url,
        metadata: loggedError.metadata,
        tags: loggedError.tags,
      },
    });
  } catch {
    // Silently fail
  }
}

/**
 * Get recent errors from buffer (for debugging).
 */
export function getRecentErrors(): LoggedError[] {
  return [...errorBuffer];
}

/**
 * Clear error buffer.
 */
export function clearErrorBuffer(): void {
  errorBuffer.length = 0;
}

/**
 * Create a scoped logger for a specific component/module.
 */
export function createLogger(source: string) {
  return {
    info: (message: string, metadata?: Record<string, unknown>) =>
      captureMessage(message, { source, severity: "info", metadata }),
    
    warn: (message: string, metadata?: Record<string, unknown>) =>
      captureMessage(message, { source, severity: "warning", metadata }),
    
    error: (error: Error | unknown, metadata?: Record<string, unknown>) =>
      captureException(error, { source, severity: "error", metadata }),
    
    fatal: (error: Error | unknown, metadata?: Record<string, unknown>) =>
      captureException(error, { source, severity: "fatal", metadata }),
  };
}

// =============================================================================
// WEBHOOK/AUTH SPECIFIC LOGGING
// =============================================================================

/**
 * Log a webhook event (success or failure).
 */
export function logWebhookEvent(
  provider: string,
  status: "success" | "failure" | "ignored",
  details: Record<string, unknown>
): void {
  captureMessage(`Webhook ${status}: ${provider}`, {
    source: "webhook",
    severity: status === "failure" ? "error" : "info",
    metadata: { provider, status, ...details },
    tags: ["webhook", provider, status],
  });
}

/**
 * Log an authentication event.
 */
export function logAuthEvent(
  event: "login" | "logout" | "signup" | "password_reset" | "error",
  userId?: string,
  details?: Record<string, unknown>
): void {
  captureMessage(`Auth event: ${event}`, {
    source: "auth",
    severity: event === "error" ? "error" : "info",
    userId,
    metadata: { event, ...details },
    tags: ["auth", event],
  });
}

/**
 * Log a payment event.
 */
export function logPaymentEvent(
  event: "initiated" | "completed" | "failed" | "webhook_received",
  chargeId?: string,
  details?: Record<string, unknown>
): void {
  captureMessage(`Payment event: ${event}`, {
    source: "payment",
    severity: event === "failed" ? "error" : "info",
    metadata: { event, chargeId, ...details },
    tags: ["payment", event],
  });
}

// =============================================================================
// REACT ERROR BOUNDARY HELPERS
// =============================================================================

/**
 * Log an error from React Error Boundary.
 */
export function logErrorBoundary(
  error: Error,
  errorInfo: { componentStack: string },
  boundaryName: string
): void {
  captureException(error, {
    source: `ErrorBoundary:${boundaryName}`,
    severity: "error",
    metadata: {
      componentStack: errorInfo.componentStack,
    },
    tags: ["error_boundary", boundaryName],
  });
}
