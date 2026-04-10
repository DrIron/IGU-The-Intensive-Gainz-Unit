import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Plus, Edit2, Loader2 } from 'lucide-react';
import { MUSCLE_GROUPS, SUBDIVISIONS_BY_PARENT } from '@/types/muscle-builder';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import BulletPointEditor from './BulletPointEditor';

interface MovementPattern {
  id: string;
  muscle_group: string | null;
  subdivision: string | null;
  movement: string;
  execution_text: string | null;
  execution_points: string[] | null;
  exercise_count?: number;
}

interface MovementPatternEditorProps {
  patterns: MovementPattern[];
  onRefresh: () => void;
}

interface EditForm {
  executionPoints: string[];
}

interface AddForm {
  muscleGroup: string;
  subdivision: string;
  movement: string;
}

export default function MovementPatternEditor({ patterns, onRefresh }: MovementPatternEditorProps) {
  const [editingPattern, setEditingPattern] = useState<MovementPattern | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ executionPoints: [] });
  const [editSaving, setEditSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ muscleGroup: '', subdivision: '', movement: '' });
  const [addSaving, setAddSaving] = useState(false);

  // Group patterns by muscle_group, then by subdivision
  const grouped = patterns.reduce<Record<string, Record<string, MovementPattern[]>>>((acc, p) => {
    const mg = p.muscle_group || 'Uncategorized';
    const sub = p.subdivision || '(No Subdivision)';
    if (!acc[mg]) acc[mg] = {};
    if (!acc[mg][sub]) acc[mg][sub] = [];
    acc[mg][sub].push(p);
    return acc;
  }, {});

  const handleOpenEdit = useCallback((pattern: MovementPattern) => {
    setEditingPattern(pattern);
    setEditForm({ executionPoints: pattern.execution_points || [] });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingPattern) return;
    setEditSaving(true);
    try {
      const points = editForm.executionPoints.filter(s => s.trim());
      const { error } = await supabase
        .from('movement_patterns')
        .update({
          execution_points: points.length > 0 ? points : null,
          execution_text: points.join('\n') || null,
        })
        .eq('id', editingPattern.id);
      if (error) throw error;
      toast.success('Movement pattern updated');
      setEditingPattern(null);
      onRefresh();
    } catch (err) {
      toast.error(sanitizeErrorForUser(err));
    } finally {
      setEditSaving(false);
    }
  }, [editingPattern, editForm.executionPoints, onRefresh]);

  const handleAddMovement = useCallback(async () => {
    if (!addForm.movement.trim()) {
      toast.error('Movement name is required');
      return;
    }
    setAddSaving(true);
    try {
      const { error } = await supabase.from('movement_patterns').insert({
        muscle_group: addForm.muscleGroup || null,
        subdivision: addForm.subdivision || null,
        movement: addForm.movement.trim(),
      });
      if (error) throw error;
      toast.success('Movement pattern added');
      setAddOpen(false);
      setAddForm({ muscleGroup: '', subdivision: '', movement: '' });
      onRefresh();
    } catch (err) {
      toast.error(sanitizeErrorForUser(err));
    } finally {
      setAddSaving(false);
    }
  }, [addForm, onRefresh]);

  const addSubdivisions = addForm.muscleGroup
    ? SUBDIVISIONS_BY_PARENT.get(addForm.muscleGroup) || []
    : [];

  const muscleGroupKeys = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {patterns.length} movement pattern{patterns.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Movement
        </Button>
      </div>

      {muscleGroupKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No movement patterns yet. Click "Add Movement" to create the first one.
        </p>
      ) : (
        <Accordion type="multiple" className="space-y-1">
          {muscleGroupKeys.map((mg) => {
            const subGroups = grouped[mg];
            const totalCount = Object.values(subGroups).flat().length;
            return (
              <AccordionItem key={mg} value={mg} className="border rounded-lg px-3">
                <AccordionTrigger className="text-sm font-medium py-3">
                  <span className="flex items-center gap-2">
                    {mg}
                    <Badge variant="secondary" className="text-xs">
                      {totalCount}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {Object.entries(subGroups)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([sub, movements]) => (
                      <div key={sub} className="mb-3 last:mb-0">
                        <p className="text-xs text-muted-foreground font-medium mb-1 pl-1">{sub}</p>
                        <div className="space-y-1">
                          {movements
                            .sort((a, b) => a.movement.localeCompare(b.movement))
                            .map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 group"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{m.movement}</span>
                                  {m.exercise_count != null && m.exercise_count > 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      {m.exercise_count} exercise{m.exercise_count !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleOpenEdit(m)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Edit Movement Pattern Dialog */}
      <Dialog open={!!editingPattern} onOpenChange={(open) => !open && setEditingPattern(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Movement Pattern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs">Movement</Label>
              <p className="text-sm font-medium">{editingPattern?.movement}</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="text-muted-foreground text-xs">Muscle Group</Label>
                <p className="text-sm">{editingPattern?.muscle_group || '--'}</p>
              </div>
              <div className="flex-1">
                <Label className="text-muted-foreground text-xs">Subdivision</Label>
                <p className="text-sm">{editingPattern?.subdivision || '--'}</p>
              </div>
            </div>
            <BulletPointEditor
              label="Execution Points"
              points={editForm.executionPoints}
              onChange={(points) => setEditForm({ executionPoints: points })}
              placeholder="Enter execution cue..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPattern(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Movement Pattern Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Movement Pattern</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Muscle Group</Label>
              <Select
                value={addForm.muscleGroup}
                onValueChange={(v) => setAddForm({ ...addForm, muscleGroup: v, subdivision: '' })}
              >
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
            <div className="space-y-1.5">
              <Label>Subdivision</Label>
              <Select
                value={addForm.subdivision}
                onValueChange={(v) => setAddForm({ ...addForm, subdivision: v })}
                disabled={addSubdivisions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={addSubdivisions.length ? 'Select subdivision' : 'No subdivisions'} />
                </SelectTrigger>
                <SelectContent>
                  {addSubdivisions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Movement Name</Label>
              <Input
                value={addForm.movement}
                onChange={(e) => setAddForm({ ...addForm, movement: e.target.value })}
                placeholder="e.g. Incline Press, Hip Hinge..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>
              Cancel
            </Button>
            <Button onClick={handleAddMovement} disabled={addSaving || !addForm.movement.trim()}>
              {addSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
