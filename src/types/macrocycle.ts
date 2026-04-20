// src/types/macrocycle.ts
// Types for the macrocycle layer — an ordered collection of mesocycle programs.
// A macrocycle is the coach's 3-6 month training arc; each entry is an
// existing program_template (= mesocycle) with a sequence number.

export interface Macrocycle {
  id: string;
  coachId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One mesocycle slot inside a macrocycle. `programTemplateId` points at the
 * existing program_templates row; `weeks` is computed from
 * program_template_days (MAX(day_index) / 7 ceil) and used for date math
 * in assignment. `title` is denormalised from program_templates for
 * preview/label purposes.
 */
export interface MacrocycleBlock {
  macrocycleId: string;
  programTemplateId: string;
  sequence: number;
  // Denormalised for UI display — not stored on the junction row.
  title: string;
  description: string | null;
  weeks: number;
}

export interface MacrocycleWithBlocks extends Macrocycle {
  blocks: MacrocycleBlock[];
}

/** Result of the assign_macrocycle_to_client RPC. */
export interface AssignMacrocycleResult {
  success: boolean;
  clientProgramIds?: string[];
  weeksTotal?: number;
  error?: string;
}
