import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceModules {
  includes_primary_coaching: boolean;
  includes_nutrition_support: boolean;
  includes_specialty_support: boolean;
  includes_physio_support: boolean;
}

export type CareTeamRole = 
  | "primary_coach"
  | "nutrition"
  | "lifestyle"
  | "bodybuilding"
  | "powerlifting"
  | "running"
  | "mobility"
  | "calisthenics"
  | "physiotherapist"
  | "other";

// Maps care_team_role values to module requirements
const ROLE_TO_MODULE_MAP: Record<CareTeamRole, keyof ServiceModules | null> = {
  primary_coach: "includes_primary_coaching",
  nutrition: "includes_nutrition_support",
  lifestyle: "includes_specialty_support",
  bodybuilding: "includes_specialty_support",
  powerlifting: "includes_specialty_support",
  running: "includes_specialty_support",
  mobility: "includes_specialty_support",
  calisthenics: "includes_specialty_support",
  physiotherapist: "includes_physio_support",
  other: null, // 'other' can always be added
};

/**
 * Check if a care-team role is allowed for a service based on its module flags
 */
export function isRoleAllowedForService(
  role: CareTeamRole,
  modules: ServiceModules | null
): boolean {
  if (!modules) return true; // If no modules data, allow by default

  const requiredModule = ROLE_TO_MODULE_MAP[role];
  
  if (requiredModule === null) return true; // 'other' role is always allowed
  
  return modules[requiredModule] ?? false;
}

/**
 * Get all allowed care-team roles for a service based on its module flags
 */
export function getAllowedRolesForService(modules: ServiceModules | null): CareTeamRole[] {
  const allRoles: CareTeamRole[] = [
    "primary_coach",
    "nutrition",
    "lifestyle",
    "bodybuilding",
    "powerlifting",
    "running",
    "mobility",
    "calisthenics",
    "physiotherapist",
    "other",
  ];

  return allRoles.filter((role) => isRoleAllowedForService(role, modules));
}

/**
 * Get disallowed roles that are currently assigned to a subscription
 * (for showing warnings about legacy assignments)
 */
export function getDisallowedAssignedRoles(
  assignedRoles: CareTeamRole[],
  modules: ServiceModules | null
): CareTeamRole[] {
  return assignedRoles.filter((role) => !isRoleAllowedForService(role, modules));
}

/**
 * Hook to fetch service module flags for a given service ID
 */
export function useServiceModules(serviceId: string | null) {
  const [modules, setModules] = useState<ServiceModules | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId) {
      setModules(null);
      return;
    }

    const fetchModules = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data, error: fetchError } = await supabase
          .from("services")
          .select(
            "includes_primary_coaching, includes_nutrition_support, includes_specialty_support, includes_physio_support"
          )
          .eq("id", serviceId)
          .single();

        if (fetchError) throw fetchError;

        setModules({
          includes_primary_coaching: data.includes_primary_coaching ?? false,
          includes_nutrition_support: data.includes_nutrition_support ?? false,
          includes_specialty_support: data.includes_specialty_support ?? false,
          includes_physio_support: data.includes_physio_support ?? false,
        });
      } catch (err: any) {
        console.error("Error fetching service modules:", err);
        setError(err.message);
        setModules(null);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [serviceId]);

  return { modules, loading, error };
}

/**
 * Hook to fetch service modules for a subscription's service
 */
export function useSubscriptionServiceModules(subscriptionId: string | null) {
  const [modules, setModules] = useState<ServiceModules | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subscriptionId) {
      setModules(null);
      setServiceId(null);
      return;
    }

    const fetchModules = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data, error: fetchError } = await supabase
          .from("subscriptions")
          .select(`
            service_id,
            services (
              includes_primary_coaching,
              includes_nutrition_support,
              includes_specialty_support,
              includes_physio_support
            )
          `)
          .eq("id", subscriptionId)
          .single();

        if (fetchError) throw fetchError;

        setServiceId(data.service_id);
        
        const service = data.services as any;
        if (service) {
          setModules({
            includes_primary_coaching: service.includes_primary_coaching ?? false,
            includes_nutrition_support: service.includes_nutrition_support ?? false,
            includes_specialty_support: service.includes_specialty_support ?? false,
            includes_physio_support: service.includes_physio_support ?? false,
          });
        }
      } catch (err: any) {
        console.error("Error fetching subscription service modules:", err);
        setError(err.message);
        setModules(null);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [subscriptionId]);

  return { modules, serviceId, loading, error };
}
