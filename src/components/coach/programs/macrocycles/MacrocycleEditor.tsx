// src/components/coach/programs/macrocycles/MacrocycleEditor.tsx
// Create / edit a macrocycle. Desktop renders a two-pane layout (horizontal
// timeline of mesocycle blocks + right-rail MesocyclePicker). Mobile
// reorganises into a single vertical stack with arrow-button reorder and
// a bottom-sheet picker — the timeline format doesn't survive below ~600px.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Plus,
  Trash2,
  Share,
  Replace,
  Loader2,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMacrocycle } from "@/hooks/useMacrocycles";
import { MesocyclePicker } from "./MesocyclePicker";
import { AssignMacrocycleDialog } from "./AssignMacrocycleDialog";
import { cn } from "@/lib/utils";

interface MacrocycleEditorProps {
  coachUserId: string;
  macrocycleId: string | null;  // null = create new
  onBack: () => void;
  onOpenProgram: (programTemplateId: string) => void;
}

/**
 * Inline-editable macrocycle name + description. Auto-saves on blur.
 */
const HeaderMeta = memo(function HeaderMeta({
  name,
  description,
  onChange,
}: {
  name: string;
  description: string;
  onChange: (fields: { name?: string; description?: string }) => void;
}) {
  return (
    <div className="space-y-0.5 min-w-0 flex-1">
      <Input
        value={name}
        onChange={e => onChange({ name: e.target.value })}
        className="text-xl font-bold border-none bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Untitled Macrocycle"
      />
      <Input
        value={description}
        onChange={e => onChange({ description: e.target.value })}
        className="text-xs text-muted-foreground border-none bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Add a description..."
      />
    </div>
  );
});

export function MacrocycleEditor({
  coachUserId,
  macrocycleId: initialId,
  onBack,
  onOpenProgram,
}: MacrocycleEditorProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Local identity — null while we haven't yet inserted a row for a new macrocycle.
  // The moment the coach types a name or adds a block, we insert and settle the id.
  const [macroId, setMacroId] = useState<string | null>(initialId);
  const [name, setName] = useState("Untitled Macrocycle");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<
    Array<{ programTemplateId: string; sequence: number; title: string; description: string | null; weeks: number }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const { macrocycle, loading, reload } = useMacrocycle(macroId);

  // Hydrate local state when we load an existing macrocycle.
  useEffect(() => {
    if (!macrocycle) return;
    setName(macrocycle.name);
    setDescription(macrocycle.description ?? "");
    setBlocks(
      macrocycle.blocks.map(b => ({
        programTemplateId: b.programTemplateId,
        sequence: b.sequence,
        title: b.title,
        description: b.description,
        weeks: b.weeks,
      })),
    );
  }, [macrocycle]);

  // A single in-flight creation promise so `ensureMacroRow` and the
  // debounced `saveMeta` can't both INSERT a row for the same editor.
  // Before this ref, typing a name + clicking a mesocycle within 600ms
  // would race to create two orphan macrocycle rows.
  const creationPromiseRef = useRef<Promise<string> | null>(null);

  /** Resolve the macrocycle id, creating the row once if needed.
   *  Concurrent callers share the same in-flight promise. */
  const ensureMacroRow = useCallback(async (): Promise<string> => {
    if (macroId) return macroId;
    if (creationPromiseRef.current) return creationPromiseRef.current;
    const p = (async () => {
      const { data, error } = await supabase
        .from("macrocycles")
        .insert({ coach_id: coachUserId, name, description: description || null })
        .select("id")
        .single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      setMacroId(id);
      return id;
    })();
    creationPromiseRef.current = p;
    try {
      return await p;
    } finally {
      // Keep the resolved/rejected promise on the ref briefly so near-
      // simultaneous callers after await still see the same settled value.
      // macroId state is the long-term source of truth via setMacroId above.
      creationPromiseRef.current = null;
    }
  }, [coachUserId, macroId, name, description]);

  // Debounced auto-save for header metadata (name + description).
  const metaTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveMeta = useCallback(
    async (next: { name?: string; description?: string }) => {
      setSaving(true);
      try {
        // Coalesce with ensureMacroRow so the first INSERT wins; subsequent
        // saveMeta runs always take the UPDATE path.
        const id = await ensureMacroRow();
        const { error } = await supabase
          .from("macrocycles")
          .update({
            ...(next.name !== undefined ? { name: next.name } : {}),
            ...(next.description !== undefined ? { description: next.description || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
      } catch (e: unknown) {
        toast({ title: "Save failed", description: sanitizeErrorForUser(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [ensureMacroRow, toast],
  );

  const handleHeaderChange = useCallback(
    (fields: { name?: string; description?: string }) => {
      if (fields.name !== undefined) setName(fields.name);
      if (fields.description !== undefined) setDescription(fields.description);
      clearTimeout(metaTimerRef.current);
      metaTimerRef.current = setTimeout(() => saveMeta(fields), 600);
    },
    [saveMeta],
  );

  const addBlock = useCallback(
    async (programTemplateId: string) => {
      if (blocks.some(b => b.programTemplateId === programTemplateId)) {
        toast({ title: "Already in this macrocycle" });
        return;
      }
      setSaving(true);
      try {
        const id = await ensureMacroRow();
        const nextSequence = blocks.length === 0 ? 0 : Math.max(...blocks.map(b => b.sequence)) + 1;
        const { error } = await supabase
          .from("macrocycle_mesocycles")
          .insert({
            macrocycle_id: id,
            program_template_id: programTemplateId,
            sequence: nextSequence,
          });
        if (error) throw error;
        await reload();
      } catch (e: unknown) {
        toast({ title: "Error adding mesocycle", description: sanitizeErrorForUser(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [blocks, ensureMacroRow, reload, toast],
  );

  /** Replace the macrocycle's block list atomically via the RPC. The naive
   *  DELETE+INSERT pattern runs across two PostgREST round-trips — if the
   *  INSERT fails the macrocycle is left permanently empty, which is how
   *  the RPC earns its keep. */
  const replaceBlockOrder = useCallback(
    async (programTemplateIds: string[]) => {
      if (!macroId) return;
      const { error } = await supabase.rpc("reorder_macrocycle_blocks", {
        p_macrocycle_id: macroId,
        p_program_template_ids: programTemplateIds,
      });
      if (error) throw error;
    },
    [macroId],
  );

  const removeBlock = useCallback(
    async (programTemplateId: string) => {
      if (!macroId) return;
      setSaving(true);
      try {
        const remaining = blocks
          .filter(b => b.programTemplateId !== programTemplateId)
          .map(b => b.programTemplateId);
        await replaceBlockOrder(remaining);
        await reload();
      } catch (e: unknown) {
        toast({ title: "Error removing mesocycle", description: sanitizeErrorForUser(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [macroId, blocks, replaceBlockOrder, reload, toast],
  );

  /** Swap two blocks by position (for arrow reorder). Atomic via RPC. */
  const moveBlock = useCallback(
    async (fromIdx: number, toIdx: number) => {
      if (!macroId) return;
      if (fromIdx === toIdx || toIdx < 0 || toIdx >= blocks.length) return;
      setSaving(true);
      try {
        const reordered = [...blocks];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        await replaceBlockOrder(reordered.map(b => b.programTemplateId));
        await reload();
      } catch (e: unknown) {
        toast({ title: "Reorder failed", description: sanitizeErrorForUser(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [macroId, blocks, reload, toast],
  );

  const totalWeeks = useMemo(() => blocks.reduce((sum, b) => sum + b.weeks, 0), [blocks]);
  const excludeIds = blocks.map(b => b.programTemplateId);

  if (loading && initialId) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <HeaderMeta name={name} description={description} onChange={handleHeaderChange} />
        <div className="flex items-center gap-1 shrink-0">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
          {blocks.length > 0 && (
            <Button
              size="sm"
              onClick={() => setAssignOpen(true)}
              disabled={!macroId}
            >
              <Share className="h-4 w-4 mr-1.5" />
              Assign
            </Button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground px-3 py-2 rounded-md border border-border/40 bg-muted/20">
        <span>
          <strong className="text-foreground">{blocks.length}</strong>{" "}
          mesocycle{blocks.length !== 1 ? "s" : ""}
        </span>
        <span>·</span>
        <span>
          <strong className="text-foreground">{totalWeeks}</strong>{" "}
          week{totalWeeks !== 1 ? "s" : ""} total
        </span>
      </div>

      {/* Main editor body */}
      <div className={cn("gap-4", !isMobile && blocks.length > 0 && "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]")}>
        {/* Blocks (timeline on desktop, stack on mobile) */}
        <div className="space-y-2">
          {blocks.length === 0 ? (
            <EmptyBlocks
              isMobile={isMobile}
              onAddClick={() => setMobilePickerOpen(true)}
              picker={
                <MesocyclePicker
                  coachUserId={coachUserId}
                  excludeIds={excludeIds}
                  onPick={addBlock}
                  className="max-h-[420px]"
                />
              }
            />
          ) : isMobile ? (
            // Mobile: vertical stack with connectors
            <div className="space-y-0">
              {blocks.map((b, i) => (
                <div key={b.programTemplateId}>
                  <MobileBlockCard
                    block={b}
                    canMoveUp={i > 0}
                    canMoveDown={i < blocks.length - 1}
                    onMoveUp={() => moveBlock(i, i - 1)}
                    onMoveDown={() => moveBlock(i, i + 1)}
                    onOpen={() => onOpenProgram(b.programTemplateId)}
                    onRemove={() => removeBlock(b.programTemplateId)}
                    weekStart={blocks.slice(0, i).reduce((s, x) => s + x.weeks, 0) + 1}
                  />
                  {i < blocks.length - 1 && <BlockConnector weekStart={blocks.slice(0, i + 1).reduce((s, x) => s + x.weeks, 0) + 1} />}
                </div>
              ))}
              <Drawer open={mobilePickerOpen} onOpenChange={setMobilePickerOpen}>
                <DrawerTrigger asChild>
                  <Button variant="outline" className="w-full h-11 mt-2">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add mesocycle
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[85vh]">
                  <DrawerHeader className="pb-2">
                    <DrawerTitle>Add mesocycle</DrawerTitle>
                  </DrawerHeader>
                  <div className="px-4 pb-6 flex-1 min-h-0 flex flex-col">
                    <MesocyclePicker
                      coachUserId={coachUserId}
                      excludeIds={excludeIds}
                      onPick={id => {
                        addBlock(id);
                        setMobilePickerOpen(false);
                      }}
                      compact
                      className="flex-1 min-h-0"
                    />
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          ) : (
            // Desktop: horizontal timeline
            <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
              {blocks.map((b, i) => (
                <div key={b.programTemplateId} className="flex items-stretch gap-2">
                  <DesktopBlockCard
                    block={b}
                    weekStart={blocks.slice(0, i).reduce((s, x) => s + x.weeks, 0) + 1}
                    canMoveLeft={i > 0}
                    canMoveRight={i < blocks.length - 1}
                    onMoveLeft={() => moveBlock(i, i - 1)}
                    onMoveRight={() => moveBlock(i, i + 1)}
                    onOpen={() => onOpenProgram(b.programTemplateId)}
                    onRemove={() => removeBlock(b.programTemplateId)}
                  />
                  {i < blocks.length - 1 && (
                    <div className="flex items-center text-muted-foreground shrink-0">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop right rail */}
        {!isMobile && blocks.length > 0 && (
          <aside className="hidden lg:flex lg:flex-col lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="p-3 pb-2 shrink-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Add mesocycle
                </p>
              </CardHeader>
              <CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
                <MesocyclePicker
                  coachUserId={coachUserId}
                  excludeIds={excludeIds}
                  onPick={addBlock}
                  className="flex-1 min-h-0"
                />
              </CardContent>
            </Card>
          </aside>
        )}
      </div>

      {/* Assign */}
      {macroId && (
        <AssignMacrocycleDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          macrocycleId={macroId}
          macrocycleName={name}
          coachUserId={coachUserId}
          weeksTotal={totalWeeks}
          blockCount={blocks.length}
        />
      )}
    </div>
  );
}

/* -- block cards ------------------------------------------------------ */

interface BlockProps {
  block: { programTemplateId: string; sequence: number; title: string; description: string | null; weeks: number };
  weekStart: number;
  onOpen: () => void;
  onRemove: () => void;
}

function DesktopBlockCard({
  block,
  weekStart,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onOpen,
  onRemove,
}: BlockProps & {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const weekEnd = weekStart + block.weeks - 1;
  return (
    <Card className="w-64 shrink-0 group hover:border-primary/50 transition-colors cursor-pointer" onClick={onOpen}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              W{weekStart}
              {block.weeks > 1 ? `–${weekEnd}` : ""}
            </p>
            <p className="text-sm font-semibold truncate">{block.title}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-60 hover:opacity-100 shrink-0"
                onClick={e => e.stopPropagation()}
                aria-label="Block actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onOpen(); }}>
                Open program
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveLeft} onClick={e => { e.stopPropagation(); onMoveLeft(); }}>
                <ArrowUp className="h-3.5 w-3.5 mr-2 rotate-[-90deg]" /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveRight} onClick={e => { e.stopPropagation(); onMoveRight(); }}>
                <ArrowDown className="h-3.5 w-3.5 mr-2 rotate-[-90deg]" /> Move right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={e => { e.stopPropagation(); onRemove(); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="text-xs text-muted-foreground">
          {block.weeks} {block.weeks === 1 ? "week" : "weeks"}
        </div>
      </CardContent>
    </Card>
  );
}

function MobileBlockCard({
  block,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onOpen,
  onRemove,
  weekStart,
}: BlockProps & {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const weekEnd = weekStart + block.weeks - 1;
  return (
    <Card className="active:scale-[0.99] transition-transform">
      <CardContent className="p-3 flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex-1 min-w-0 text-left"
          aria-label={`Open ${block.title}`}
        >
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            W{weekStart}
            {block.weeks > 1 ? `–${weekEnd}` : ""} · {block.weeks} {block.weeks === 1 ? "wk" : "wks"}
          </p>
          <p className="text-sm font-semibold truncate">{block.title}</p>
          {block.description && (
            <p className="text-xs text-muted-foreground truncate">{block.description}</p>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Block actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onOpen}>
              <Replace className="h-3.5 w-3.5 mr-2" /> Open program
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
              <ArrowUp className="h-3.5 w-3.5 mr-2" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
              <ArrowDown className="h-3.5 w-3.5 mr-2" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

function BlockConnector({ weekStart }: { weekStart: number }) {
  return (
    <div className="flex items-center gap-2 pl-4 py-1 text-[10px] text-muted-foreground">
      <div className="w-px h-5 bg-border/60" />
      <span>Week {weekStart} →</span>
    </div>
  );
}

function EmptyBlocks({
  isMobile,
  onAddClick,
  picker,
}: {
  isMobile: boolean;
  onAddClick: () => void;
  picker: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <Card className="border-dashed border-border/60">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">No mesocycles yet</p>
          <Drawer>
            <DrawerTrigger asChild>
              <Button size="sm" onClick={onAddClick}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add first mesocycle
              </Button>
            </DrawerTrigger>
          </Drawer>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card className="border-dashed border-border/60 flex items-center justify-center min-h-[200px]">
        <div className="text-center space-y-2 p-6">
          <Calendar className="h-8 w-8 text-muted-foreground/60 mx-auto" />
          <p className="text-sm text-muted-foreground">No mesocycles yet</p>
          <p className="text-xs text-muted-foreground/70">
            Pick from the list to start building your training arc.
          </p>
        </div>
      </Card>
      <Card>
        <CardContent className="p-3">{picker}</CardContent>
      </Card>
    </div>
  );
}
