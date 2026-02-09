/**
 * Coach Matching Utilities
 * 
 * This module provides helper functions for automatically matching clients
 * with coaches based on their goals, plan type, and coach availability.
 * 
 * The main function autoMatchCoachForClient can be called when:
 * - A client selects "auto" for coach_preference_type
 * - Admin needs to reassign a client to a new coach
 * - Coach capacity changes and clients need redistribution
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type CoachMatchInput = {
  planType: 'online' | 'hybrid' | 'in_person';
  goals: string[];  // selected areas of focus / goal tags
  serviceId?: string; // Optional: specific service ID for capacity check
};

export interface CoachCandidate {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  specializations: string[] | null;
  activeClientCount: number;
  maxClients: number;
  matchScore: number;
}

/**
 * Maps plan type to service name pattern for querying
 */
const PLAN_TYPE_TO_SERVICE_NAME: Record<string, string> = {
  'online': '1:1 Online',
  'hybrid': '1:1 Hybrid',
  'in_person': '1:1 In-Person',
};

/**
 * Calculates a match score between coach specializations and client goals
 * Higher scores indicate better matches.
 * Uses exact Set-based matching for standardized tags.
 */
export function calculateSpecializationMatchScore(
  coachSpecializations: string[] | null,
  clientGoals: string[]
): number {
  if (!coachSpecializations || coachSpecializations.length === 0 || clientGoals.length === 0) {
    return 0;
  }

  const normalizedSpecs = new Set(coachSpecializations.map(s => s.toLowerCase().trim()));
  return clientGoals.filter(g => normalizedSpecs.has(g.toLowerCase().trim())).length;
}

/**
 * Automatically matches a client with the best available coach
 * 
 * Algorithm:
 * 1. Query coaches that are active and support the plan type
 * 2. Filter to coaches with available capacity
 * 3. Score coaches based on specialization match with client goals
 * 4. Among top scorers, prefer coaches with fewer active clients (load balancing)
 * 5. Return the best match, or null if no coaches available
 * 
 * @param supabaseClient - Supabase client (should be service role for full access)
 * @param input - Client's plan type and goals
 * @returns Coach ID of the best match, or null if none available
 */
export async function autoMatchCoachForClient(
  supabaseClient: SupabaseClient,
  input: CoachMatchInput
): Promise<string | null> {
  const { planType, goals, serviceId } = input;
  
  if (import.meta.env.DEV) console.log('[CoachMatching] Starting auto-match for:', { planType, goals, serviceId });

  try {
    // Get the service ID if not provided
    let targetServiceId = serviceId;
    if (!targetServiceId) {
      const serviceName = PLAN_TYPE_TO_SERVICE_NAME[planType];
      if (!serviceName) {
        if (import.meta.env.DEV) console.error('[CoachMatching] Unknown plan type:', planType);
        return null;
      }

      const { data: serviceData, error: serviceError } = await supabaseClient
        .from('services')
        .select('id')
        .eq('name', serviceName)
        .maybeSingle();

      if (serviceError || !serviceData) {
        if (import.meta.env.DEV) console.error('[CoachMatching] Could not find service:', serviceName, serviceError);
        return null;
      }
      targetServiceId = serviceData.id;
    }

    // Get all active coaches with their service limits
    const { data: coaches, error: coachError } = await supabaseClient
      .from('coaches')
      .select(`
        id,
        user_id,
        first_name,
        last_name,
        specializations
      `)
      .eq('status', 'active');

    if (coachError || !coaches || coaches.length === 0) {
      if (import.meta.env.DEV) console.error('[CoachMatching] No active coaches found:', coachError);
      return null;
    }

    if (import.meta.env.DEV) console.log('[CoachMatching] Found', coaches.length, 'active coaches');

    // Get service limits for all coaches for this specific service
    const { data: serviceLimits, error: limitsError } = await supabaseClient
      .from('coach_service_limits')
      .select('coach_id, max_clients')
      .eq('service_id', targetServiceId);

    if (limitsError) {
      if (import.meta.env.DEV) console.error('[CoachMatching] Error fetching service limits:', limitsError);
    }

    // Create a map of coach_id to max_clients
    const limitsMap = new Map<string, number>();
    if (serviceLimits) {
      for (const limit of serviceLimits) {
        limitsMap.set(limit.coach_id, limit.max_clients);
      }
    }

    // Get active + pending client counts for each coach for this service
    // Must match server-side: count pending + active (real current load)
    const { data: subscriptions, error: subsError } = await supabaseClient
      .from('subscriptions')
      .select('coach_id')
      .eq('service_id', targetServiceId)
      .in('status', ['pending', 'active']);

    if (subsError) {
      if (import.meta.env.DEV) console.error('[CoachMatching] Error fetching subscriptions:', subsError);
    }

    // Count active clients per coach (by user_id)
    const clientCountMap = new Map<string, number>();
    if (subscriptions) {
      for (const sub of subscriptions) {
        if (sub.coach_id) {
          const currentCount = clientCountMap.get(sub.coach_id) || 0;
          clientCountMap.set(sub.coach_id, currentCount + 1);
        }
      }
    }

    // Build candidate list with scores
    const candidates: CoachCandidate[] = [];
    
    for (const coach of coaches) {
      const maxClients = limitsMap.get(coach.id);
      
      // Skip coaches without a limit set for this service (they don't offer it)
      if (maxClients === undefined || maxClients === 0) {
        if (import.meta.env.DEV) console.log('[CoachMatching] Skipping coach without capacity for service:', coach.first_name);
        continue;
      }

      const activeClientCount = clientCountMap.get(coach.user_id) || 0;
      
      // Skip coaches at capacity
      if (activeClientCount >= maxClients) {
        if (import.meta.env.DEV) console.log('[CoachMatching] Skipping coach at capacity:', coach.first_name, activeClientCount, '/', maxClients);
        continue;
      }

      const matchScore = calculateSpecializationMatchScore(coach.specializations, goals);
      
      candidates.push({
        id: coach.id,
        user_id: coach.user_id,
        first_name: coach.first_name,
        last_name: coach.last_name,
        specializations: coach.specializations,
        activeClientCount,
        maxClients,
        matchScore,
      });
    }

    if (candidates.length === 0) {
      if (import.meta.env.DEV) console.log('[CoachMatching] No available coaches with capacity');
      return null;
    }

    if (import.meta.env.DEV) console.log('[CoachMatching] Found', candidates.length, 'available coaches');

    // Sort candidates:
    // 1. Primary: Higher match score is better
    // 2. Secondary: Fewer active clients is better (load balancing)
    candidates.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return a.activeClientCount - b.activeClientCount;
    });

    const bestMatch = candidates[0];
    if (import.meta.env.DEV) console.log('[CoachMatching] Best match:', bestMatch.first_name, bestMatch.last_name,
      'Score:', bestMatch.matchScore, 'Clients:', bestMatch.activeClientCount);

    // Return the user_id (not coach.id) as that's what subscriptions reference
    return bestMatch.user_id;
  } catch (error) {
    if (import.meta.env.DEV) console.error('[CoachMatching] Unexpected error:', error);
    return null;
  }
}

/**
 * Validates that a specific coach can accept a new client
 * 
 * @param supabaseClient - Supabase client
 * @param coachId - The coach's ID (from coaches table)
 * @param serviceId - The service ID to check capacity for
 * @returns Object with validation result and coach user_id if valid
 */
export async function validateCoachSelection(
  supabaseClient: SupabaseClient,
  coachId: string,
  serviceId: string
): Promise<{ valid: boolean; coachUserId?: string; reason?: string }> {
  try {
    // Get coach info
    const { data: coach, error: coachError } = await supabaseClient
      .from('coaches')
      .select('id, user_id, first_name, status')
      .eq('id', coachId)
      .maybeSingle();

    if (coachError || !coach) {
      return { valid: false, reason: 'Coach not found' };
    }

    if (coach.status !== 'active') {
      return { valid: false, reason: 'Coach is not currently accepting clients' };
    }

    // Check service limit
    const { data: limit, error: limitError } = await supabaseClient
      .from('coach_service_limits')
      .select('max_clients')
      .eq('coach_id', coachId)
      .eq('service_id', serviceId)
      .maybeSingle();

    if (limitError || !limit || limit.max_clients === 0) {
      return { valid: false, reason: 'Coach does not offer this service' };
    }

    // Count current active + pending clients (matches server-side logic)
    const { count, error: countError } = await supabaseClient
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coach.user_id)
      .eq('service_id', serviceId)
      .in('status', ['pending', 'active']);

    if (countError) {
      if (import.meta.env.DEV) console.error('[CoachMatching] Error counting clients:', countError);
      return { valid: false, reason: 'Could not verify coach capacity' };
    }

    const activeCount = count || 0;
    if (activeCount >= limit.max_clients) {
      return { valid: false, reason: `Coach is at capacity (${activeCount}/${limit.max_clients} clients)` };
    }

    return { valid: true, coachUserId: coach.user_id };
  } catch (error) {
    if (import.meta.env.DEV) console.error('[CoachMatching] Validation error:', error);
    return { valid: false, reason: 'An error occurred while validating coach selection' };
  }
}
