-- Program system unification — Phase 0: canonical schema (ADDITIVE).
-- See docs/PROGRAM_SYSTEM_UNIFICATION.md. Creates the one true plan model
-- alongside the existing muscle_program_templates / program_templates /
-- client_* tables. Nothing is dropped or rewritten here — later phases dual-
-- write, verify, then cut over. No functions/triggers in P0 (tables + RLS only).
--
-- Canonical hierarchy:
--   plan › plan_weeks (is_deload first-class) › plan_sessions › plan_slots
--   progression_rules  (reusable, copy-paste-able)
-- Client plan = thin assignment + override layer (no deep copy):
--   client_plan_assignment › client_plan_overrides

-- ---------------------------------------------------------------------------
-- progression_rules — reusable rule, referenced by slots. Unifies the board's
-- weekly-delta rules and exercise_prescriptions linear-progression into one.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.progression_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id  uuid NOT NULL,
  name            text,
  scope           text NOT NULL DEFAULT 'slot' CHECK (scope IN ('slot', 'session', 'plan')),
  rule_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progression_rules_owner ON public.progression_rules (owner_coach_id);

-- ---------------------------------------------------------------------------
-- plan — replaces muscle_program_templates + program_templates (one entity).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id           uuid NOT NULL,
  name                     text NOT NULL,
  description              text,
  kind                     text NOT NULL DEFAULT 'template' CHECK (kind IN ('template', 'client_frozen')),
  level                    text,
  visibility               text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'global')),
  tags                     text[] NOT NULL DEFAULT '{}',
  is_active                boolean NOT NULL DEFAULT true,
  -- Backfill audit link (P5): the muscle template this plan was promoted from.
  source_muscle_template_id uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_owner ON public.plan (owner_coach_id);
CREATE INDEX IF NOT EXISTS idx_plan_visibility ON public.plan (visibility) WHERE visibility = 'global';

-- ---------------------------------------------------------------------------
-- plan_weeks — materialized weeks (W1..WN). Deload is first-class here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_weeks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
  week_index        int NOT NULL CHECK (week_index >= 1),
  label             text,
  is_deload         boolean NOT NULL DEFAULT false,
  deload_preset_id  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, week_index)
);
CREATE INDEX IF NOT EXISTS idx_plan_weeks_plan ON public.plan_weeks (plan_id);

-- ---------------------------------------------------------------------------
-- plan_sessions — first-class session (Day > Session). plan_id denormalized
-- for simple RLS + querying.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
  plan_week_id   uuid NOT NULL REFERENCES public.plan_weeks (id) ON DELETE CASCADE,
  day_index      int NOT NULL CHECK (day_index BETWEEN 1 AND 7),
  name           text,
  activity_type  text NOT NULL DEFAULT 'strength'
                   CHECK (activity_type IN ('strength','cardio','hiit','yoga_mobility','recovery','sport_specific')),
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_sessions_plan ON public.plan_sessions (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_sessions_week ON public.plan_sessions (plan_week_id);

-- ---------------------------------------------------------------------------
-- plan_slots — an exercise or activity within a session. prescription_json
-- carries the unified prescription (sets/reps/tempo/rir/rpe/sets_json/columns).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_slots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             uuid NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
  plan_session_id     uuid NOT NULL REFERENCES public.plan_sessions (id) ON DELETE CASCADE,
  exercise_id         uuid REFERENCES public.exercise_library (id),
  activity_id         text,
  activity_name       text,
  section             text NOT NULL DEFAULT 'main' CHECK (section IN ('warmup','main','accessory','cooldown')),
  sort_order          int NOT NULL DEFAULT 0,
  prescription_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  progression_rule_id uuid REFERENCES public.progression_rules (id) ON DELETE SET NULL,
  manual_override     boolean NOT NULL DEFAULT false,
  instructions        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_slots_plan ON public.plan_slots (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_slots_session ON public.plan_slots (plan_session_id);

-- ---------------------------------------------------------------------------
-- client_plan_assignment — replaces client_programs. A client FOLLOWS a plan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_plan_assignment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  subscription_id  uuid REFERENCES public.subscriptions (id) ON DELETE SET NULL,
  plan_id          uuid NOT NULL REFERENCES public.plan (id),
  macrocycle_id    uuid REFERENCES public.macrocycles (id) ON DELETE SET NULL,
  primary_coach_id uuid NOT NULL,
  team_id          uuid REFERENCES public.coach_teams (id) ON DELETE SET NULL,
  start_date       date NOT NULL,
  status           public.client_program_status NOT NULL DEFAULT 'active',
  timezone         text NOT NULL DEFAULT 'UTC',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpa_client ON public.client_plan_assignment (client_id);
CREATE INDEX IF NOT EXISTS idx_cpa_coach ON public.client_plan_assignment (primary_coach_id);
CREATE INDEX IF NOT EXISTS idx_cpa_plan ON public.client_plan_assignment (plan_id);
CREATE INDEX IF NOT EXISTS idx_cpa_team ON public.client_plan_assignment (team_id);

-- ---------------------------------------------------------------------------
-- client_plan_overrides — per-client diffs against the followed plan. Editing
-- one client writes overrides here; the template plan is never touched/copied.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_plan_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES public.client_plan_assignment (id) ON DELETE CASCADE,
  target_type    text NOT NULL CHECK (target_type IN ('week','session','slot')),
  target_id      uuid NOT NULL,
  override_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  removed        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_cpo_assignment ON public.client_plan_overrides (assignment_id);

-- ===========================================================================
-- RLS
-- ===========================================================================
ALTER TABLE public.progression_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_weeks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_slots             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_plan_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_plan_overrides  ENABLE ROW LEVEL SECURITY;

-- progression_rules: owner coach (or admin) full access.
CREATE POLICY progression_rules_owner ON public.progression_rules
  FOR ALL
  USING (owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_coach_id = auth.uid() OR public.is_admin(auth.uid()));

-- plan: owner/admin full; coaches can read global templates.
CREATE POLICY plan_owner ON public.plan
  FOR ALL
  USING (owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_coach_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY plan_read_global ON public.plan
  FOR SELECT
  USING (visibility = 'global');

-- plan_weeks / plan_sessions / plan_slots: gate via the parent plan
-- (owner/admin write; global templates readable). plan_id is denormalized so
-- these are single-hop EXISTS checks.
CREATE POLICY plan_weeks_via_plan ON public.plan_weeks
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_weeks.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_weeks.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY plan_weeks_read_global ON public.plan_weeks
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_weeks.plan_id AND p.visibility = 'global'));

CREATE POLICY plan_sessions_via_plan ON public.plan_sessions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_sessions.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_sessions.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY plan_sessions_read_global ON public.plan_sessions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_sessions.plan_id AND p.visibility = 'global'));

CREATE POLICY plan_slots_via_plan ON public.plan_slots
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_slots.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_slots.plan_id
                 AND (p.owner_coach_id = auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY plan_slots_read_global ON public.plan_slots
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.plan p WHERE p.id = plan_slots.plan_id AND p.visibility = 'global'));

-- client_plan_assignment: coach/admin/team-coach manage; client reads own.
CREATE POLICY cpa_coach ON public.client_plan_assignment
  FOR ALL
  USING (
    primary_coach_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), client_id)
    OR EXISTS (SELECT 1 FROM public.coach_teams ct WHERE ct.id = client_plan_assignment.team_id AND ct.coach_id = auth.uid())
  )
  WITH CHECK (
    primary_coach_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), client_id)
    OR EXISTS (SELECT 1 FROM public.coach_teams ct WHERE ct.id = client_plan_assignment.team_id AND ct.coach_id = auth.uid())
  );
CREATE POLICY cpa_client_read ON public.client_plan_assignment
  FOR SELECT
  USING (client_id = auth.uid());

-- client_plan_overrides: gate via the parent assignment (same access set).
CREATE POLICY cpo_via_assignment ON public.client_plan_overrides
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.id = client_plan_overrides.assignment_id
      AND (a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.id = client_plan_overrides.assignment_id
      AND (a.primary_coach_id = auth.uid()
           OR public.is_admin(auth.uid())
           OR public.is_primary_coach_for_user(auth.uid(), a.client_id)
           OR EXISTS (SELECT 1 FROM public.coach_teams ct WHERE ct.id = a.team_id AND ct.coach_id = auth.uid()))
  ));
CREATE POLICY cpo_client_read ON public.client_plan_overrides
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.id = client_plan_overrides.assignment_id AND a.client_id = auth.uid()
  ));

-- ===========================================================================
-- Grants — authenticated (RLS scopes rows) + service_role; not anon.
-- ===========================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.progression_rules, public.plan, public.plan_weeks, public.plan_sessions,
  public.plan_slots, public.client_plan_assignment, public.client_plan_overrides
  TO authenticated;
GRANT ALL ON
  public.progression_rules, public.plan, public.plan_weeks, public.plan_sessions,
  public.plan_slots, public.client_plan_assignment, public.client_plan_overrides
  TO service_role;
