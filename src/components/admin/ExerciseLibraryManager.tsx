import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, Edit2, Loader2, Dumbbell, Filter, Video, X, ChevronDown } from 'lucide-react';
import {
  MUSCLE_GROUPS,
  SUBDIVISIONS,
  SUBDIVISIONS_BY_PARENT,
  EQUIPMENT_TYPES,
  RESISTANCE_PROFILES,
  MACHINE_BRANDS,
  getMuscleDisplay,
} from '@/types/muscle-builder';
import { getYouTubeThumbnailUrl } from '@/types/workout-builder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import MovementPatternEditor from './MovementPatternEditor';
import ExerciseCatalogView from './ExerciseCatalogView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string | null;
  subdivision: string | null;
  movement_pattern: string | null;
  equipment: string | null;
  machine_brand: string | null;
  resistance_profiles: string[] | null;
  category: string;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  default_video_url: string | null;
  setup_instructions: string | null;
  tags: string[] | null;
  is_active: boolean;
  is_global: boolean;
  created_at: string;
}

interface MovementPattern {
  id: string;
  muscle_group: string | null;
  subdivision: string | null;
  movement: string;
  execution_text: string | null;
  exercise_count?: number;
}

interface ExerciseFormState {
  name: string;
  muscleGroup: string;
  subdivision: string;
  movementPattern: string;
  equipment: string;
  machineBrand: string;
  resistanceProfiles: string[];
  category: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  videoUrl: string;
  setupInstructions: string;
  tags: string[];
  isActive: boolean;
  isGlobal: boolean;
}

const EMPTY_FORM: ExerciseFormState = {
  name: '',
  muscleGroup: '',
  subdivision: '',
  movementPattern: '',
  equipment: '',
  machineBrand: '',
  resistanceProfiles: [],
  category: 'strength',
  primaryMuscle: '',
  secondaryMuscles: [],
  videoUrl: '',
  setupInstructions: '',
  tags: [],
  isActive: true,
  isGlobal: true,
};

const CATEGORIES = [
  { id: 'strength', label: 'Strength' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'warmup', label: 'Warmup' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exerciseToForm(ex: ExerciseRow): ExerciseFormState {
  return {
    name: ex.name,
    muscleGroup: ex.muscle_group || '',
    subdivision: ex.subdivision || '',
    movementPattern: ex.movement_pattern || '',
    equipment: ex.equipment || '',
    machineBrand: ex.machine_brand || '',
    resistanceProfiles: ex.resistance_profiles || [],
    category: ex.category || 'strength',
    primaryMuscle: ex.primary_muscle || '',
    secondaryMuscles: ex.secondary_muscles || [],
    videoUrl: ex.default_video_url || '',
    setupInstructions: ex.setup_instructions || '',
    tags: ex.tags || [],
    isActive: ex.is_active,
    isGlobal: ex.is_global,
  };
}

function getEquipmentLabel(id: string | null): string {
  if (!id) return '--';
  const found = EQUIPMENT_TYPES.find((e) => e.id === id);
  return found ? found.label : id;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

interface Filters {
  muscleGroup: string;
  subdivision: string;
  movementPattern: string;
  equipment: string;
  resistanceProfile: string;
  machineBrand: string;
  category: string;
  activeOnly: boolean | null; // null = all, true = active, false = inactive
}

const EMPTY_FILTERS: Filters = {
  muscleGroup: '',
  subdivision: '',
  movementPattern: '',
  equipment: '',
  resistanceProfile: '',
  machineBrand: '',
  category: '',
  activeOnly: null,
};

function hasFilters(f: Filters): boolean {
  return (
    !!f.muscleGroup ||
    !!f.subdivision ||
    !!f.movementPattern ||
    !!f.equipment ||
    !!f.resistanceProfile ||
    !!f.machineBrand ||
    !!f.category ||
    f.activeOnly !== null
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExerciseLibraryManager() {
  // Data
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [patterns, setPatterns] = useState<MovementPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  // Search & filters
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // Sheet (edit/create)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ExerciseRow | null>(null);
  const [form, setForm] = useState<ExerciseFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState('exercises');

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchExercises = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('exercise_library')
        .select('*')
        .order('muscle_group', { ascending: true })
        .order('subdivision', { ascending: true })
        .order('movement_pattern', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setExercises((data as unknown as ExerciseRow[]) || []);
    } catch (err) {
      toast.error(sanitizeErrorForUser(err));
    }
  }, []);

  const fetchPatterns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('movement_patterns')
        .select('*')
        .order('muscle_group')
        .order('subdivision')
        .order('movement');
      if (error) throw error;
      setPatterns((data as unknown as MovementPattern[]) || []);
    } catch (err) {
      // movement_patterns table may not exist yet -- degrade gracefully
      console.warn('Could not fetch movement patterns:', err);
      setPatterns([]);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchExercises(), fetchPatterns()]);
    setLoading(false);
  }, [fetchExercises, fetchPatterns]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchAll();
  }, [fetchAll]);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  // Unique movement patterns from loaded exercises for filter dropdown
  const uniqueMovementPatterns = useMemo(() => {
    const set = new Set<string>();
    exercises.forEach((e) => {
      if (e.movement_pattern) set.add(e.movement_pattern);
    });
    return Array.from(set).sort();
  }, [exercises]);

  // Cascading subdivisions for filter bar
  const filterSubdivisions = useMemo(() => {
    if (!filters.muscleGroup) return [];
    return SUBDIVISIONS_BY_PARENT.get(filters.muscleGroup) || [];
  }, [filters.muscleGroup]);

  // Cascading subdivisions for form
  const formSubdivisions = useMemo(() => {
    if (!form.muscleGroup) return [];
    return SUBDIVISIONS_BY_PARENT.get(form.muscleGroup) || [];
  }, [form.muscleGroup]);

  // Filtered exercises
  const filtered = useMemo(() => {
    let result = exercises;

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.primary_muscle && e.primary_muscle.toLowerCase().includes(q)) ||
          (e.movement_pattern && e.movement_pattern.toLowerCase().includes(q)) ||
          (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    // Filters
    if (filters.muscleGroup) result = result.filter((e) => e.muscle_group === filters.muscleGroup);
    if (filters.subdivision) result = result.filter((e) => e.subdivision === filters.subdivision);
    if (filters.movementPattern) result = result.filter((e) => e.movement_pattern === filters.movementPattern);
    if (filters.equipment) result = result.filter((e) => e.equipment === filters.equipment);
    if (filters.resistanceProfile)
      result = result.filter(
        (e) => e.resistance_profiles && e.resistance_profiles.includes(filters.resistanceProfile)
      );
    if (filters.machineBrand) result = result.filter((e) => e.machine_brand === filters.machineBrand);
    if (filters.category) result = result.filter((e) => e.category === filters.category);
    if (filters.activeOnly === true) result = result.filter((e) => e.is_active);
    if (filters.activeOnly === false) result = result.filter((e) => !e.is_active);

    return result;
  }, [exercises, search, filters]);

  // Stats
  const stats = useMemo(() => {
    const total = exercises.length;
    const withVideo = exercises.filter((e) => !!e.default_video_url).length;
    const active = exercises.filter((e) => e.is_active).length;
    const perMuscle: Record<string, number> = {};
    exercises.forEach((e) => {
      const mg = e.muscle_group || 'Uncategorized';
      perMuscle[mg] = (perMuscle[mg] || 0) + 1;
    });
    return { total, withVideo, withoutVideo: total - withVideo, active, inactive: total - active, perMuscle };
  }, [exercises]);

  // -----------------------------------------------------------------------
  // Sheet open/close
  // -----------------------------------------------------------------------

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((ex: ExerciseRow) => {
    setEditing(ex);
    setForm(exerciseToForm(ex));
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
  }, []);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Exercise name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        muscle_group: form.muscleGroup || null,
        subdivision: form.subdivision || null,
        movement_pattern: form.movementPattern || null,
        equipment: form.equipment || null,
        machine_brand: form.equipment === 'M' ? form.machineBrand || null : null,
        resistance_profiles: form.resistanceProfiles.length > 0 ? form.resistanceProfiles : null,
        category: form.category || 'strength',
        primary_muscle: form.primaryMuscle || null,
        secondary_muscles: form.secondaryMuscles.length > 0 ? form.secondaryMuscles : null,
        default_video_url: form.videoUrl || null,
        setup_instructions: form.setupInstructions || null,
        tags: form.tags.length > 0 ? form.tags : null,
        is_active: form.isActive,
        is_global: form.isGlobal,
      };

      if (editing) {
        const { error } = await supabase
          .from('exercise_library')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Exercise updated');
      } else {
        const { error } = await supabase.from('exercise_library').insert(payload);
        if (error) throw error;
        toast.success('Exercise created');
      }
      closeSheet();
      await fetchExercises();
    } catch (err) {
      toast.error(sanitizeErrorForUser(err));
    } finally {
      setSaving(false);
    }
  }, [form, editing, closeSheet, fetchExercises]);

  // -----------------------------------------------------------------------
  // Toggle active inline
  // -----------------------------------------------------------------------

  const handleToggleActive = useCallback(
    async (ex: ExerciseRow, checked: boolean) => {
      try {
        const { error } = await supabase
          .from('exercise_library')
          .update({ is_active: checked })
          .eq('id', ex.id);
        if (error) throw error;
        setExercises((prev) => prev.map((e) => (e.id === ex.id ? { ...e, is_active: checked } : e)));
      } catch (err) {
        toast.error(sanitizeErrorForUser(err));
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  // Form helpers
  // -----------------------------------------------------------------------

  const updateForm = useCallback(<K extends keyof ExerciseFormState>(key: K, value: ExerciseFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Reset subdivision when muscle group changes
      if (key === 'muscleGroup') {
        next.subdivision = '';
      }
      // Reset machine brand when equipment changes away from M
      if (key === 'equipment' && value !== 'M') {
        next.machineBrand = '';
      }
      return next;
    });
  }, []);

  const toggleResistanceProfile = useCallback((profile: string) => {
    setForm((prev) => {
      const profiles = prev.resistanceProfiles.includes(profile)
        ? prev.resistanceProfiles.filter((p) => p !== profile)
        : [...prev.resistanceProfiles, profile];
      return { ...prev, resistanceProfiles: profiles };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Resistance profile short labels
  // -----------------------------------------------------------------------
  const rpShort: Record<string, string> = { Lengthened: 'L', 'Mid-range': 'M', Shortened: 'S' };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="exercises">
            <Dumbbell className="h-4 w-4 mr-1.5" />
            Exercises
          </TabsTrigger>
          <TabsTrigger value="patterns">Movement Patterns</TabsTrigger>
          <TabsTrigger value="catalog">Catalog View</TabsTrigger>
          <TabsTrigger value="stats">Library Stats</TabsTrigger>
        </TabsList>

        {/* ============================================================= */}
        {/* TAB 1: Exercises                                              */}
        {/* ============================================================= */}
        <TabsContent value="exercises" className="space-y-4 mt-4">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises..."
                className="pl-9 h-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                {filtered.length} of {exercises.length} exercises
              </Badge>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add Exercise
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />

            {/* Muscle Group */}
            <Select
              value={filters.muscleGroup}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, muscleGroup: v === '__all__' ? '' : v, subdivision: '' }))
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Muscle Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Muscles</SelectItem>
                {MUSCLE_GROUPS.map((mg) => (
                  <SelectItem key={mg.id} value={mg.id}>
                    {mg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Subdivision (cascading) */}
            <Select
              value={filters.subdivision}
              onValueChange={(v) => setFilters((f) => ({ ...f, subdivision: v === '__all__' ? '' : v }))}
              disabled={filterSubdivisions.length === 0}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Subdivision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Subdivisions</SelectItem>
                {filterSubdivisions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Movement Pattern */}
            <Select
              value={filters.movementPattern}
              onValueChange={(v) => setFilters((f) => ({ ...f, movementPattern: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Movement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Movements</SelectItem>
                {uniqueMovementPatterns.map((mp) => (
                  <SelectItem key={mp} value={mp}>
                    {mp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Equipment */}
            <Select
              value={filters.equipment}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, equipment: v === '__all__' ? '' : v, machineBrand: '' }))
              }
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Equipment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Equipment</SelectItem>
                {EQUIPMENT_TYPES.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Resistance Profile */}
            <Select
              value={filters.resistanceProfile}
              onValueChange={(v) => setFilters((f) => ({ ...f, resistanceProfile: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Profiles</SelectItem>
                {RESISTANCE_PROFILES.map((rp) => (
                  <SelectItem key={rp} value={rp}>
                    {rp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Machine Brand (only when equipment = M) */}
            {filters.equipment === 'M' && (
              <Select
                value={filters.machineBrand}
                onValueChange={(v) => setFilters((f) => ({ ...f, machineBrand: v === '__all__' ? '' : v }))}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Brands</SelectItem>
                  {MACHINE_BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Category */}
            <Select
              value={filters.category}
              onValueChange={(v) => setFilters((f) => ({ ...f, category: v === '__all__' ? '' : v }))}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Active toggle */}
            <Select
              value={filters.activeOnly === null ? '__all__' : filters.activeOnly ? 'active' : 'inactive'}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  activeOnly: v === '__all__' ? null : v === 'active' ? true : false,
                }))
              }
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters(filters) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-auto max-h-[70vh]">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Muscle</TableHead>
                    <TableHead>Subdivision</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Profile(s)</TableHead>
                    <TableHead className="w-10">
                      <Video className="h-3.5 w-3.5" />
                    </TableHead>
                    <TableHead className="w-16">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        {search || hasFilters(filters)
                          ? `No exercises found${search ? ` matching "${search}"` : ''}`
                          : 'No exercises yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ex, idx) => {
                      const muscleDisplay = ex.muscle_group ? getMuscleDisplay(ex.muscle_group) : null;
                      const subDisplay = ex.subdivision ? getMuscleDisplay(ex.subdivision) : null;
                      return (
                        <TableRow
                          key={ex.id}
                          className="text-sm cursor-pointer hover:bg-muted/50"
                          onClick={() => openEdit(ex)}
                        >
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{ex.name}</TableCell>
                          <TableCell>
                            {muscleDisplay ? (
                              <span className="text-xs">{muscleDisplay.label}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {subDisplay ? (
                              <span className="text-xs">{subDisplay.label}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{ex.movement_pattern || '--'}</TableCell>
                          <TableCell className="text-xs">{getEquipmentLabel(ex.equipment)}</TableCell>
                          <TableCell className="text-xs">{ex.machine_brand || '--'}</TableCell>
                          <TableCell>
                            {ex.resistance_profiles && ex.resistance_profiles.length > 0 ? (
                              <span className="text-xs">
                                {ex.resistance_profiles.map((rp) => rpShort[rp] || rp).join(' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {ex.default_video_url ? (
                              <Video className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={ex.is_active}
                              onCheckedChange={(checked) => handleToggleActive(ex, checked)}
                              className="scale-75"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 2: Movement Patterns                                      */}
        {/* ============================================================= */}
        <TabsContent value="patterns" className="mt-4">
          <MovementPatternEditor patterns={patterns} onRefresh={fetchPatterns} />
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 3: Catalog View                                           */}
        {/* ============================================================= */}
        <TabsContent value="catalog" className="mt-4">
          <ExerciseCatalogView
            exercises={exercises}
            patterns={patterns}
            onEditExercise={openEdit}
          />
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 4: Library Stats                                          */}
        {/* ============================================================= */}
        <TabsContent value="stats" className="space-y-4 mt-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">Total</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">With Video</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-emerald-400">{stats.withVideo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">No Video</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-amber-400">{stats.withoutVideo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">Active</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground font-normal">Inactive</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-zinc-400">{stats.inactive}</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-muscle breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Exercises per Muscle Group</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Muscle Group</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(stats.perMuscle)
                    .sort(([, a], [, b]) => b - a)
                    .map(([mg, count]) => {
                      const display = getMuscleDisplay(mg);
                      return (
                        <TableRow key={mg} className="text-sm">
                          <TableCell>{display ? display.label : mg}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{count}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {Object.keys(stats.perMuscle).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                        No data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================================================================= */}
      {/* Edit / Create Sheet                                                */}
      {/* ================================================================= */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{editing ? 'Edit Exercise' : 'Add Exercise'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ex-name">Name *</Label>
              <Input
                id="ex-name"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Exercise name"
              />
            </div>

            {/* Muscle Group */}
            <div className="space-y-1.5">
              <Label>Muscle Group *</Label>
              <Select value={form.muscleGroup} onValueChange={(v) => updateForm('muscleGroup', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select muscle group" />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((mg) => (
                    <SelectItem key={mg.id} value={mg.id}>
                      {mg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subdivision */}
            <div className="space-y-1.5">
              <Label>Subdivision</Label>
              <Select
                value={form.subdivision}
                onValueChange={(v) => updateForm('subdivision', v)}
                disabled={formSubdivisions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={formSubdivisions.length ? 'Select subdivision' : 'Select muscle group first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {formSubdivisions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Movement Pattern */}
            <div className="space-y-1.5">
              <Label>Movement Pattern</Label>
              <Input
                value={form.movementPattern}
                onChange={(e) => updateForm('movementPattern', e.target.value)}
                placeholder="e.g. Horizontal Press"
              />
            </div>

            {/* Equipment */}
            <div className="space-y-1.5">
              <Label>Equipment</Label>
              <Select value={form.equipment} onValueChange={(v) => updateForm('equipment', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {EQUIPMENT_TYPES.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Machine Brand — only when equipment === M */}
            {form.equipment === 'M' && (
              <div className="space-y-1.5">
                <Label>Machine Brand</Label>
                <Select value={form.machineBrand} onValueChange={(v) => updateForm('machineBrand', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {MACHINE_BRANDS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Resistance Profiles (multi-toggle) */}
            <div className="space-y-1.5">
              <Label>Resistance Profiles</Label>
              <div className="flex gap-2">
                {RESISTANCE_PROFILES.map((rp) => {
                  const active = form.resistanceProfiles.includes(rp);
                  return (
                    <Button
                      key={rp}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      className="h-8 text-xs px-3"
                      onClick={() => toggleResistanceProfile(rp)}
                    >
                      {rpShort[rp] || rp}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.resistanceProfiles.length > 0
                  ? form.resistanceProfiles.join(', ')
                  : 'None selected'}
              </p>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => updateForm('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Primary Muscle (legacy text field) */}
            <div className="space-y-1.5">
              <Label>Primary Muscle</Label>
              <Input
                value={form.primaryMuscle}
                onChange={(e) => updateForm('primaryMuscle', e.target.value)}
                placeholder="e.g. Chest, Quads"
              />
              <p className="text-xs text-muted-foreground">Legacy field -- auto-populated but editable</p>
            </div>

            {/* Secondary Muscles */}
            <div className="space-y-1.5">
              <Label>Secondary Muscles</Label>
              <Input
                value={form.secondaryMuscles.join(', ')}
                onChange={(e) =>
                  updateForm(
                    'secondaryMuscles',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="Comma-separated, e.g. Triceps, Front Delts"
              />
            </div>

            {/* Video URL */}
            <div className="space-y-1.5">
              <Label>Video URL</Label>
              <Input
                value={form.videoUrl}
                onChange={(e) => updateForm('videoUrl', e.target.value)}
                placeholder="YouTube URL"
              />
              {form.videoUrl && (() => {
                const thumbUrl = getYouTubeThumbnailUrl(form.videoUrl);
                return thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt="Video thumbnail"
                    className="rounded mt-1.5 w-40 h-auto border border-border"
                  />
                ) : null;
              })()}
            </div>

            {/* Setup Instructions */}
            <div className="space-y-1.5">
              <Label>Setup Instructions</Label>
              <Textarea
                rows={4}
                value={form.setupInstructions}
                onChange={(e) => updateForm('setupInstructions', e.target.value)}
                placeholder="Describe setup and execution..."
              />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                value={form.tags.join(', ')}
                onChange={(e) =>
                  updateForm(
                    'tags',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                placeholder="Comma-separated tags"
              />
            </div>

            {/* Switches */}
            <div className="flex items-center justify-between">
              <Label htmlFor="ex-active">Active</Label>
              <Switch
                id="ex-active"
                checked={form.isActive}
                onCheckedChange={(checked) => updateForm('isActive', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ex-global">Global (visible to all coaches)</Label>
              <Switch
                id="ex-global"
                checked={form.isGlobal}
                onCheckedChange={(checked) => updateForm('isGlobal', checked)}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={closeSheet} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Exercise'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
