import { useReducer, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { captureException } from "@/lib/errorLogging";
import { withTimeout } from "@/lib/withTimeout";
import type { Json } from "@/integrations/supabase/types";
import type { MusclePlanState, MuscleSlotData, SlotExercise, ActivityType, WeekData, SessionData } from "@/types/muscle-builder";
import { ACTIVITY_MAP, migrateSlotsToSessions } from "@/types/muscle-builder";
import type { SetPrescription } from "@/types/workout-builder";
import { resolveSlotForWeek, type WeeklyDeltaRule, type DeltaTarget } from "@/components/coach/programs/muscle-builder/weeklyDeltaEngine";
import { findDeloadPreset } from "@/components/coach/programs/muscle-builder/deloadPresets";

const DEFAULT_GLOBAL_CLIENT_INPUTS = ['performed_weight', 'performed_reps', 'performed_rpe'];
const DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS = ['rep_range', 'tempo', 'rir', 'rpe', 'rest'];

// ============================================================
// Actions
// ============================================================

type Action =
  | { type: 'LOAD_TEMPLATE'; payload: { name: string; description: string; weeks: WeekData[]; templateId: string; globalClientInputs?: string[]; globalPrescriptionColumns?: string[] } }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SELECT_DAY'; dayIndex: number }
  | { type: 'SELECT_WEEK'; weekIndex: number }
  | { type: 'ADD_WEEK' }
  | { type: 'ADD_WEEK_WITH_RULES' }
  | { type: 'ADD_WEEK_BLANK' }
  | { type: 'REMOVE_WEEK'; weekIndex: number }
  | { type: 'DUPLICATE_WEEK'; weekIndex: number }
  | { type: 'SET_SLOT_DELTA_RULES'; slotId: string; rules: WeeklyDeltaRule[] }
  | { type: 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS'; slotId?: string }
  | { type: 'MARK_FIELD_MANUAL_OVERRIDE'; slotId: string; field: DeltaTarget }
  | { type: 'CLEAR_FIELD_MANUAL_OVERRIDE'; slotId: string; field: DeltaTarget }
  | { type: 'SET_WEEK_LABEL'; weekIndex: number; label: string }
  | { type: 'TOGGLE_DELOAD'; weekIndex: number }
  | { type: 'APPLY_DELOAD'; weekIndex: number; baseContent: 'clone' | 'fresh' | 'keep'; sourceWeekIndex?: number; presetId: string | null }
  | { type: 'APPLY_SLOT_TO_REMAINING'; slotId: string; fields: Partial<MuscleSlotData> }
  | { type: 'ADD_MUSCLE'; dayIndex: number; muscleId: string; sets?: number; sessionId?: string }
  | { type: 'REMOVE_MUSCLE'; slotId: string }
  | { type: 'ADD_SESSION'; dayIndex: number; sessionType: ActivityType; name?: string }
  | { type: 'REMOVE_SESSION'; sessionId: string }
  | { type: 'RENAME_SESSION'; sessionId: string; name: string }
  | { type: 'SET_SESSION_TYPE'; sessionId: string; sessionType: ActivityType }
  | { type: 'REORDER_SESSION'; dayIndex: number; fromIndex: number; toIndex: number }
  | { type: 'DUPLICATE_SESSION_TO_DAY'; sessionId: string; toDayIndex: number }
  | { type: 'SET_SETS'; slotId: string; sets: number }
  | { type: 'SET_REPS'; slotId: string; repMin: number; repMax: number }
  | { type: 'SET_SLOT_DETAILS'; slotId: string; sets?: number; repMin?: number; repMax?: number; tempo?: string | undefined; rir?: number | undefined; rpe?: number | undefined }
  | { type: 'SET_ALL_SETS_FOR_MUSCLE'; muscleId: string; sets: number }
  | { type: 'REORDER'; dayIndex: number; fromIndex: number; toIndex: number }
  | { type: 'REORDER_IN_SESSION'; sessionId: string; fromIndex: number; toIndex: number }
  | { type: 'MOVE_MUSCLE'; slotId: string; toDay: number; toIndex: number }
  | { type: 'MOVE_SLOT_TO_SESSION'; slotId: string; toSessionId: string; toIndex: number }
  | { type: 'PASTE_DAY'; fromDayIndex: number; toDayIndex: number }
  | { type: 'LOAD_PRESET'; slots: MuscleSlotData[]; name?: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'MARK_SAVED'; templateId: string }
  | { type: 'SAVING' }
  | { type: 'SAVE_ERROR' }
  | { type: 'SET_EXERCISE'; slotId: string; exercise: SlotExercise }
  | { type: 'CLEAR_EXERCISE'; slotId: string }
  | { type: 'ADD_REPLACEMENT'; slotId: string; exercise: SlotExercise }
  | { type: 'ADD_REPLACEMENTS'; slotId: string; exercises: SlotExercise[] }
  | { type: 'REMOVE_REPLACEMENT'; slotId: string; replacementIndex: number }
  | { type: 'TOGGLE_PER_SET'; slotId: string }
  | { type: 'UPDATE_SET_DETAIL'; slotId: string; setIndex: number; field: keyof SetPrescription; value: number | string | undefined }
  | { type: 'DELETE_SET_AT_INDEX'; slotId: string; setIndex: number }
  | { type: 'APPLY_SET_TO_REMAINING'; slotId: string; fromIndex: number }
  | { type: 'SET_SLOT_COLUMNS'; slotId: string; columns: string[] }
  | { type: 'SET_EXERCISE_INSTRUCTIONS'; slotId: string; instructions: string }
  | { type: 'SET_GLOBAL_CLIENT_INPUTS'; columns: string[] }
  | { type: 'SET_SLOT_CLIENT_INPUTS'; slotId: string; columns: string[] | undefined }
  | { type: 'ADD_ACTIVITY'; dayIndex: number; activityId: string; activityType: ActivityType; sessionId?: string }
  | { type: 'ADD_EXERCISE_TO_SESSION'; dayIndex: number; sessionId: string; exercise: SlotExercise; activityType: ActivityType }
  | { type: 'SET_ACTIVITY_DETAILS'; slotId: string; details: Partial<Pick<MuscleSlotData, 'duration' | 'distance' | 'targetHrZone' | 'pace' | 'rounds' | 'workSeconds' | 'restSeconds' | 'difficulty' | 'activityNotes'>> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ============================================================
// Helpers
// ============================================================

const EMPTY_WEEK: WeekData = { slots: [], sessions: [] };

const initialState: MusclePlanState = {
  templateId: null,
  name: 'Untitled Muscle Plan',
  description: '',
  weeks: [{ ...EMPTY_WEEK }],
  currentWeekIndex: 0,
  selectedDayIndex: 1,
  isDirty: false,
  isSaving: false,
  globalClientInputs: DEFAULT_GLOBAL_CLIENT_INPUTS,
  globalPrescriptionColumns: DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS,
};

function getCurrentSlots(state: MusclePlanState): MuscleSlotData[] {
  return state.weeks[state.currentWeekIndex]?.slots ?? [];
}

function getCurrentSessions(state: MusclePlanState): SessionData[] {
  return state.weeks[state.currentWeekIndex]?.sessions ?? [];
}

function withUpdatedCurrentWeek(state: MusclePlanState, updater: (slots: MuscleSlotData[]) => MuscleSlotData[]): MusclePlanState {
  const weeks = state.weeks.map((w, i) =>
    i === state.currentWeekIndex ? { ...w, slots: updater(w.slots) } : w
  );
  return { ...state, weeks, isDirty: true };
}

/** Update both slots and sessions arrays in the current week atomically. */
function withUpdatedCurrentWeekFull(
  state: MusclePlanState,
  updater: (slots: MuscleSlotData[], sessions: SessionData[]) => { slots: MuscleSlotData[]; sessions: SessionData[] },
): MusclePlanState {
  const weeks = state.weeks.map((w, i) => {
    if (i !== state.currentWeekIndex) return w;
    const result = updater(w.slots, w.sessions ?? []);
    return { ...w, slots: result.slots, sessions: result.sessions };
  });
  return { ...state, weeks, isDirty: true };
}

/**
 * Find or create a session for (dayIndex, type). If a matching session
 * already exists on the day, return it; otherwise append a new one.
 * Used by ADD_MUSCLE/ADD_ACTIVITY when no explicit sessionId is provided
 * (e.g. legacy drag-drop onto the day body).
 */
function ensureSessionForDay(
  sessions: SessionData[],
  dayIndex: number,
  type: ActivityType,
): { sessions: SessionData[]; sessionId: string } {
  const existing = sessions.find(s => s.dayIndex === dayIndex && s.type === type);
  if (existing) return { sessions, sessionId: existing.id };
  const sameDayCount = sessions.filter(s => s.dayIndex === dayIndex).length;
  const newSession: SessionData = {
    id: crypto.randomUUID(),
    dayIndex,
    type,
    sortOrder: sameDayCount,
  };
  return { sessions: [...sessions, newSession], sessionId: newSession.id };
}

function getMaxSortOrder(slots: MuscleSlotData[], dayIndex: number): number {
  const daySlots = slots.filter(s => s.dayIndex === dayIndex);
  if (daySlots.length === 0) return -1;
  return Math.max(...daySlots.map(s => s.sortOrder));
}

function createSetsDetailFromFlat(slot: MuscleSlotData): SetPrescription[] {
  return Array.from({ length: slot.sets }, (_, i) => ({
    set_number: i + 1,
    rep_range_min: slot.repMin ?? 8,
    rep_range_max: slot.repMax ?? 12,
    ...(slot.tempo ? { tempo: slot.tempo } : {}),
    ...(slot.rir != null ? { rir: slot.rir } : {}),
    ...(slot.rpe != null ? { rpe: slot.rpe } : {}),
    rest_seconds: 90,
  }));
}

function syncSetsDetailLength(setsDetail: SetPrescription[], newCount: number): SetPrescription[] {
  if (setsDetail.length === newCount) return setsDetail;
  if (newCount < setsDetail.length) return setsDetail.slice(0, newCount);
  const lastRow = setsDetail[setsDetail.length - 1] || { set_number: 0, rest_seconds: 90 };
  const newRows: SetPrescription[] = [];
  for (let i = setsDetail.length; i < newCount; i++) {
    newRows.push({ ...lastRow, set_number: i + 1 });
  }
  return [...setsDetail, ...newRows];
}

function hydrateSlotIds(slots: MuscleSlotData[]): MuscleSlotData[] {
  return slots.map(s => ({
    ...s,
    id: s.id || crypto.randomUUID(),
    repMin: s.repMin ?? 8,
    repMax: s.repMax ?? 12,
  }));
}

/**
 * Tag a W2+ slot's manualOverrides with the touched DeltaTargets — but only
 * when the W1 sibling actually has a rule for that field. On W1 (or when no
 * rule exists), no-op. This is what protects a coach's hand-edits from being
 * clobbered by RECOMPUTE_DOWNSTREAM_FROM_DELTAS.
 *
 * Matches the W1 sibling by (dayIndex, sortOrder) — same convention as
 * APPLY_SLOT_TO_REMAINING and ADD_WEEK_WITH_RULES.
 */
function tagSlotOverrides(
  state: MusclePlanState,
  slotId: string,
  targets: DeltaTarget[],
): MusclePlanState {
  if (state.currentWeekIndex === 0 || targets.length === 0) return state;
  const w1 = state.weeks[0];
  if (!w1) return state;
  const currentWeek = state.weeks[state.currentWeekIndex];
  const currentSlot = currentWeek?.slots.find(s => s.id === slotId);
  if (!currentSlot) return state;
  const w1Sibling = w1.slots.find(
    s => s.dayIndex === currentSlot.dayIndex && s.sortOrder === currentSlot.sortOrder,
  );
  if (!w1Sibling?.deltaRules?.length) return state;
  const ruled = new Set(w1Sibling.deltaRules.map(r => r.target));
  const newOverrides = targets.filter(t => ruled.has(t));
  if (newOverrides.length === 0) return state;
  return {
    ...state,
    weeks: state.weeks.map((w, wi) => {
      if (wi !== state.currentWeekIndex) return w;
      return {
        ...w,
        slots: w.slots.map(s =>
          s.id === slotId
            ? {
                ...s,
                manualOverrides: Array.from(new Set([...(s.manualOverrides ?? []), ...newOverrides])),
              }
            : s,
        ),
      };
    }),
  };
}

/**
 * Re-derive W2+ slot values from the W1 sibling's deltaRules. Optionally
 * scoped to a single slot's lineage via targetSlotId (matched against the
 * W1 slot's id). Manual overrides on W2+ are preserved — the engine skips
 * overridden targets.
 *
 * Pure function. Used by both RECOMPUTE_DOWNSTREAM_FROM_DELTAS (coach hits
 * the button) and SET_SLOT_DELTA_RULES (auto-recompute on first-rule add so
 * pre-existing W2+ values flip from stale-base to rule-derived without the
 * coach having to know about the button).
 */
export function recomputeDownstreamWeeks(
  state: MusclePlanState,
  targetSlotId?: string,
): MusclePlanState {
  const w1 = state.weeks[0];
  if (!w1) return state;
  // Phase 2: the chaining engine needs the full program length + per-week
  // deload flags to walk the trajectory. Built once and passed to every
  // resolveSlotForWeek call so multi-rule targets chain (never the
  // first-rule-only fallback).
  const ctx = {
    totalWeeks: state.weeks.length,
    isDeloadByWeek: state.weeks.map(w => !!w.isDeload),
  };
  const updatedWeeks = state.weeks.map((week, wi) => {
    if (wi === 0) return week;
    const isDeload = !!week.isDeload;
    const updatedSlots = week.slots.map(weekSlot => {
      const w1Sibling = w1.slots.find(
        s => s.dayIndex === weekSlot.dayIndex && s.sortOrder === weekSlot.sortOrder,
      );
      if (!w1Sibling?.deltaRules?.length) return weekSlot;
      if (targetSlotId && w1Sibling.id !== targetSlotId) return weekSlot;
      const overrides = weekSlot.manualOverrides ?? [];
      const { slot: resolved, derivedFields } = resolveSlotForWeek(
        w1Sibling,
        w1Sibling.deltaRules,
        wi,
        isDeload,
        overrides,
        ctx,
      );
      if (derivedFields.length === 0) return weekSlot;
      // Targets whose W1 rule carries a per-set scope also wrote to setsDetail,
      // so their resolved setsDetail must flow through (Phase 1d). Slot-level
      // rules leave the week's own setsDetail untouched.
      const perSetDerived = new Set(
        w1Sibling.deltaRules
          .filter((r) => 'scope' in r && r.scope !== undefined)
          .map((r) => r.target),
      );
      const merged: MuscleSlotData = { ...weekSlot };
      for (const target of derivedFields) {
        switch (target) {
          case 'sets':
            merged.sets = resolved.sets;
            merged.setsDetail = resolved.setsDetail;
            break;
          case 'repMin':
            merged.repMin = resolved.repMin;
            if (perSetDerived.has('repMin')) merged.setsDetail = resolved.setsDetail;
            break;
          case 'repMax':
            merged.repMax = resolved.repMax;
            if (perSetDerived.has('repMax')) merged.setsDetail = resolved.setsDetail;
            break;
          case 'tempo':
            merged.tempo = resolved.tempo;
            if (perSetDerived.has('tempo')) merged.setsDetail = resolved.setsDetail;
            break;
          case 'rir':
            merged.rir = resolved.rir;
            merged.setsDetail = resolved.setsDetail;
            break;
          case 'rpe':
            merged.rpe = resolved.rpe;
            merged.setsDetail = resolved.setsDetail;
            break;
          case 'instructions':
            if (resolved.exercise && merged.exercise) {
              merged.exercise = {
                ...merged.exercise,
                instructions: resolved.exercise.instructions,
              };
            }
            if (perSetDerived.has('instructions')) merged.setsDetail = resolved.setsDetail;
            break;
        }
      }
      return merged;
    });
    return { ...week, slots: updatedSlots };
  });
  return { ...state, weeks: updatedWeeks, isDirty: true };
}

function deepCloneWeek(week: WeekData): WeekData {
  // Regenerate session ids AND remap slot.sessionId to the new session ids
  // so cloned weeks don't share session identity with their source.
  const sessionIdRemap = new Map<string, string>();
  const newSessions: SessionData[] = (week.sessions ?? []).map(s => {
    const newId = crypto.randomUUID();
    sessionIdRemap.set(s.id, newId);
    return { ...s, id: newId };
  });
  return {
    ...week,
    sessions: newSessions,
    slots: week.slots.map(s => ({
      ...s,
      id: crypto.randomUUID(),
      sessionId: s.sessionId ? sessionIdRemap.get(s.sessionId) ?? s.sessionId : undefined,
      exercise: s.exercise ? { ...s.exercise } : undefined,
      replacements: s.replacements ? s.replacements.map(r => ({ ...r })) : undefined,
      setsDetail: s.setsDetail ? s.setsDetail.map(sd => ({ ...sd })) : undefined,
    })),
  };
}

// ============================================================
// Reducer
// ============================================================

function reducer(state: MusclePlanState, action: Action): MusclePlanState {
  const slots = getCurrentSlots(state);

  switch (action.type) {
    case 'LOAD_TEMPLATE':
      return {
        ...state,
        templateId: action.payload.templateId,
        name: action.payload.name,
        description: action.payload.description,
        // Hydrate slot ids, then migrate into session-aware shape. Legacy plans
        // (no sessions + no sessionId) collapse into one auto-session per
        // (dayIndex, activityType). New plans with sessions preserved pass through.
        weeks: action.payload.weeks.map(w => {
          const hydrated = hydrateSlotIds(w.slots);
          const migrated = migrateSlotsToSessions(hydrated, w.sessions);
          return { ...w, slots: migrated.slots, sessions: migrated.sessions };
        }),
        currentWeekIndex: 0,
        globalClientInputs: action.payload.globalClientInputs || DEFAULT_GLOBAL_CLIENT_INPUTS,
        globalPrescriptionColumns: action.payload.globalPrescriptionColumns || DEFAULT_GLOBAL_PRESCRIPTION_COLUMNS,
        isDirty: false,
        isSaving: false,
      };

    case 'SET_NAME':
      return { ...state, name: action.name, isDirty: true };

    case 'SET_DESCRIPTION':
      return { ...state, description: action.description, isDirty: true };

    case 'SELECT_DAY':
      return { ...state, selectedDayIndex: action.dayIndex };

    case 'SELECT_WEEK':
      return { ...state, currentWeekIndex: Math.min(action.weekIndex, state.weeks.length - 1) };

    // ---- Week management ----

    case 'ADD_WEEK': {
      const lastWeek = state.weeks[state.weeks.length - 1] || EMPTY_WEEK;
      const newWeek = deepCloneWeek(lastWeek);
      return { ...state, weeks: [...state.weeks, newWeek], currentWeekIndex: state.weeks.length, isDirty: true };
    }

    case 'ADD_WEEK_WITH_RULES': {
      // Mode (a) of the 3-mode Add Week menu: clone last week, then run every
      // W1 slot's deltaRules against its W1 base and overwrite the resolved
      // fields on the cloned slot. Non-rule fields (exercise assignment,
      // session structure, replacements) flow through from the cloned week
      // unchanged. New week starts with empty manualOverrides — those are
      // strictly week-local.
      const w1 = state.weeks[0];
      const lastWeek = state.weeks[state.weeks.length - 1] || EMPTY_WEEK;
      const cloned = deepCloneWeek(lastWeek);
      const newWeekOffset = state.weeks.length;       // 0-indexed: W2 = 1, W3 = 2, ...
      const isDeload = !!cloned.isDeload;
      // ctx spans the program INCLUDING the week being added, so the chaining
      // walker (multi-rule targets) can resolve the new week's offset.
      const addWeekCtx = {
        totalWeeks: state.weeks.length + 1,
        isDeloadByWeek: [...state.weeks.map(w => !!w.isDeload), isDeload],
      };

      const updatedSlots = cloned.slots.map(clonedSlot => {
        const w1Slot = w1?.slots.find(
          s => s.dayIndex === clonedSlot.dayIndex && s.sortOrder === clonedSlot.sortOrder
        );
        const stripped: MuscleSlotData = { ...clonedSlot, manualOverrides: undefined };
        if (!w1Slot || !w1Slot.deltaRules || w1Slot.deltaRules.length === 0) {
          return stripped;
        }
        // Run engine against the W1 base (NOT the cloned values). Math always
        // anchors to W1; D11 / D14 / D6 confirm this is the intended model.
        const { slot: resolved } = resolveSlotForWeek(
          w1Slot,
          w1Slot.deltaRules,
          newWeekOffset,
          isDeload,
          [], // new week, no overrides yet
          addWeekCtx,
        );
        // Merge: cloned-slot identity (id, sessionId, dayIndex, sortOrder,
        // muscleId, replacements) + resolved prescription fields.
        return {
          ...stripped,
          sets: resolved.sets,
          repMin: resolved.repMin,
          repMax: resolved.repMax,
          tempo: resolved.tempo,
          rir: resolved.rir,
          rpe: resolved.rpe,
          setsDetail: resolved.setsDetail,
          exercise: resolved.exercise ?? stripped.exercise,
        };
      });

      return {
        ...state,
        weeks: [...state.weeks, { ...cloned, slots: updatedSlots }],
        currentWeekIndex: state.weeks.length,
        isDirty: true,
      };
    }

    case 'ADD_WEEK_BLANK': {
      // Mode (c): fully blank week, no sessions, no slots. Coach builds from
      // scratch — useful for switching training blocks mid-mesocycle.
      return {
        ...state,
        weeks: [...state.weeks, { slots: [], sessions: [] }],
        currentWeekIndex: state.weeks.length,
        isDirty: true,
      };
    }

    case 'SET_SLOT_DELTA_RULES': {
      // Replace deltaRules on the slot with matching id (across all weeks —
      // ids are globally unique, will match at most one slot). Phase 2 editor
      // will only call this with W1 slot ids.
      const nextRules = action.rules.length > 0 ? action.rules : undefined;
      // Detect the 0 → N transition so we can auto-recompute downstream weeks
      // that were created BEFORE the rule was authored — without this, those
      // weeks keep the verbatim-clone values and the inheritance bar's
      // "auto" chip is misleading (B4).
      const w1Slot = state.weeks[0]?.slots.find(s => s.id === action.slotId);
      const hadRules = !!(w1Slot?.deltaRules && w1Slot.deltaRules.length > 0);
      const willHaveRules = !!(nextRules && nextRules.length > 0);

      const weeks = state.weeks.map(w => ({
        ...w,
        slots: w.slots.map(s =>
          s.id === action.slotId ? { ...s, deltaRules: nextRules } : s,
        ),
      }));
      const next: MusclePlanState = { ...state, weeks, isDirty: true };

      // First-rule-added: auto-run recompute for this slot's lineage. Manual
      // overrides on later weeks survive because the engine respects them.
      if (!hadRules && willHaveRules) {
        return recomputeDownstreamWeeks(next, action.slotId);
      }
      return next;
    }

    case 'MARK_FIELD_MANUAL_OVERRIDE': {
      const weeks = state.weeks.map(w => ({
        ...w,
        slots: w.slots.map(s => {
          if (s.id !== action.slotId) return s;
          const current = s.manualOverrides ?? [];
          if (current.includes(action.field)) return s;
          return { ...s, manualOverrides: [...current, action.field] };
        }),
      }));
      return { ...state, weeks, isDirty: true };
    }

    case 'CLEAR_FIELD_MANUAL_OVERRIDE': {
      const weeks = state.weeks.map(w => ({
        ...w,
        slots: w.slots.map(s => {
          if (s.id !== action.slotId) return s;
          const next = (s.manualOverrides ?? []).filter(t => t !== action.field);
          return { ...s, manualOverrides: next.length > 0 ? next : undefined };
        }),
      }));
      return { ...state, weeks, isDirty: true };
    }

    case 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS': {
      // Walks every week > 0 and rerun the engine for slots whose W1 sibling
      // has rules. Hand-edits tracked in manualOverrides survive — the engine
      // skips overridden targets, leaving the cell untouched.
      // Logic lives in recomputeDownstreamWeeks() because SET_SLOT_DELTA_RULES
      // also calls it on first-rule transition (B4 fix).
      return recomputeDownstreamWeeks(state, action.slotId);
    }

    case 'REMOVE_WEEK': {
      if (state.weeks.length <= 1) return state;
      const weeks = state.weeks.filter((_, i) => i !== action.weekIndex);
      const newIndex = Math.min(state.currentWeekIndex, weeks.length - 1);
      return { ...state, weeks, currentWeekIndex: newIndex, isDirty: true };
    }

    case 'DUPLICATE_WEEK': {
      const source = state.weeks[action.weekIndex];
      if (!source) return state;
      const cloned = deepCloneWeek(source);
      const weeks = [...state.weeks];
      weeks.splice(action.weekIndex + 1, 0, cloned);
      return { ...state, weeks, currentWeekIndex: action.weekIndex + 1, isDirty: true };
    }

    case 'SET_WEEK_LABEL': {
      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex ? { ...w, label: action.label || undefined } : w
      );
      return { ...state, weeks, isDirty: true };
    }

    case 'TOGGLE_DELOAD': {
      // Phase 5 — flag-only toggle. The auto-60%-sets reduction that used to
      // live here moved into APPLY_DELOAD (the Volume preset). Marking a week
      // as deload without going through the dialog now leaves content intact.
      const week = state.weeks[action.weekIndex];
      if (!week) return state;
      const wasDeload = week.isDeload;
      const weeks = state.weeks.map((w, i) =>
        i === action.weekIndex
          ? { ...w, isDeload: !wasDeload, label: !wasDeload ? (w.label || 'Deload') : w.label }
          : w
      );
      return { ...state, weeks, isDirty: true };
    }

    case 'APPLY_DELOAD': {
      // Phase 5 — coach picks base content + optional preset from the
      // DeloadDialog. Preset-touched fields are tagged manualOverrides so
      // RECOMPUTE_DOWNSTREAM_FROM_DELTAS doesn't re-clobber them with the
      // W1 progression rules.
      if (action.weekIndex < 0 || action.weekIndex >= state.weeks.length) return state;
      const targetWeek = state.weeks[action.weekIndex];

      // ---- Resolve base content ----
      let baseSlots: MuscleSlotData[];
      let baseSessions: SessionData[];
      if (action.baseContent === 'fresh') {
        baseSlots = [];
        baseSessions = [];
      } else if (action.baseContent === 'clone' && action.sourceWeekIndex != null) {
        const source = state.weeks[action.sourceWeekIndex];
        if (!source) return state;
        const cloned = deepCloneWeek(source);
        baseSlots = cloned.slots;
        baseSessions = cloned.sessions ?? [];
      } else {
        // 'keep' — leave target's existing content
        baseSlots = targetWeek.slots;
        baseSessions = targetWeek.sessions ?? [];
      }

      // ---- Apply preset (if any) and tag overrides ----
      const preset = action.presetId ? findDeloadPreset(action.presetId) : null;
      const transformedSlots: MuscleSlotData[] = preset
        ? baseSlots.map(slot => {
            const after = preset.apply(slot);
            return {
              ...after,
              manualOverrides: Array.from(new Set([
                ...(slot.manualOverrides ?? []),
                ...preset.touchedTargets,
              ])),
            };
          })
        : baseSlots;

      const updatedWeeks = state.weeks.map((w, i) =>
        i === action.weekIndex
          ? {
              ...w,
              slots: transformedSlots,
              sessions: baseSessions,
              isDeload: true,
              label: w.label || 'Deload',
            }
          : w,
      );
      return { ...state, weeks: updatedWeeks, isDirty: true };
    }

    case 'APPLY_SLOT_TO_REMAINING': {
      const sourceSlot = slots.find(s => s.id === action.slotId);
      if (!sourceSlot) return state;
      const { dayIndex, sortOrder } = sourceSlot;
      const weeks = state.weeks.map((w, wi) => {
        if (wi <= state.currentWeekIndex) return w;
        const updatedSlots = w.slots.map(s => {
          if (s.dayIndex !== dayIndex || s.sortOrder !== sortOrder) return s;
          const merged = { ...s, ...action.fields };
          if (action.fields.exercise) {
            merged.exercise = { ...action.fields.exercise };
          }
          return merged;
        });
        return { ...w, slots: updatedSlots };
      });
      return { ...state, weeks, isDirty: true };
    }

    // ---- Slot operations (scoped to current week) ----

    case 'ADD_MUSCLE': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        // Resolve target session: explicit id (if valid), else find-or-create
        // a strength session on the target day.
        let sessionId = action.sessionId;
        let nextSessions = sessions;
        if (!sessionId || !sessions.some(x => x.id === sessionId)) {
          const ensured = ensureSessionForDay(sessions, action.dayIndex, 'strength');
          sessionId = ensured.sessionId;
          nextSessions = ensured.sessions;
        }
        const newSlot: MuscleSlotData = {
          id: crypto.randomUUID(),
          dayIndex: action.dayIndex,
          muscleId: action.muscleId,
          sets: action.sets ?? 3,
          repMin: 8,
          repMax: 12,
          sortOrder: getMaxSortOrder(s, action.dayIndex) + 1,
          sessionId,
        };
        return { slots: [...s, newSlot], sessions: nextSessions };
      });
    }

    case 'REMOVE_MUSCLE':
      return withUpdatedCurrentWeek(state, s => s.filter(sl => sl.id !== action.slotId));

    case 'ADD_SESSION':
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const sameDayCount = sessions.filter(x => x.dayIndex === action.dayIndex).length;
        const newSession: SessionData = {
          id: crypto.randomUUID(),
          dayIndex: action.dayIndex,
          type: action.sessionType,
          name: action.name,
          sortOrder: sameDayCount,
        };
        return { slots: s, sessions: [...sessions, newSession] };
      });

    case 'REMOVE_SESSION':
      // Drops the session AND all slots that belong to it. Coach confirms in UI.
      return withUpdatedCurrentWeekFull(state, (s, sessions) => ({
        slots: s.filter(sl => sl.sessionId !== action.sessionId),
        sessions: sessions.filter(x => x.id !== action.sessionId),
      }));

    case 'RENAME_SESSION':
      return withUpdatedCurrentWeekFull(state, (s, sessions) => ({
        slots: s,
        sessions: sessions.map(x =>
          x.id === action.sessionId ? { ...x, name: action.name || undefined } : x,
        ),
      }));

    case 'SET_SESSION_TYPE':
      return withUpdatedCurrentWeekFull(state, (s, sessions) => ({
        slots: s,
        sessions: sessions.map(x =>
          x.id === action.sessionId ? { ...x, type: action.sessionType } : x,
        ),
      }));

    case 'REORDER_SESSION': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const dayOnly = sessions
          .filter(x => x.dayIndex === action.dayIndex)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const others = sessions.filter(x => x.dayIndex !== action.dayIndex);
        const [moved] = dayOnly.splice(action.fromIndex, 1);
        if (!moved) return { slots: s, sessions };
        dayOnly.splice(action.toIndex, 0, moved);
        const reordered = dayOnly.map((x, i) => ({ ...x, sortOrder: i }));
        return { slots: s, sessions: [...others, ...reordered] };
      });
    }

    case 'DUPLICATE_SESSION_TO_DAY': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const source = sessions.find(x => x.id === action.sessionId);
        if (!source) return { slots: s, sessions };
        const sameTargetDayCount = sessions.filter(x => x.dayIndex === action.toDayIndex).length;
        const newSessionId = crypto.randomUUID();
        const newSession: SessionData = {
          id: newSessionId,
          dayIndex: action.toDayIndex,
          name: source.name,
          type: source.type,
          sortOrder: sameTargetDayCount,
        };
        // Clone the source session's slots into the new day/session with
        // fresh ids and sortOrders that continue from the target day's tail.
        const targetDaySlotsMax = getMaxSortOrder(s, action.toDayIndex);
        const sourceSlots = s
          .filter(sl => sl.sessionId === action.sessionId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const clonedSlots: MuscleSlotData[] = sourceSlots.map((sl, i) => ({
          ...sl,
          id: crypto.randomUUID(),
          dayIndex: action.toDayIndex,
          sessionId: newSessionId,
          sortOrder: targetDaySlotsMax + 1 + i,
          exercise: sl.exercise ? { ...sl.exercise } : undefined,
          replacements: sl.replacements ? sl.replacements.map(r => ({ ...r })) : undefined,
          setsDetail: sl.setsDetail ? sl.setsDetail.map(sd => ({ ...sd })) : undefined,
        }));
        return { slots: [...s, ...clonedSlots], sessions: [...sessions, newSession] };
      });
    }

    case 'SET_SETS': {
      const next = withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, sets: Math.max(1, action.sets) } : sl)
      );
      return tagSlotOverrides(next, action.slotId, ['sets']);
    }

    case 'SET_REPS': {
      const next = withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId
          ? { ...sl, repMin: Math.max(1, Math.min(100, action.repMin)), repMax: Math.max(1, Math.min(100, action.repMax)) }
          : sl)
      );
      return tagSlotOverrides(next, action.slotId, ['repMin', 'repMax']);
    }

    case 'SET_SLOT_DETAILS': {
      const next = withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId) return sl;
          const updated = {
            ...sl,
            ...(action.sets != null && { sets: Math.max(1, action.sets) }),
            ...(action.repMin != null && { repMin: Math.max(1, Math.min(100, action.repMin)) }),
            ...(action.repMax != null && { repMax: Math.max(1, Math.min(100, action.repMax)) }),
            ...(action.tempo !== undefined && { tempo: action.tempo || undefined }),
            ...(action.rir !== undefined && { rir: action.rir }),
            ...(action.rpe !== undefined && { rpe: action.rpe }),
          };
          if (action.sets != null && updated.setsDetail) {
            updated.setsDetail = syncSetsDetailLength(updated.setsDetail, updated.sets);
          }
          return updated;
        })
      );
      const touched: DeltaTarget[] = [];
      if (action.sets != null) touched.push('sets');
      if (action.repMin != null) touched.push('repMin');
      if (action.repMax != null) touched.push('repMax');
      if (action.tempo !== undefined) touched.push('tempo');
      if (action.rir !== undefined) touched.push('rir');
      if (action.rpe !== undefined) touched.push('rpe');
      return tagSlotOverrides(next, action.slotId, touched);
    }

    case 'REORDER': {
      const daySlots = slots
        .filter(s => s.dayIndex === action.dayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const otherSlots = slots.filter(s => s.dayIndex !== action.dayIndex);
      const [moved] = daySlots.splice(action.fromIndex, 1);
      daySlots.splice(action.toIndex, 0, moved);
      const reordered = daySlots.map((s, i) => ({ ...s, sortOrder: i }));
      return withUpdatedCurrentWeek(state, () => [...otherSlots, ...reordered]);
    }

    case 'REORDER_IN_SESSION': {
      // Reorders the slot at fromIndex inside the named session to toIndex.
      // sortOrder lives in the flat day-level list, so we splice within the
      // session's slice and then rewrite sortOrder for the full day so
      // visual order still matches stored order.
      return withUpdatedCurrentWeek(state, s => {
        const sessions = getCurrentSessions(state);
        const session = sessions.find(x => x.id === action.sessionId);
        if (!session) return s;

        // Reorder within the target session
        const targetSessionSlots = s
          .filter(sl => sl.sessionId === action.sessionId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const [moved] = targetSessionSlots.splice(action.fromIndex, 1);
        if (!moved) return s;
        targetSessionSlots.splice(action.toIndex, 0, moved);

        // Walk the day's sessions in visual order and concat each session's
        // slots in their (new) array order. Critical: do NOT sort by old
        // sortOrder at the end — that would undo the splice we just did,
        // because the moved slot still carries its pre-drag sortOrder until
        // the .map() below rewrites it.
        const daySessions = sessions
          .filter(x => x.dayIndex === session.dayIndex)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const orderedDaySlots: typeof s = [];
        for (const sess of daySessions) {
          if (sess.id === action.sessionId) {
            orderedDaySlots.push(...targetSessionSlots);
          } else {
            const slots = s
              .filter(sl => sl.sessionId === sess.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            orderedDaySlots.push(...slots);
          }
        }
        // Legacy slots with no sessionId — append at end of the day so they
        // aren't dropped on the floor.
        const orphans = s
          .filter(sl => sl.dayIndex === session.dayIndex && !sl.sessionId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        orderedDaySlots.push(...orphans);

        const reordered = orderedDaySlots.map((sl, i) => ({ ...sl, sortOrder: i }));
        const otherDaySlots = s.filter(sl => sl.dayIndex !== session.dayIndex);
        return [...otherDaySlots, ...reordered];
      });
    }

    case 'MOVE_SLOT_TO_SESSION': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const slot = s.find(sl => sl.id === action.slotId);
        const targetSession = sessions.find(x => x.id === action.toSessionId);
        if (!slot || !targetSession) return { slots: s, sessions };
        const withoutMoved = s.filter(sl => sl.id !== action.slotId);
        const targetSessionSlots = withoutMoved
          .filter(sl => sl.sessionId === action.toSessionId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const movedSlot: MuscleSlotData = {
          ...slot,
          sessionId: action.toSessionId,
          dayIndex: targetSession.dayIndex,
          sortOrder: action.toIndex,
        };
        targetSessionSlots.splice(action.toIndex, 0, movedSlot);
        const reorderedTarget = targetSessionSlots.map((sl, i) => ({ ...sl, sortOrder: i }));
        const otherSlots = withoutMoved.filter(sl => sl.sessionId !== action.toSessionId);
        return { slots: [...otherSlots, ...reorderedTarget], sessions };
      });
    }

    case 'MOVE_MUSCLE': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const slot = s.find(sl => sl.id === action.slotId);
        if (!slot) return { slots: s, sessions };
        // Cross-day move: sessions are now mixed-content containers, so don't
        // match a target session by type. Land in the FIRST existing session on
        // the target day; only create one (using the slot's own type for its
        // display label) when the target day has no sessions at all.
        let sessionId = slot.sessionId;
        let nextSessions = sessions;
        if (slot.dayIndex !== action.toDay) {
          const targetDaySessions = sessions
            .filter(x => x.dayIndex === action.toDay)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          if (targetDaySessions.length > 0) {
            sessionId = targetDaySessions[0].id;
          } else {
            const ensured = ensureSessionForDay(sessions, action.toDay, slot.activityType || 'strength');
            sessionId = ensured.sessionId;
            nextSessions = ensured.sessions;
          }
        }
        const withoutMoved = s.filter(sl => sl.id !== action.slotId);
        const targetSlots = withoutMoved
          .filter(sl => sl.dayIndex === action.toDay)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const movedSlot: MuscleSlotData = { ...slot, dayIndex: action.toDay, sortOrder: action.toIndex, sessionId };
        targetSlots.splice(action.toIndex, 0, movedSlot);
        const reorderedTarget = targetSlots.map((sl, i) => ({ ...sl, sortOrder: i }));
        const otherSlots = withoutMoved.filter(sl => sl.dayIndex !== action.toDay);
        return { slots: [...otherSlots, ...reorderedTarget], sessions: nextSessions };
      });
    }

    case 'SET_ALL_SETS_FOR_MUSCLE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.muscleId === action.muscleId ? { ...sl, sets: Math.max(1, action.sets) } : sl)
      );

    case 'PASTE_DAY': {
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        const sourceSlots = s
          .filter(sl => sl.dayIndex === action.fromDayIndex)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (sourceSlots.length === 0) return { slots: s, sessions };
        // Build a map from source sessionId to newly-cloned session for the
        // target day, so pasted slots land in session equivalents.
        const sourceSessionIds = new Set(sourceSlots.map(sl => sl.sessionId).filter((x): x is string => !!x));
        const sessionRemap = new Map<string, string>();
        const sameTargetDayCount = sessions.filter(x => x.dayIndex === action.toDayIndex).length;
        const newSessions: SessionData[] = [];
        let sortCursor = sameTargetDayCount;
        for (const src of sessions) {
          if (!sourceSessionIds.has(src.id) || src.dayIndex !== action.fromDayIndex) continue;
          const newId = crypto.randomUUID();
          sessionRemap.set(src.id, newId);
          newSessions.push({ ...src, id: newId, dayIndex: action.toDayIndex, sortOrder: sortCursor++ });
        }
        const maxOrder = getMaxSortOrder(s, action.toDayIndex);
        const newSlots = sourceSlots.map((sl, i) => ({
          ...sl,
          id: crypto.randomUUID(),
          dayIndex: action.toDayIndex,
          sortOrder: maxOrder + 1 + i,
          sessionId: sl.sessionId ? sessionRemap.get(sl.sessionId) : undefined,
        }));
        return { slots: [...s, ...newSlots], sessions: [...sessions, ...newSessions] };
      });
    }

    case 'LOAD_PRESET': {
      // Presets are legacy bare slot arrays — migrate into sessions on load.
      const hydrated = hydrateSlotIds(action.slots);
      const migrated = migrateSlotsToSessions(hydrated);
      return {
        ...state,
        weeks: [{ slots: migrated.slots, sessions: migrated.sessions }],
        currentWeekIndex: 0,
        name: action.name ?? state.name,
        isDirty: true,
      };
    }

    case 'CLEAR_ALL':
      return { ...state, weeks: [{ slots: [], sessions: [] }], currentWeekIndex: 0, isDirty: true };

    case 'SET_EXERCISE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, exercise: action.exercise } : sl)
      );

    case 'CLEAR_EXERCISE':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, exercise: undefined } : sl)
      );

    case 'ADD_REPLACEMENT':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId
          ? { ...sl, replacements: [...(sl.replacements || []), action.exercise] }
          : sl)
      );

    case 'ADD_REPLACEMENTS':
      // Batch append (multiselect picker) — one dispatch = one undo step.
      if (action.exercises.length === 0) return state;
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId
          ? { ...sl, replacements: [...(sl.replacements || []), ...action.exercises] }
          : sl)
      );

    case 'REMOVE_REPLACEMENT':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.replacements) return sl;
          const updated = sl.replacements.filter((_, i) => i !== action.replacementIndex);
          return { ...sl, replacements: updated.length > 0 ? updated : undefined };
        })
      );

    case 'TOGGLE_PER_SET':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId) return sl;
          if (sl.setsDetail) {
            const first = sl.setsDetail[0];
            return {
              ...sl,
              setsDetail: undefined,
              ...(first?.rep_range_min != null && { repMin: first.rep_range_min }),
              ...(first?.rep_range_max != null && { repMax: first.rep_range_max }),
              ...(first?.tempo !== undefined && { tempo: first.tempo }),
              ...(first?.rir !== undefined && { rir: first.rir }),
              ...(first?.rpe !== undefined && { rpe: first.rpe }),
            };
          }
          return { ...sl, setsDetail: createSetsDetailFromFlat(sl) };
        })
      );

    case 'UPDATE_SET_DETAIL': {
      const next = withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.setsDetail) return sl;
          const updated = sl.setsDetail.map((set, i) =>
            i === action.setIndex ? { ...set, [action.field]: action.value } : set
          );
          return { ...sl, setsDetail: updated };
        })
      );
      // Per-set field → slot-level DeltaTarget. Best-effort coverage: rir,
      // rpe, and reps fields map to the slot-level RIR/RPE rules. Other fields
      // (weight, tempo per-set) aren't covered by Phase 0 engine targets, so
      // no tag — they can't be overridden by a rule either.
      const fieldToTarget: Record<string, DeltaTarget | null> = {
        rir: 'rir',
        rpe: 'rpe',
        rep_range_min: 'repMin',
        rep_range_max: 'repMax',
      };
      const target = fieldToTarget[action.field as string] ?? null;
      return target ? tagSlotOverrides(next, action.slotId, [target]) : next;
    }

    case 'DELETE_SET_AT_INDEX':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.setsDetail || sl.setsDetail.length <= 1) return sl;
          const remaining = sl.setsDetail
            .filter((_, i) => i !== action.setIndex)
            .map((set, i) => ({ ...set, set_number: i + 1 }));
          return { ...sl, setsDetail: remaining, sets: remaining.length };
        })
      );

    case 'APPLY_SET_TO_REMAINING':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.setsDetail) return sl;
          const template = sl.setsDetail[action.fromIndex];
          if (!template) return sl;
          const updated = sl.setsDetail.map((set, i) =>
            i > action.fromIndex
              ? { ...template, set_number: i + 1 }
              : set
          );
          return { ...sl, setsDetail: updated };
        })
      );

    case 'SET_SLOT_COLUMNS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, prescriptionColumns: action.columns } : sl)
      );

    case 'SET_EXERCISE_INSTRUCTIONS': {
      const next = withUpdatedCurrentWeek(state, s =>
        s.map(sl => {
          if (sl.id !== action.slotId || !sl.exercise) return sl;
          return { ...sl, exercise: { ...sl.exercise, instructions: action.instructions || undefined } };
        })
      );
      return tagSlotOverrides(next, action.slotId, ['instructions']);
    }

    case 'SET_GLOBAL_CLIENT_INPUTS':
      return { ...state, globalClientInputs: action.columns, isDirty: true };

    case 'SET_SLOT_CLIENT_INPUTS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, clientInputColumns: action.columns } : sl)
      );

    case 'ADD_ACTIVITY': {
      const activity = ACTIVITY_MAP.get(action.activityId);
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        let sessionId = action.sessionId;
        let nextSessions = sessions;
        if (!sessionId || !sessions.some(x => x.id === sessionId)) {
          const ensured = ensureSessionForDay(sessions, action.dayIndex, action.activityType);
          sessionId = ensured.sessionId;
          nextSessions = ensured.sessions;
        }
        const newSlot: MuscleSlotData = {
          id: crypto.randomUUID(),
          dayIndex: action.dayIndex,
          muscleId: '',
          sets: 1,
          repMin: 0,
          repMax: 0,
          sortOrder: getMaxSortOrder(s, action.dayIndex) + 1,
          sessionId,
          activityType: action.activityType,
          activityId: action.activityId,
          activityName: activity?.label || action.activityId,
          duration: 30,
        };
        return { slots: [...s, newSlot], sessions: nextSessions };
      });
    }

    case 'ADD_EXERCISE_TO_SESSION': {
      // Unified picker: a non-strength exercise_library exercise placed directly
      // into a session (5g). The slot stores the REAL exercise (slot.exercise) +
      // a derived activityType so it renders as an ActivitySlotCard. muscleId is
      // empty (volume math already skips non-strength slots).
      return withUpdatedCurrentWeekFull(state, (s, sessions) => {
        let sessionId = action.sessionId;
        let nextSessions = sessions;
        if (!sessionId || !sessions.some(x => x.id === sessionId)) {
          const ensured = ensureSessionForDay(sessions, action.dayIndex, action.activityType);
          sessionId = ensured.sessionId;
          nextSessions = ensured.sessions;
        }
        const newSlot: MuscleSlotData = {
          id: crypto.randomUUID(),
          dayIndex: action.dayIndex,
          muscleId: '',
          sets: 1,
          repMin: 0,
          repMax: 0,
          sortOrder: getMaxSortOrder(s, action.dayIndex) + 1,
          sessionId,
          activityType: action.activityType,
          activityName: action.exercise.name,
          exercise: action.exercise,
          duration: 30,
        };
        return { slots: [...s, newSlot], sessions: nextSessions };
      });
    }

    case 'SET_ACTIVITY_DETAILS':
      return withUpdatedCurrentWeek(state, s =>
        s.map(sl => sl.id === action.slotId ? { ...sl, ...action.details } : sl)
      );

    case 'MARK_SAVED':
      // Clear isDirty so auto-save doesn't immediately refire. If the user edits
      // mid-save, the next SET_* action flips isDirty back to true and auto-save
      // picks it up after the 2s debounce.
      return { ...state, templateId: action.templateId, isDirty: false, isSaving: false };

    case 'SAVING':
      return { ...state, isSaving: true };

    case 'SAVE_ERROR':
      return { ...state, isSaving: false };

    default:
      return state;
  }
}

// ============================================================
// Undo/Redo wrapper
// ============================================================

const MAX_HISTORY = 50;

const NON_UNDOABLE: Set<string> = new Set([
  'SELECT_DAY', 'SELECT_WEEK', 'SAVING', 'MARK_SAVED', 'SAVE_ERROR', 'LOAD_TEMPLATE', 'UNDO', 'REDO',
]);

interface UndoableState {
  current: MusclePlanState;
  past: MusclePlanState[];
  future: MusclePlanState[];
}

function undoableReducer(state: UndoableState, action: Action): UndoableState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      current: { ...previous, isSaving: state.current.isSaving, templateId: state.current.templateId },
      future: [state.current, ...state.future].slice(0, MAX_HISTORY),
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.current].slice(-MAX_HISTORY),
      current: { ...next, isSaving: state.current.isSaving, templateId: state.current.templateId },
      future: state.future.slice(1),
    };
  }

  const newCurrent = reducer(state.current, action);

  if (NON_UNDOABLE.has(action.type) || newCurrent === state.current) {
    return { ...state, current: newCurrent };
  }

  return {
    past: [...state.past, state.current].slice(-MAX_HISTORY),
    current: newCurrent,
    future: [],
  };
}

// ============================================================
// Hook
// ============================================================

function buildSlotConfig(state: MusclePlanState): Record<string, unknown> {
  return {
    weeks: state.weeks,
    globalClientInputs: state.globalClientInputs,
    globalPrescriptionColumns: state.globalPrescriptionColumns,
  } as unknown as Record<string, unknown>;
}

// P1 (program system unification): mirror the serialized builder state into the
// canonical plan* model via save_plan_from_builder. slot_config remains authoritative
// during the soak — this runs fire-and-forget AFTER the slot_config write, so a mirror
// failure is a stale mirror, not data loss. See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P1.
function buildPlanPayload(state: MusclePlanState) {
  // `weeks` carries each SessionData.id and MuscleSlotData.id verbatim — these are the
  // builder's stable ids that save_plan_from_builder upserts on (plan_sessions.builder_session_id
  // / plan_slots.builder_slot_id) so plan_slots.id stays linked to exercise_set_logs across
  // re-saves. Do NOT strip slot/session ids from the payload.
  return {
    name: state.name,
    description: state.description || null,
    weeks: state.weeks,
    globalClientInputs: state.globalClientInputs,
    globalPrescriptionColumns: state.globalPrescriptionColumns,
  };
}

async function mirrorPlanToCanonical(templateId: string, state: MusclePlanState): Promise<void> {
  try {
    const { error } = await supabase.rpc('save_plan_from_builder', {
      p_template_id: templateId,
      p_payload: buildPlanPayload(state) as unknown as Json,
    });
    if (error) throw error;
  } catch (err) {
    captureException(err, {
      source: 'save_plan_from_builder_mirror',
      severity: 'warning',
      metadata: { templateId },
    });
  }
}

export function useMuscleBuilderState(coachUserId: string, existingTemplateId?: string) {
  const [{ current: state, past, future }, dispatch] = useReducer(undoableReducer, {
    current: initialState,
    past: [],
    future: [],
  });
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // Load existing template
  useEffect(() => {
    if (!existingTemplateId || hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      const { data, error } = await supabase
        .from('muscle_program_templates')
        .select('*')
        .eq('id', existingTemplateId)
        .single();

      if (error) {
        toast({ title: 'Error loading template', description: sanitizeErrorForUser(error), variant: 'destructive' });
        return;
      }

      // slot_config formats: array (v1), { slots } (v2), { weeks } (v3), { weeks, sessions } (v4)
      const raw = data.slot_config as unknown;
      let weeks: WeekData[] = [{ slots: [] }];
      let globalClientInputs: string[] | undefined;
      let globalPrescriptionColumns: string[] | undefined;

      if (Array.isArray(raw)) {
        // v1: bare array of slots
        weeks = [{ slots: raw as MuscleSlotData[] }];
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if ('weeks' in obj && Array.isArray(obj.weeks)) {
          // v3/v4: multi-week format. Preserve sessions when present (v4);
          // LOAD_TEMPLATE's migrator fills them in for legacy rows.
          weeks = (obj.weeks as WeekData[]).map(w => ({
            slots: w.slots || [],
            sessions: w.sessions,
            label: w.label,
            isDeload: w.isDeload,
          }));
        } else if ('slots' in obj) {
          // v2: single-week object format
          weeks = [{ slots: (obj.slots as MuscleSlotData[]) || [] }];
        }
        globalClientInputs = obj.globalClientInputs as string[] | undefined;
        globalPrescriptionColumns = obj.globalPrescriptionColumns as string[] | undefined;
      }

      dispatch({
        type: 'LOAD_TEMPLATE',
        payload: {
          templateId: data.id,
          name: data.name,
          description: data.description || '',
          weeks,
          globalClientInputs,
          globalPrescriptionColumns,
        },
      });
    })();
  }, [existingTemplateId, toast]);

  // Auto-save: debounce 2s after changes when template already exists
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!state.isDirty || !state.templateId || state.isSaving) return;

    autoSaveTimerRef.current = setTimeout(async () => {
      const s = stateRef.current;
      if (!s.isDirty || !s.templateId || s.isSaving) return;

      dispatch({ type: 'SAVING' });
      try {
        const { error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({
              name: s.name,
              description: s.description || null,
              slot_config: buildSlotConfig(s),
              updated_at: new Date().toISOString(),
            })
            .eq('id', s.templateId),
          15000,
          'Auto-save muscle plan',
        );
        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: s.templateId! });
        // Mirror into canonical plan* AFTER the authoritative slot_config write.
        void mirrorPlanToCanonical(s.templateId!, s);
      } catch {
        dispatch({ type: 'SAVE_ERROR' });
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [state.isDirty, state.templateId, state.isSaving, state.weeks, state.name, state.description]);

  // Save
  const save = useCallback(async () => {
    clearTimeout(autoSaveTimerRef.current);
    dispatch({ type: 'SAVING' });

    try {
      if (state.templateId) {
        const { error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .update({
              name: state.name,
              description: state.description || null,
              slot_config: buildSlotConfig(state),
              updated_at: new Date().toISOString(),
            })
            .eq('id', state.templateId),
          15000,
          'Save muscle plan',
        );

        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: state.templateId });
        // Mirror into canonical plan* AFTER the authoritative slot_config write.
        void mirrorPlanToCanonical(state.templateId, state);
      } else {
        const { data, error } = await withTimeout(
          supabase
            .from('muscle_program_templates')
            .insert({
              coach_id: coachUserId,
              name: state.name,
              description: state.description || null,
              slot_config: buildSlotConfig(state),
            })
            .select('id')
            .single(),
          15000,
          'Save muscle plan',
        );

        if (error) throw error;
        dispatch({ type: 'MARK_SAVED', templateId: data.id });
        // Mirror into canonical plan* AFTER the authoritative slot_config insert.
        void mirrorPlanToCanonical(data.id, state);
      }

      toast({ title: 'Muscle plan saved' });
    } catch (error: unknown) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving', description: sanitizeErrorForUser(error), variant: 'destructive' });
    }
  }, [state.templateId, state.name, state.description, state.weeks, coachUserId, toast]);

  // Save as preset
  const saveAsPreset = useCallback(async () => {
    dispatch({ type: 'SAVING' });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('muscle_program_templates')
          .insert({
            coach_id: coachUserId,
            name: state.name,
            description: state.description || null,
            slot_config: buildSlotConfig(state),
            is_preset: true,
          })
          .select('id')
          .single(),
        15000,
        'Save preset',
      );

      if (error) throw error;
      dispatch({ type: 'SAVE_ERROR' }); // just stop isSaving — don't change templateId
      toast({ title: 'Saved as preset' });
      return data.id;
    } catch (error: unknown) {
      dispatch({ type: 'SAVE_ERROR' });
      toast({ title: 'Error saving preset', description: sanitizeErrorForUser(error), variant: 'destructive' });
      return null;
    }
  }, [coachUserId, state.name, state.description, state.weeks, toast]);

  return { state, dispatch, save, saveAsPreset, canUndo, canRedo };
}

export { getCurrentSlots, getCurrentSessions };

/**
 * Whether any W1 slot has at least one delta rule attached.
 * Used by WeekTabStrip to flip the Add Week dropdown's default mode:
 *   - true  → "Same workouts + apply rules" (mode a)
 *   - false → "Clone last week" (mode b — matches today's muscle memory)
 */
export function hasAnyDeltaRules(state: MusclePlanState): boolean {
  const w1 = state.weeks[0];
  if (!w1) return false;
  return w1.slots.some(s => Array.isArray(s.deltaRules) && s.deltaRules.length > 0);
}
