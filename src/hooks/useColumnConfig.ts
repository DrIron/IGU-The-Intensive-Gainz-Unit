// src/hooks/useColumnConfig.ts
// Hook for managing exercise column configurations

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  ColumnConfig,
  ColumnPreset,
  DEFAULT_PRESCRIPTION_COLUMNS,
  generateColumnId,
} from "@/types/workout-builder";

interface UseColumnConfigOptions {
  coachId: string;
  exerciseId?: string;
  autoLoad?: boolean;
}

interface UseColumnConfigReturn {
  columns: ColumnConfig[];
  setColumns: (columns: ColumnConfig[]) => void;
  presets: ColumnPreset[];
  loading: boolean;

  addColumn: (type: string, label: string, unit?: string) => void;
  removeColumn: (columnId: string) => void;
  toggleColumn: (columnId: string) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  updateColumn: (columnId: string, updates: Partial<ColumnConfig>) => void;

  loadPreset: (presetId: string) => void;
  savePreset: (name: string, description?: string) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
  setDefaultPreset: (presetId: string) => Promise<void>;

  resetToDefault: () => void;
}

export function useColumnConfig({
  coachId,
  exerciseId,
  autoLoad = true,
}: UseColumnConfigOptions): UseColumnConfigReturn {
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_PRESCRIPTION_COLUMNS);
  const [presets, setPresets] = useState<ColumnPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const loadPresets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("coach_column_presets")
        .select("*")
        .eq("coach_id", coachId)
        .order("name");

      if (error) throw error;
      setPresets(data || []);
    } catch (error: any) {
      console.error("Error loading presets:", error);
    }
  }, [coachId]);

  const loadDefaultColumns = useCallback(async () => {
    try {
      const { data: defaultPreset } = await supabase
        .from("coach_column_presets")
        .select("column_config")
        .eq("coach_id", coachId)
        .eq("is_default", true)
        .single();

      if (defaultPreset?.column_config) {
        setColumns(defaultPreset.column_config as ColumnConfig[]);
      } else {
        setColumns(DEFAULT_PRESCRIPTION_COLUMNS);
      }
    } catch (error) {
      setColumns(DEFAULT_PRESCRIPTION_COLUMNS);
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    if (autoLoad) {
      Promise.all([loadPresets(), loadDefaultColumns()]);
    } else {
      setLoading(false);
    }
  }, [autoLoad, loadPresets, loadDefaultColumns]);

  const addColumn = useCallback(
    (type: string, label: string, unit?: string) => {
      const newColumn: ColumnConfig = {
        id: generateColumnId(),
        type: type as any,
        label,
        visible: true,
        order: columns.length,
        unit,
      };
      setColumns([...columns, newColumn]);
    },
    [columns]
  );

  const removeColumn = useCallback(
    (columnId: string) => {
      setColumns(columns.filter((c) => c.id !== columnId));
    },
    [columns]
  );

  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumns(
        columns.map((c) =>
          c.id === columnId ? { ...c, visible: !c.visible } : c
        )
      );
    },
    [columns]
  );

  const reorderColumns = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newColumns = [...columns];
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      const reordered = newColumns.map((col, i) => ({ ...col, order: i }));
      setColumns(reordered);
    },
    [columns]
  );

  const updateColumn = useCallback(
    (columnId: string, updates: Partial<ColumnConfig>) => {
      setColumns(
        columns.map((c) =>
          c.id === columnId ? { ...c, ...updates } : c
        )
      );
    },
    [columns]
  );

  const loadPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setColumns(preset.column_config);
      }
    },
    [presets]
  );

  const savePreset = useCallback(
    async (name: string, description?: string) => {
      try {
        const { data, error } = await supabase
          .from("coach_column_presets")
          .insert({
            coach_id: coachId,
            name,
            description,
            column_config: columns,
            is_default: false,
          })
          .select()
          .single();

        if (error) throw error;

        setPresets([...presets, data as ColumnPreset]);
        toast({ title: "Preset saved", description: `"${name}" has been saved.` });
      } catch (error: any) {
        toast({
          title: "Error saving preset",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [coachId, columns, presets, toast]
  );

  const deletePreset = useCallback(
    async (presetId: string) => {
      try {
        const { error } = await supabase
          .from("coach_column_presets")
          .delete()
          .eq("id", presetId);

        if (error) throw error;

        setPresets(presets.filter((p) => p.id !== presetId));
        toast({ title: "Preset deleted" });
      } catch (error: any) {
        toast({
          title: "Error deleting preset",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [presets, toast]
  );

  const setDefaultPreset = useCallback(
    async (presetId: string) => {
      try {
        await supabase
          .from("coach_column_presets")
          .update({ is_default: false })
          .eq("coach_id", coachId)
          .eq("is_default", true);

        const { error } = await supabase
          .from("coach_column_presets")
          .update({ is_default: true })
          .eq("id", presetId);

        if (error) throw error;

        setPresets(
          presets.map((p) => ({
            ...p,
            is_default: p.id === presetId,
          }))
        );
        toast({ title: "Default preset updated" });
      } catch (error: any) {
        toast({
          title: "Error setting default",
          description: sanitizeErrorForUser(error),
          variant: "destructive",
        });
      }
    },
    [coachId, presets, toast]
  );

  const resetToDefault = useCallback(() => {
    setColumns(DEFAULT_PRESCRIPTION_COLUMNS);
  }, []);

  return {
    columns,
    setColumns,
    presets,
    loading,
    addColumn,
    removeColumn,
    toggleColumn,
    reorderColumns,
    updateColumn,
    loadPreset,
    savePreset,
    deletePreset,
    setDefaultPreset,
    resetToDefault,
  };
}

export default useColumnConfig;
