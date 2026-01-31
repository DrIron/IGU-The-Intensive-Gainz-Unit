import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "coach" | "client";

interface UserRoleState {
  isAdmin: boolean;
  isCoach: boolean;
  isClient: boolean;
  loading: boolean;
  userId: string | null;
}

/**
 * Hook to check current user's role for PHI/PII access control.
 * - Admins can see all data including decrypted PHI
 * - Coaches can only see public data (no email, phone, DOB, medical text)
 * - Clients can see their own data
 */
export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    isAdmin: false,
    isCoach: false,
    isClient: true,
    loading: true,
    userId: null,
  });

  useEffect(() => {
    let isMounted = true;

    const checkRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user || !isMounted) {
          setState(prev => ({ ...prev, loading: false }));
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roleList = roles?.map(r => r.role) || [];
        
        if (isMounted) {
          setState({
            isAdmin: roleList.includes("admin"),
            isCoach: roleList.includes("coach"),
            isClient: !roleList.includes("admin") && !roleList.includes("coach"),
            loading: false,
            userId: user.id,
          });
        }
      } catch (error) {
        console.error("Error checking user role:", error);
        if (isMounted) {
          setState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    checkRole();

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

/**
 * Check if current user can view PHI (Protected Health Information).
 * Only admins and the record owner can view PHI.
 */
export function canViewPHI(isAdmin: boolean, userId: string | null, recordOwnerId: string): boolean {
  return isAdmin || userId === recordOwnerId;
}

/**
 * Check if current user can edit medical data.
 * Only admins can edit medical data.
 */
export function canEditMedicalData(isAdmin: boolean): boolean {
  return isAdmin;
}
