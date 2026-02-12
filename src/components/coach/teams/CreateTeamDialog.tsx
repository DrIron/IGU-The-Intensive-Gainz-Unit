import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Service {
  id: string;
  name: string;
}

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  existingTeamCount: number;
  onCreated: () => void;
  editTeam?: {
    id: string;
    name: string;
    description: string;
    service_id: string;
    max_members: number;
  };
}

const MAX_TEAMS = 3;

export const CreateTeamDialog = memo(function CreateTeamDialog({
  open,
  onOpenChange,
  coachUserId,
  existingTeamCount,
  onCreated,
  editTeam,
}: CreateTeamDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [maxMembers, setMaxMembers] = useState(30);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const loadServices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("type", "team")
        .eq("is_active", true);

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading services",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadServices().then(() => setLoading(false));

      // Pre-fill for edit mode
      if (editTeam) {
        setName(editTeam.name);
        setDescription(editTeam.description);
        setServiceId(editTeam.service_id);
        setMaxMembers(editTeam.max_members);
      } else {
        setName("");
        setDescription("");
        setServiceId("");
        setMaxMembers(30);
      }
    }
  }, [open, editTeam, loadServices]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!serviceId) {
      toast({ title: "Service required", description: "Select a team service.", variant: "destructive" });
      return;
    }

    // Validate max teams for new teams
    if (!editTeam && existingTeamCount >= MAX_TEAMS) {
      toast({
        title: "Team limit reached",
        description: `You can have a maximum of ${MAX_TEAMS} teams.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editTeam) {
        const { error } = await supabase
          .from("coach_teams")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            service_id: serviceId,
            max_members: maxMembers,
          })
          .eq("id", editTeam.id);

        if (error) throw error;
        toast({ title: "Team updated" });
      } else {
        const { error } = await supabase.from("coach_teams").insert({
          coach_id: coachUserId,
          name: name.trim(),
          description: description.trim() || null,
          service_id: serviceId,
          max_members: maxMembers,
        });

        if (error) throw error;
        toast({ title: "Team created" });
      }

      onCreated();
    } catch (error: any) {
      toast({
        title: editTeam ? "Error updating team" : "Error creating team",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editTeam;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team" : "Create Team"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your team details."
              : "Create a new team linked to a team service."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Team Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Fe Squad Morning Group"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this team..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Team Service</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading services...</p>
            ) : (
              <Select value={serviceId} onValueChange={setServiceId} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Service cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Max Members</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxMembers}
              onChange={(e) => setMaxMembers(parseInt(e.target.value) || 30)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !serviceId}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEdit ? "Saving..." : "Creating..."}
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Team"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
