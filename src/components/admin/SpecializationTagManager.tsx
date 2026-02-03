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
import { Tag, ArrowUp, ArrowDown, Trash2, Loader2, Plus } from "lucide-react";
import { useSpecializationTags, SpecializationTag } from "@/hooks/useSpecializationTags";

/**
 * Admin CRUD component for managing specialization tags.
 * Allows adding, editing, reordering, toggling active status, and deleting tags.
 */
export function SpecializationTagManager() {
  const queryClient = useQueryClient();
  const { data: tags, isLoading, error } = useSpecializationTags({ includeInactive: true });

  const [newTagName, setNewTagName] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: async (name: string) => {
      // Get max display_order
      const maxOrder = tags?.reduce((max, t) => Math.max(max, t.display_order), 0) || 0;

      const { data, error } = await supabase
        .from('specialization_tags')
        .insert({ name, display_order: maxOrder + 1 })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialization-tags'] });
      setNewTagName("");
      setAddingTag(false);
      toast.success("Tag added successfully");
    },
    onError: (error: any) => {
      console.error('Error adding tag:', error);
      if (error.code === '23505') {
        toast.error("A tag with this name already exists");
      } else {
        toast.error("Failed to add tag");
      }
    },
  });

  // Update tag mutation (for active toggle)
  const updateTagMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<SpecializationTag> }) => {
      const { error } = await supabase
        .from('specialization_tags')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialization-tags'] });
    },
    onError: (error) => {
      console.error('Error updating tag:', error);
      toast.error("Failed to update tag");
    },
  });

  // Reorder mutation - swap display_order between two adjacent tags
  const reorderMutation = useMutation({
    mutationFn: async ({ tag1, tag2 }: { tag1: SpecializationTag; tag2: SpecializationTag }) => {
      // Swap display_order values
      const { error: error1 } = await supabase
        .from('specialization_tags')
        .update({ display_order: tag2.display_order })
        .eq('id', tag1.id);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('specialization_tags')
        .update({ display_order: tag1.display_order })
        .eq('id', tag2.id);

      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialization-tags'] });
    },
    onError: (error) => {
      console.error('Error reordering tags:', error);
      toast.error("Failed to reorder tags");
    },
  });

  // Delete tag mutation
  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('specialization_tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialization-tags'] });
      toast.success("Tag deleted successfully");
    },
    onError: (error) => {
      console.error('Error deleting tag:', error);
      toast.error("Failed to delete tag");
    },
  });

  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (trimmed.length < 2) {
      toast.error("Tag name must be at least 2 characters");
      return;
    }
    if (trimmed.length > 50) {
      toast.error("Tag name must be less than 50 characters");
      return;
    }
    // Check for duplicates
    if (tags?.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("A tag with this name already exists");
      return;
    }
    addTagMutation.mutate(trimmed);
  };

  const handleToggleActive = (tag: SpecializationTag) => {
    updateTagMutation.mutate({
      id: tag.id,
      updates: { is_active: !tag.is_active }
    });
  };

  const handleMoveUp = (index: number) => {
    if (!tags || index === 0) return;
    reorderMutation.mutate({ tag1: tags[index], tag2: tags[index - 1] });
  };

  const handleMoveDown = (index: number) => {
    if (!tags || index === tags.length - 1) return;
    reorderMutation.mutate({ tag1: tags[index], tag2: tags[index + 1] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading specialization tags...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">
            Failed to load specialization tags.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <CardTitle>Specialization Tags</CardTitle>
        </div>
        <CardDescription>
          Manage the standardized specialization tags that coaches can select for their profiles.
          These tags help clients find coaches that match their goals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new tag */}
        <div className="flex gap-2">
          <Input
            placeholder="New tag name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            maxLength={50}
            className="max-w-xs"
          />
          <Button
            onClick={handleAddTag}
            disabled={addTagMutation.isPending || !newTagName.trim()}
          >
            {addTagMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add
          </Button>
        </div>

        {/* Tags table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[100px] text-center">Active</TableHead>
              <TableHead className="w-[100px] text-center">Order</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No specialization tags found. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              tags?.map((tag, index) => (
                <TableRow key={tag.id} className={!tag.is_active ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-muted-foreground">
                    {tag.display_order}
                  </TableCell>
                  <TableCell className="font-medium">{tag.name}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={tag.is_active}
                      onCheckedChange={() => handleToggleActive(tag)}
                      disabled={updateTagMutation.isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0 || reorderMutation.isPending}
                        className="h-8 w-8"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === (tags?.length || 0) - 1 || reorderMutation.isPending}
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
                          <AlertDialogTitle>Delete Tag</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{tag.name}"?
                            <br /><br />
                            <strong>Note:</strong> Existing coach profiles that use this tag will keep
                            their current values, but this tag will no longer appear for new selections.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTagMutation.mutate(tag.id)}
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
