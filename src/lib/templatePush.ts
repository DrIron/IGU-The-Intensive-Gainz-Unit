/**
 * S4 selective sync-push — client helpers. See docs/PROGRAM_SYNC_S4_BUILD.md.
 *
 * fetchTemplateAssignees: "who follows this template" for the push dialog (Part B),
 * via separate queries (no nested PostgREST FK joins, per CLAUDE.md). Targets are
 * CLONE plan ids (unifies 1:1 + team).
 * pushTemplateToAssignees: thin wrapper over the push_template_to_assignees RPC (Part A).
 */
import { supabase } from "@/integrations/supabase/client";

export interface TemplateClientAssignee {
  kind: "client";
  clonePlanId: string;
  clientId: string;
  name: string;
  /** clone edited since it was created (board edit or a prior push) — a push overwrites un-completed sessions. */
  customized: boolean;
}
export interface TemplateTeamAssignee {
  kind: "team";
  clonePlanId: string;
  teamId: string;
  name: string;
  memberCount: number;
  customized: boolean;
}
export interface TemplateAssignees {
  clients: TemplateClientAssignee[];
  teams: TemplateTeamAssignee[];
}

export async function fetchTemplateAssignees(templatePlanId: string): Promise<TemplateAssignees> {
  // 1. Clones of this template.
  const { data: clones, error: cloneErr } = await supabase
    .from("plan")
    .select("id, created_at, updated_at")
    .eq("source_template_plan_id", templatePlanId)
    .eq("kind", "client_frozen");
  if (cloneErr) throw cloneErr;
  const cloneIds = (clones ?? []).map((c) => c.id);
  if (cloneIds.length === 0) return { clients: [], teams: [] };
  const customizedByClone = new Map(
    (clones ?? []).map((c) => [
      c.id,
      !!c.updated_at && !!c.created_at && new Date(c.updated_at).getTime() > new Date(c.created_at).getTime(),
    ]),
  );

  // 2. Active 1:1 assignments on those clones (team_id IS NULL).
  const { data: assigns, error: aErr } = await supabase
    .from("client_plan_assignment")
    .select("id, client_id, plan_id")
    .in("plan_id", cloneIds)
    .is("team_id", null)
    .eq("status", "active");
  if (aErr) throw aErr;

  // 3. Active teams bound to those clones.
  const { data: teams, error: tErr } = await supabase
    .from("coach_teams")
    .select("id, name, current_program_plan_id")
    .in("current_program_plan_id", cloneIds)
    .eq("is_active", true);
  if (tErr) throw tErr;

  // 4. Client display names (separate query — no FK join on the profiles view).
  const clientIds = (assigns ?? []).map((a) => a.client_id);
  const nameById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles_public")
      .select("id, first_name, display_name")
      .in("id", clientIds);
    for (const p of profs ?? []) nameById.set(p.id, p.display_name || p.first_name || "Client");
  }

  // 5. Team member counts (active/pending).
  const teamIds = (teams ?? []).map((t) => t.id);
  const countByTeam = new Map<string, number>();
  if (teamIds.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("team_id, status")
      .in("team_id", teamIds)
      .in("status", ["pending", "active"]);
    for (const s of subs ?? []) {
      if (s.team_id) countByTeam.set(s.team_id, (countByTeam.get(s.team_id) ?? 0) + 1);
    }
  }

  const clients: TemplateClientAssignee[] = (assigns ?? []).map((a) => ({
    kind: "client",
    clonePlanId: a.plan_id,
    clientId: a.client_id,
    name: nameById.get(a.client_id) ?? "Client",
    customized: customizedByClone.get(a.plan_id) ?? false,
  }));
  const teamList: TemplateTeamAssignee[] = (teams ?? [])
    .filter((t): t is typeof t & { current_program_plan_id: string } => !!t.current_program_plan_id)
    .map((t) => ({
      kind: "team",
      clonePlanId: t.current_program_plan_id,
      teamId: t.id,
      name: t.name,
      memberCount: countByTeam.get(t.id) ?? 0,
      customized: customizedByClone.get(t.current_program_plan_id) ?? false,
    }));

  return { clients, teams: teamList };
}

export interface PushTargetResult {
  plan_id: string;
  sessions_replaced: number;
  sessions_preserved: number;
  weeks_total: number;
  status: string;
}

export async function pushTemplateToAssignees(
  templatePlanId: string,
  targetClonePlanIds: string[],
): Promise<{ template_plan_id: string; targets: PushTargetResult[] }> {
  const { data, error } = await supabase.rpc("push_template_to_assignees", {
    p_template_plan_id: templatePlanId,
    p_target_plan_ids: targetClonePlanIds,
  });
  if (error) throw error;
  return data as unknown as { template_plan_id: string; targets: PushTargetResult[] };
}
