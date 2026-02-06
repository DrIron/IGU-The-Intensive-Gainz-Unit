import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NutritionPermissions, NutritionRole } from "@/types/nutrition-phase22";

interface UseNutritionPermissionsProps {
  clientUserId: string;
}

/**
 * Hook to check nutrition editing permissions.
 *
 * Permission hierarchy:
 * 1. Admin - always can edit
 * 2. Dietitian (assigned to client) - can edit
 * 3. Coach (primary) - can edit ONLY if no dietitian assigned
 * 4. Self (client) - can log own data
 * 5. None - no access
 *
 * Uses the can_edit_nutrition(actor_uid, client_uid) RPC function.
 */
export function useNutritionPermissions({ clientUserId }: UseNutritionPermissionsProps): NutritionPermissions {
  const [permissions, setPermissions] = useState<NutritionPermissions>({
    canEdit: false,
    isLoading: true,
    clientHasDietitian: false,
    currentUserRole: 'none',
  });

  const hasFetched = useRef(false);

  const checkPermissions = useCallback(async () => {
    if (!clientUserId) {
      setPermissions({
        canEdit: false,
        isLoading: false,
        clientHasDietitian: false,
        currentUserRole: 'none',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions({
          canEdit: false,
          isLoading: false,
          clientHasDietitian: false,
          currentUserRole: 'none',
        });
        return;
      }

      // Check if editing self
      const isSelf = user.id === clientUserId;

      // Check user roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const roles = rolesData?.map(r => r.role) || [];
      const isAdmin = roles.includes('admin');
      const isCoach = roles.includes('coach');
      const isDietitian = roles.includes('dietitian');

      // Check if client has a dietitian assigned
      const { data: hasDietitianData } = await supabase
        .rpc('client_has_dietitian', { p_client_id: clientUserId });

      const clientHasDietitian = !!hasDietitianData;

      // Determine current user's role relative to this client
      let currentUserRole: NutritionRole = 'none';

      if (isAdmin) {
        currentUserRole = 'dietitian'; // Admins have full access
      } else if (isDietitian) {
        // Check if this dietitian is assigned to this client
        const { data: assignmentData } = await supabase
          .from('care_team_assignments')
          .select('id')
          .eq('staff_user_id', user.id)
          .eq('client_id', clientUserId)
          .eq('specialty', 'dietitian')
          .eq('lifecycle_status', 'active')
          .maybeSingle();

        if (assignmentData) {
          currentUserRole = 'dietitian';
        }
      } else if (isCoach) {
        // Check if this coach is primary for this client
        const { data: subscriptionData } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', clientUserId)
          .eq('coach_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscriptionData) {
          currentUserRole = 'coach';
        }
      } else if (isSelf) {
        currentUserRole = 'self';
      }

      // Call the RPC function to determine edit permission
      const { data: canEditData } = await supabase
        .rpc('can_edit_nutrition', {
          p_actor_id: user.id,
          p_client_id: clientUserId
        });

      // Determine final canEdit value
      // Admin always can edit
      // Dietitian can edit if assigned
      // Coach can edit if no dietitian is assigned
      // Self can log own data (limited edit)
      let canEdit = !!canEditData;

      // If coach but client has dietitian, coach is read-only
      if (currentUserRole === 'coach' && clientHasDietitian) {
        canEdit = false;
      }

      setPermissions({
        canEdit,
        isLoading: false,
        clientHasDietitian,
        currentUserRole,
      });
    } catch (error) {
      console.error('Error checking nutrition permissions:', error);
      setPermissions({
        canEdit: false,
        isLoading: false,
        clientHasDietitian: false,
        currentUserRole: 'none',
      });
    }
  }, [clientUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    checkPermissions();
  }, [checkPermissions]);

  return permissions;
}
