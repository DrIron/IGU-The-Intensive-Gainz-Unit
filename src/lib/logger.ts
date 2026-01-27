/**
 * Production-safe logger utility.
 * 
 * In production builds (import.meta.env.PROD === true):
 * - debug() is completely suppressed
 * - log() is suppressed unless VITE_ENABLE_PROD_LOGS is set
 * - warn() and error() always log (for monitoring)
 * 
 * NEVER log sensitive data (PII/PHI):
 * - email addresses
 * - phone numbers
 * - dates of birth
 * - API keys/tokens
 * - passwords
 * - medical information
 */

const isProduction = import.meta.env.PROD;
const enableProdLogs = import.meta.env.VITE_ENABLE_PROD_LOGS === 'true';

export const logger = {
  /**
   * Debug logging - development only
   */
  debug: (...args: unknown[]) => {
    if (!isProduction) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /**
   * General logging - development only (unless VITE_ENABLE_PROD_LOGS is set)
   */
  log: (...args: unknown[]) => {
    if (!isProduction || enableProdLogs) {
      console.log(...args);
    }
  },

  /**
   * Warning logging - always enabled (for monitoring)
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error logging - always enabled (for monitoring)
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /**
   * Info logging - development only
   */
  info: (...args: unknown[]) => {
    if (!isProduction) {
      console.info('[INFO]', ...args);
    }
  },
};

export default logger;
