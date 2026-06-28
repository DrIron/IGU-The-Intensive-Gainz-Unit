/**
 * Lightweight client feature flags. Default OFF; flip per-browser via localStorage
 * (set `<key>` to "on"/"true"/"1") or globally via a Vite env var at build time.
 *
 * Program system unification P3: `canonical_session_read` gates WorkoutSessionV2's
 * canonical (plan_* + client_plan_overrides) read/log path. Legacy client_* remains the
 * default and authoritative path — this flag only enables the parity-test read.
 */

function readBool(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "on" || v === "true" || v === "1" || v === "yes";
}

/** localStorage key + matching Vite env var for a flag. */
const FLAGS = {
  canonical_session_read: {
    storageKey: "igu_ff_canonical_session_read",
    env: import.meta.env.VITE_FF_CANONICAL_SESSION_READ as string | undefined,
  },
  // P4 Editor v1: mount the planning board scoped to a client_plan_assignment in the
  // Workouts → Programs subtab (edits persist as client_plan_overrides). OFF until verified.
  client_program_editor: {
    storageKey: "igu_ff_client_program_editor",
    env: import.meta.env.VITE_FF_CLIENT_PROGRAM_EDITOR as string | undefined,
  },
  // Planning Board v2 visual layer: Calendar/Weeks toggle, inline session expansion, context
  // skins. OFF leaves the live prod template board byte-identical.
  board_v2: {
    storageKey: "igu_ff_board_v2",
    env: import.meta.env.VITE_FF_BOARD_V2 as string | undefined,
  },
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const def = FLAGS[flag];
  // Build-time env wins when set to a truthy value; otherwise per-browser localStorage.
  if (readBool(def.env)) return true;
  try {
    if (typeof localStorage !== "undefined") {
      return readBool(localStorage.getItem(def.storageKey));
    }
  } catch {
    // localStorage can throw in private mode / SSR — treat as OFF.
  }
  return false;
}

/** P3 convenience: is the canonical WorkoutSessionV2 read path enabled? */
export function isCanonicalSessionReadEnabled(): boolean {
  return isFeatureEnabled("canonical_session_read");
}

/** P4 Editor v1: is the canonical client program editor (board scoped to an assignment) enabled? */
export function isClientProgramEditorEnabled(): boolean {
  return isFeatureEnabled("client_program_editor");
}

/** Planning Board v2: Calendar/Weeks toggle, inline session expansion, context skins. */
export function isBoardV2Enabled(): boolean {
  return isFeatureEnabled("board_v2");
}
