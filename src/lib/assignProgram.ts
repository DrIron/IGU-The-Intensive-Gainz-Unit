/**
 * Shared program assignment logic.
 * Used by both AssignProgramDialog (1:1) and AssignTeamProgramDialog (team fan-out).
 */

import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";

export interface AssignProgramParams {
  coachUserId: string;
  clientUserId: string;
  subscriptionId: string;
  programTemplateId: string;
  startDate: Date;
  teamId?: string;
}

export interface AssignProgramResult {
  success: boolean;
  clientProgramId?: string;
  error?: string;
}

export async function assignProgramToClient(
  params: AssignProgramParams
): Promise<AssignProgramResult> {
  const { coachUserId, clientUserId, subscriptionId, programTemplateId, startDate, teamId } = params;

  try {
    // 1. Load program template with days + modules
    const { data: template, error: templateError } = await supabase
      .from("program_templates")
      .select(`
        *,
        program_template_days(
          id,
          day_index,
          day_title,
          day_modules(*)
        )
      `)
      .eq("id", programTemplateId)
      .single();

    if (templateError) throw templateError;
    if (!template) throw new Error("Program template not found");

    // 2. Create client_program
    const insertData: Record<string, any> = {
      user_id: clientUserId,
      subscription_id: subscriptionId,
      primary_coach_id: coachUserId,
      source_template_id: programTemplateId,
      start_date: format(startDate, "yyyy-MM-dd"),
      status: "active",
    };
    if (teamId) {
      insertData.team_id = teamId;
    }

    const { data: clientProgram, error: programError } = await supabase
      .from("client_programs")
      .insert(insertData)
      .select()
      .single();

    if (programError) throw programError;

    // 3. Fetch active care team members for this subscription
    const { data: careTeamMembers } = await supabase
      .from("care_team_assignments")
      .select("staff_user_id, specialty, active_from, active_until")
      .eq("subscription_id", subscriptionId)
      .in("lifecycle_status", ["active", "scheduled_end"]);

    // 4. Create client_program_days and client_day_modules for each template day
    const templateDays = template.program_template_days || [];

    for (let i = 0; i < templateDays.length; i++) {
      const templateDay = templateDays[i];
      const dayDate = addDays(startDate, templateDay.day_index - 1);
      const dayDateStr = format(dayDate, "yyyy-MM-dd");

      // Create client_program_day
      const { data: clientDay, error: dayError } = await supabase
        .from("client_program_days")
        .insert({
          client_program_id: clientProgram.id,
          day_index: templateDay.day_index,
          title: templateDay.day_title,
          date: dayDateStr,
        })
        .select()
        .single();

      if (dayError) throw dayError;

      // Only create client_day_modules for PUBLISHED modules
      const publishedModules = (templateDay.day_modules || []).filter(
        (mod: any) => mod.status === "published"
      );

      let maxSortOrder = 0;

      for (const templateModule of publishedModules) {
        // Get the exercises for this module
        const { data: exercises } = await supabase
          .from("module_exercises")
          .select(`
            *,
            exercise_prescriptions(*)
          `)
          .eq("day_module_id", templateModule.id);

        // Create client_day_module
        const { data: clientModule, error: moduleError } = await supabase
          .from("client_day_modules")
          .insert({
            client_program_day_id: clientDay.id,
            source_day_module_id: templateModule.id,
            module_owner_coach_id: templateModule.module_owner_coach_id,
            module_type: templateModule.module_type,
            title: templateModule.title,
            sort_order: templateModule.sort_order,
            status: "scheduled",
          })
          .select()
          .single();

        if (moduleError) throw moduleError;
        maxSortOrder = Math.max(maxSortOrder, templateModule.sort_order);

        // Copy exercises with prescription snapshots
        if (exercises && exercises.length > 0) {
          for (const exercise of exercises) {
            const prescription = exercise.exercise_prescriptions?.[0];

            await supabase.from("client_module_exercises").insert({
              client_day_module_id: clientModule.id,
              exercise_id: exercise.exercise_id,
              section: exercise.section,
              sort_order: exercise.sort_order,
              instructions: exercise.instructions,
              prescription_snapshot_json: prescription
                ? {
                    set_count: prescription.set_count,
                    rep_range_min: prescription.rep_range_min,
                    rep_range_max: prescription.rep_range_max,
                    tempo: prescription.tempo,
                    rest_seconds: prescription.rest_seconds,
                    intensity_type: prescription.intensity_type,
                    intensity_value: prescription.intensity_value,
                    warmup_sets_json: prescription.warmup_sets_json,
                    custom_fields_json: prescription.custom_fields_json,
                    progression_notes: prescription.progression_notes,
                    sets_json: (prescription as any).sets_json ?? null,
                    linear_progression_enabled: (prescription as any).linear_progression_enabled ?? false,
                    progression_config: (prescription as any).progression_config ?? null,
                  }
                : {},
            });
          }
        }

        // Create module thread for communication
        await supabase.from("module_threads").insert({
          client_day_module_id: clientModule.id,
        });
      }

      // Auto-create modules for active care team specialists for this day
      if (careTeamMembers && careTeamMembers.length > 0) {
        for (const member of careTeamMembers) {
          const activeFrom = new Date(member.active_from);
          const activeUntil = member.active_until ? new Date(member.active_until) : null;

          // Check if this day falls within the specialist's active period
          if (dayDate >= activeFrom && (!activeUntil || dayDate <= activeUntil)) {
            // Check if module already created (from template)
            const existingModule = publishedModules.find(
              (m: any) =>
                m.module_owner_coach_id === member.staff_user_id &&
                m.module_type === member.specialty
            );

            if (!existingModule) {
              maxSortOrder++;
              const moduleType = member.specialty;
              const title =
                moduleType.charAt(0).toUpperCase() + moduleType.slice(1) + " Session";

              await supabase.from("client_day_modules").insert({
                client_program_day_id: clientDay.id,
                module_owner_coach_id: member.staff_user_id,
                module_type: moduleType,
                title: title,
                sort_order: maxSortOrder,
                status: "scheduled",
              });
            }
          }
        }
      }
    }

    return { success: true, clientProgramId: clientProgram.id };
  } catch (error: any) {
    return { success: false, error: error?.message || "Unknown error" };
  }
}
