/**
 * Error message sanitizer for user-facing output.
 *
 * Supabase/PostgREST errors can expose internal schema details (table names,
 * column names, constraint names, PostgreSQL error codes). This utility detects
 * those patterns and returns a generic message instead.
 */

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** Patterns that indicate internal database/infrastructure errors */
const INTERNAL_PATTERNS = [
  /relation ".*"/i,
  /column ".*" (?:of|does not exist)/i,
  /violates.*constraint/i,
  /permission denied/i,
  /syntax error at or near/i,
  /operator does not exist/i,
  /new row for relation/i,
  /duplicate key value/i,
  /foreign key constraint/i,
  /null value in column/i,
  /function .* does not exist/i,
  /PGRST\d{3}/,                        // PostgREST error codes
  /\b(?:42501|42P01|23505|23502|23503|42703)\b/, // PostgreSQL SQLSTATE codes
  /Could not find the .* column/i,     // PostgREST column lookup errors
  /schema ".*" does not exist/i,
  /role ".*" does not exist/i,
  /JWSError|JWTExpired|JWTClaimsSetDecodeError/i,
];

/**
 * Returns a user-safe error message. Internal database errors are replaced
 * with a generic message; user-friendly messages pass through unchanged.
 */
export function sanitizeErrorForUser(error: unknown): string {
  if (!error) return GENERIC_ERROR;

  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : GENERIC_ERROR;

  if (!message) return GENERIC_ERROR;

  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(message)) {
      return GENERIC_ERROR;
    }
  }

  return message;
}
