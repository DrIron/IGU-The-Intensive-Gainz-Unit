import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Video, Clock, CheckCircle2, FileText, Award, PlayCircle, GraduationCap } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { validateVideoUrl } from "@/lib/educationalContent";

type Section = "training" | "library" | "resources";
type ContentType = "video" | "ebook" | "course" | "link";
type Level = "" | "intro" | "advanced";

interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  external_url: string | null;
  cover_url: string | null;
  author: string | null;
  category: string | null;
  level: string | null;
  section: string;
  content_type: string;
  duration_minutes: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  // Computed
  completion_count?: number;
}

interface ContentFormData {
  title: string;
  description: string;
  section: Section;
  content_type: ContentType;
  video_url: string;
  external_url: string;
  cover_url: string;
  author: string;
  category: string;
  level: Level;
  duration_minutes: number;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: ContentFormData = {
  title: "",
  description: "",
  section: "training",
  content_type: "video",
  video_url: "",
  external_url: "",
  cover_url: "",
  author: "",
  category: "",
  level: "",
  duration_minutes: 10,
  is_required: true,
  sort_order: 0,
  is_active: true,
};

const SECTION_LABEL: Record<string, string> = { training: "Training", library: "Library", resources: "Resources" };
const TYPE_LABEL: Record<string, string> = { video: "Video", ebook: "Ebook / PDF", course: "Course", link: "Link" };
// Resources sections are non-video; library/training are video.
const isVideoType = (t: ContentType) => t === "video";

export function CoachEducationalContentManager() {
  const { toast } = useToast();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContentFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const hasFetched = useRef(false);

  const loadContent = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch content
      const { data, error } = await supabase
        .from("coach_educational_content")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      // Fetch completion counts
      const { data: completions } = await supabase
        .from("coach_content_completions")
        .select("content_id");

      const countMap = new Map<string, number>();
      if (completions) {
        for (const c of completions) {
          countMap.set(c.content_id, (countMap.get(c.content_id) || 0) + 1);
        }
      }

      const enriched: ContentItem[] = (data || []).map((item) => ({
        ...item,
        completion_count: countMap.get(item.id) || 0,
      }));

      setContent(enriched);
    } catch (error: unknown) {
      console.error("Error loading content:", error);
      toast({
        title: "Error",
        description: "Failed to load training content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadContent();
  }, [loadContent]);

  const openAddDialog = () => {
    setEditingId(null);
    setFormData({
      ...EMPTY_FORM,
      sort_order: content.length,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: ContentItem) => {
    setEditingId(item.id);
    setFormData({
      title: item.title,
      description: item.description || "",
      section: (item.section as Section) || "training",
      content_type: (item.content_type as ContentType) || "video",
      video_url: item.video_url || "",
      external_url: item.external_url || "",
      cover_url: item.cover_url || "",
      author: item.author || "",
      category: item.category || "",
      level: (item.level as Level) || "",
      duration_minutes: item.duration_minutes,
      is_required: item.is_required,
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Validation", description: "Title is required.", variant: "destructive" });
      return;
    }

    const videoType = isVideoType(formData.content_type);

    if (videoType) {
      if (!formData.video_url.trim()) {
        toast({ title: "Validation", description: "Video URL is required for video content.", variant: "destructive" });
        return;
      }
      const v = validateVideoUrl(formData.video_url);
      if (!v.valid) {
        toast({ title: "Validation", description: v.error, variant: "destructive" });
        return;
      }
    } else if (!formData.external_url.trim()) {
      toast({ title: "Validation", description: "A link/URL is required for this content type.", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        section: formData.section,
        content_type: formData.content_type,
        video_url: videoType ? formData.video_url.trim() : null,
        external_url: videoType ? (formData.external_url.trim() || null) : formData.external_url.trim(),
        cover_url: formData.cover_url.trim() || null,
        author: formData.author.trim() || null,
        category: formData.category.trim() || null,
        level: formData.level || null,
        duration_minutes: formData.duration_minutes,
        is_required: formData.section === "training" ? formData.is_required : false,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("coach_educational_content")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Updated", description: "Training content updated." });
      } else {
        const { error } = await supabase
          .from("coach_educational_content")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Created", description: "Training content added." });
      }

      setDialogOpen(false);
      hasFetched.current = false;
      loadContent();
    } catch (error: unknown) {
      console.error("Error saving content:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("coach_educational_content")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Training content removed." });
      hasFetched.current = false;
      loadContent();
    } catch (error: unknown) {
      console.error("Error deleting content:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    }
  };

  const requiredCount = content.filter((c) => c.is_required && c.is_active).length;
  const totalMinutes = content
    .filter((c) => c.is_required && c.is_active)
    .reduce((sum, c) => sum + c.duration_minutes, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading training content...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Coach Training Content</CardTitle>
              <CardDescription>
                Manage required and optional training videos for new coaches.{" "}
                {requiredCount} required videos ({totalMinutes} min total).
              </CardDescription>
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Content
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {content.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No training content yet. Add videos above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Section</TableHead>
                  <TableHead className="w-24">Duration</TableHead>
                  <TableHead className="w-24">Required</TableHead>
                  <TableHead className="w-24">Active</TableHead>
                  <TableHead className="w-28">Completions</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.map((item) => (
                  <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                    <TableCell className="text-muted-foreground">{item.sort_order + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.content_type === "ebook" || item.content_type === "link" ? (
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : item.content_type === "course" ? (
                          <Award className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : item.section === "training" ? (
                          <GraduationCap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <PlayCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          {(item.category || item.author) && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{item.category || item.author}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{SECTION_LABEL[item.section] ?? item.section}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.content_type === "video" ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.duration_minutes}m
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{TYPE_LABEL[item.content_type] ?? "--"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.is_required ? (
                        <Badge variant="default" className="text-xs">Required</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.is_active ? (
                        <Badge className="text-xs bg-green-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        {item.completion_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Training Content" : "Add Training Content"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the training video details." : "Add a new training video for coaches."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., IGU Coaching Standards"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this training module..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={formData.section}
                  onValueChange={(value) => {
                    const section = value as Section;
                    // Resources default to ebook; training/library stay video.
                    const content_type: ContentType = section === "resources" ? "ebook" : "video";
                    setFormData((f) => ({ ...f, section, content_type }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="training">Training (onboarding gate)</SelectItem>
                    <SelectItem value="library">Library (advanced videos)</SelectItem>
                    <SelectItem value="resources">Resources (ebooks / courses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Content type</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value) => setFormData((f) => ({ ...f, content_type: value as ContentType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {formData.section === "resources" ? (
                      <>
                        <SelectItem value="ebook">Ebook / PDF</SelectItem>
                        <SelectItem value="course">Course / certification</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="video">Video</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isVideoType(formData.content_type) ? (
              <div className="space-y-2">
                <Label>Video URL *</Label>
                <Input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{formData.content_type === "ebook" ? "PDF / file URL *" : "External URL *"}</Label>
                <Input
                  type="url"
                  value={formData.external_url}
                  onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">Opens in a new tab. Host the file externally and paste the link.</p>
              </div>
            )}

            {formData.section !== "training" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder={formData.section === "library" ? "e.g., Programming" : "e.g., Nutrition"}
                  />
                </div>
                {formData.section === "library" ? (
                  <div className="space-y-2">
                    <Label>Level</Label>
                    <Select
                      value={formData.level || "none"}
                      onValueChange={(value) => setFormData((f) => ({ ...f, level: value === "none" ? "" : (value as Level) }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No level</SelectItem>
                        <SelectItem value="intro">Intro</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Author / provider</Label>
                    <Input
                      value={formData.author}
                      onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                      placeholder="e.g., Precision Nutrition"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {isVideoType(formData.content_type) && (
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {formData.section === "training" && (
              <div className="flex items-center justify-between">
                <Label htmlFor="is-required">Required for activation</Label>
                <Switch
                  id="is-required"
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="is-active">Active (visible to coaches)</Label>
              <Switch
                id="is-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Add Content"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
