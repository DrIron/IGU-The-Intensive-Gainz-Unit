/**
 * UTM Parameter Tracking Utility
 *
 * Captures UTM parameters from the URL and stores them in sessionStorage
 * for later use when creating leads or tracking conversions.
 */

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type UTMParam = (typeof UTM_PARAMS)[number];

export interface UTMParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

/**
 * Captures UTM parameters from the current URL and stores them in sessionStorage.
 * Call this on app mount to capture incoming traffic sources.
 */
export function captureUTMParams(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  UTM_PARAMS.forEach((key) => {
    const value = params.get(key);
    if (value) {
      sessionStorage.setItem(key, value);
    }
  });
}

/**
 * Retrieves stored UTM parameters from sessionStorage.
 * Returns an object with all UTM parameters (null if not set).
 */
export function getUTMParams(): UTMParams {
  if (typeof window === "undefined") {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    };
  }

  return {
    utm_source: sessionStorage.getItem("utm_source"),
    utm_medium: sessionStorage.getItem("utm_medium"),
    utm_campaign: sessionStorage.getItem("utm_campaign"),
    utm_content: sessionStorage.getItem("utm_content"),
    utm_term: sessionStorage.getItem("utm_term"),
  };
}

/**
 * Clears all stored UTM parameters from sessionStorage.
 * Call this after a successful conversion to reset tracking.
 */
export function clearUTMParams(): void {
  if (typeof window === "undefined") return;

  UTM_PARAMS.forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

/**
 * Checks if any UTM parameters are currently stored.
 */
export function hasUTMParams(): boolean {
  const params = getUTMParams();
  return Object.values(params).some((value) => value !== null);
}
