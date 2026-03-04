/**
 * Shared utilities for checking email type status and loading custom templates.
 * Used by n8n-scheduled edge functions before sending emails.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Check if an email type is enabled.
 * Returns true if the row doesn't exist (backward compat -- safe before migration runs).
 */
export async function isEmailEnabled(
  supabase: SupabaseClient,
  emailTypeId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_types")
    .select("is_enabled")
    .eq("id", emailTypeId)
    .maybeSingle();

  if (error) {
    // Table might not exist yet -- fail open
    console.warn(`isEmailEnabled: error checking ${emailTypeId}:`, error.message);
    return true;
  }

  // No row = not registered yet, default to enabled
  if (!data) return true;

  return data.is_enabled;
}

/**
 * Load custom email template (subject + body sections) for an email type.
 * Returns null if no customization exists (use hardcoded defaults).
 */
export async function loadEmailTemplate(
  supabase: SupabaseClient,
  emailTypeId: string
): Promise<{ subject: string; bodySections: any[] } | null> {
  const { data, error } = await supabase
    .from("email_types")
    .select("subject_template, body_sections")
    .eq("id", emailTypeId)
    .maybeSingle();

  if (error || !data) return null;

  // Both must be set for a custom template
  if (!data.subject_template && !data.body_sections) return null;

  return {
    subject: data.subject_template || "",
    bodySections: data.body_sections || [],
  };
}
