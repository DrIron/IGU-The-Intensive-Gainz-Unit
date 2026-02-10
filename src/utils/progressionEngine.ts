import type { ProgressionConfig, SuggestionType } from '@/types/workout-builder';

export interface SetContext {
  set_number: number;
  prescribed_weight: number | null;
  prescribed_rep_min: number | null;
  prescribed_rep_max: number | null;
  prescribed_rir: number | null;
  performed_weight: number;
  performed_reps: number;
  performed_rir: number | null;
  performed_rpe: number | null;
}

export interface SuggestionResult {
  type: SuggestionType;
  text: string;
  increment?: number;
}

// Text templates by suggestion style
const TEXTS: Record<string, Record<SuggestionType, string>> = {
  gentle: {
    increase_load: 'Nice work! You could try adding {increment} next set.',
    increase_reps: 'Looking strong! Try pushing for more reps at this weight.',
    hold_steady: 'Right on track — keep this weight and effort level.',
    reduce_load: 'That looked tough. Consider dropping the weight a little.',
    none: '',
  },
  direct: {
    increase_load: 'Add {increment} for the next set.',
    increase_reps: 'Push for more reps before adding weight.',
    hold_steady: 'Hold steady at this weight.',
    reduce_load: 'Drop the weight by {increment}.',
    none: '',
  },
  data_only: {
    increase_load: '+{increment} suggested (RIR surplus: {surplus})',
    increase_reps: 'More reps suggested before load increase (RIR surplus: {surplus})',
    hold_steady: 'On target (RIR surplus: {surplus})',
    reduce_load: '-{increment} suggested (RIR deficit: {deficit})',
    none: '',
  },
};

function formatText(
  template: string,
  config: ProgressionConfig,
  surplus: number,
): string {
  const increment = config.unit === 'kg' ? config.load_increment_kg : config.load_increment_lb;
  return template
    .replace('{increment}', `${increment}${config.unit}`)
    .replace('{surplus}', String(Math.abs(surplus)))
    .replace('{deficit}', String(Math.abs(surplus)));
}

/**
 * Evaluate a completed set and return a progression suggestion.
 *
 * Decision tree:
 * 1. No RIR/RPE available → none
 * 2. Calculate RIR surplus = performed_rir - prescribed_rir
 *    (use 10 - RPE as RIR fallback)
 * 3. surplus >= threshold AND hit top of rep range → increase_load
 * 4. surplus >= threshold AND below top → increase_reps
 * 5. surplus 0-1 → hold_steady
 * 6. surplus -1 → hold_steady (minor)
 * 7. surplus <= -2 → reduce_load
 */
export function evaluateSet(
  context: SetContext,
  config: ProgressionConfig,
): SuggestionResult {
  // No effort data → can't evaluate
  if (context.performed_rir === null && context.performed_rpe === null) {
    return { type: 'none', text: '' };
  }
  // No prescribed RIR → can't compare
  if (context.prescribed_rir === null) {
    return { type: 'none', text: '' };
  }

  // Derive performed RIR (use 10 - RPE as fallback)
  const performedRir =
    context.performed_rir !== null
      ? context.performed_rir
      : context.performed_rpe !== null
        ? 10 - context.performed_rpe
        : null;

  if (performedRir === null) {
    return { type: 'none', text: '' };
  }

  const surplus = performedRir - context.prescribed_rir;
  const style = config.suggestion_style;
  const increment = config.unit === 'kg' ? config.load_increment_kg : config.load_increment_lb;

  // Surplus >= threshold → ready to progress
  if (surplus >= config.rir_threshold) {
    // Check rep range if enabled
    if (
      config.rep_range_check &&
      context.prescribed_rep_max !== null &&
      context.performed_reps < context.prescribed_rep_max
    ) {
      return {
        type: 'increase_reps',
        text: formatText(TEXTS[style].increase_reps, config, surplus),
      };
    }

    return {
      type: 'increase_load',
      text: formatText(TEXTS[style].increase_load, config, surplus),
      increment,
    };
  }

  // Surplus 0 to threshold-1 → on target
  if (surplus >= 0) {
    return {
      type: 'hold_steady',
      text: formatText(TEXTS[style].hold_steady, config, surplus),
    };
  }

  // Minor deficit (-1) → still hold
  if (surplus === -1) {
    return {
      type: 'hold_steady',
      text: formatText(TEXTS[style].hold_steady, config, surplus),
    };
  }

  // Significant deficit (<= -2) → suggest reducing
  return {
    type: 'reduce_load',
    text: formatText(TEXTS[style].reduce_load, config, surplus),
    increment,
  };
}
