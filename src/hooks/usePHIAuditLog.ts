import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PHIAccessAction = 
  | "view_medical_summary"
  | "view_medical_detail" 
  | "view_medical_flags"
  | "update_medical_data"
  | "view_client_submission"
  | "view_parq_responses";

interface LogPHIAccessParams {
  action: PHIAccessAction;
  targetUserId?: string;
  targetTable?: string;
  userRole: string;
}

/**
 * Hook for logging PHI access events for HIPAA compliance.
 * Logs only metadata - NO PHI content is stored.
 */
export function usePHIAuditLog() {
  const logAccess = useCallback(async ({
    action,
    targetUserId,
    targetTable,
    userRole,
  }: LogPHIAccessParams) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("[PHI Audit] Cannot log access - no authenticated user");
        return;
      }

      const { error } = await supabase
        .from("phi_access_log")
        .insert({
          user_id: user.id,
          user_role: userRole,
          action_type: action,
          target_user_id: targetUserId || null,
          target_table: targetTable || null,
          user_agent: navigator.userAgent,
        });

      if (error) {
        // Log error but don't block the user action
        console.error("[PHI Audit] Failed to log access:", error.message);
      }
    } catch (err) {
      // Non-blocking - audit log failures should not prevent user actions
      console.error("[PHI Audit] Error logging access:", err);
    }
  }, []);

  return { logAccess };
}

/**
 * Standalone function for logging PHI access (use in non-hook contexts)
 */
export async function logPHIAccess({
  action,
  targetUserId,
  targetTable,
  userRole,
}: LogPHIAccessParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("phi_access_log")
      .insert({
        user_id: user.id,
        user_role: userRole,
        action_type: action,
        target_user_id: targetUserId || null,
        target_table: targetTable || null,
        user_agent: navigator.userAgent,
      });
  } catch (err) {
    console.error("[PHI Audit] Error logging access:", err);
  }
}
