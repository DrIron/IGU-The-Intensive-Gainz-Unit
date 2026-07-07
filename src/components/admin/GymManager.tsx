import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MapPin, ArrowUp, ArrowDown, Trash2, Loader2, Plus } from "lucide-react";
import { useGyms, type Gym } from "@/hooks/useGyms";

/**
 * Admin CRUD for the managed gyms vocabulary (mirrors SpecializationTagManager).
 * Add (name + area), toggle is_active, reorder, delete. Writes `gyms` directly
 * (admin RLS). Adding/activating a gym surfaces it in onboarding with no deploy.
 */
export function GymManager() {
  const queryClient = useQueryClient();
  const { gyms, loading: isLoading, error } = useGyms({ includeInactive: true });

  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gyms"] });

  const addMutation = useMutation({
    mutationFn: async ({ name, area }: { name: string; area: string }) => {
      const maxOrder = gyms.reduce((max, g) => Math.max(max, g.sort_order), 0);
      const { error } = await supabase
        .from("gyms")
        .insert({ name, area: area || null, sort_order: maxOrder + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setNewName("");
      setNewArea("");
      toast.success("Gym added");
    },
    onError: (err: unknown) => {
      console.error("Error adding gym:", err);
      toast.error("Failed to add gym");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Gym> }) => {
      const { error } = await supabase.from("gyms").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to update gym"),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ a, b }: { a: Gym; b: Gym }) => {
      const { error: e1 } = await supabase.from("gyms").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("gyms").update({ sort_order: a.sort_order }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to reorder gyms"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gyms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Gym deleted");
    },
    onError: () => toast.error("Failed to delete gym"),
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (name.length < 2) {
      toast.error("Gym name must be at least 2 characters");
      return;
    }
    if (gyms.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A gym with this name already exists");
      return;
    }
    addMutation.mutate({ name, area: newArea.trim() });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading gyms...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">Failed to load gyms.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <CardTitle>Gyms</CardTitle>
        </div>
        <CardDescription>
          Manage the gyms clients can pick during onboarding and coaches tag on their profile.
          In-person / hybrid clients are matched to coaches who train at the same gym.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Input
            placeholder="Name (e.g., Oxygen Jabriya)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            maxLength={80}
            className="max-w-[240px]"
          />
          <Input
            placeholder="Area (e.g., Jabriya)"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            maxLength={80}
            className="max-w-[200px]"
          />
          <Button onClick={handleAdd} disabled={addMutation.isPending || !newName.trim()}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="w-[100px] text-center">Active</TableHead>
              <TableHead className="w-[100px] text-center">Order</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gyms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No gyms yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              gyms.map((gym, index) => (
                <TableRow key={gym.id} className={!gym.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-muted-foreground">{gym.sort_order}</TableCell>
                  <TableCell className="font-medium">{gym.name}</TableCell>
                  <TableCell className="text-muted-foreground">{gym.area || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={gym.is_active}
                      onCheckedChange={() => updateMutation.mutate({ id: gym.id, updates: { is_active: !gym.is_active } })}
                      disabled={updateMutation.isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => index > 0 && reorderMutation.mutate({ a: gyms[index], b: gyms[index - 1] })}
                        disabled={index === 0 || reorderMutation.isPending}
                        className="h-8 w-8"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => index < gyms.length - 1 && reorderMutation.mutate({ a: gyms[index], b: gyms[index + 1] })}
                        disabled={index === gyms.length - 1 || reorderMutation.isPending}
                        className="h-8 w-8"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Gym</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete "{gym.name}"? Coaches tagged to this gym lose that tag (coach_gyms
                            cascades). Prefer toggling it inactive to keep history.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(gym.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
