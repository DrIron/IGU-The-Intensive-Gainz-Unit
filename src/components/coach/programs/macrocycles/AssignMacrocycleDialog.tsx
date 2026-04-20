// src/components/coach/programs/macrocycles/AssignMacrocycleDialog.tsx
// Assign a macrocycle to a client (or each active member of a team). Mirrors
// AssignFromLibraryDialog shape but calls assignMacrocycleToClient (which
// fans out to N client_programs with staggered start dates). Dialog on
// desktop, vaul Drawer on mobile.

import { memo, useCallback, useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Loader2, Users, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { cn } from "@/lib/utils";
import { assignMacrocycleToClient } from "@/lib/assignMacrocycle";

interface ClientOption {
  subscriptionId: string;
  userId: string;
  firstName: string;
  lastName: string | null;
}

interface TeamMember {
  subscriptionId: string;
  userId: string;
  firstName: string;
  displayName: string | null;
  status: string;
}

interface TeamOption {
  id: string;
  name: string;
  members: TeamMember[];
}

interface AssignMacrocycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  macrocycleId: string;
  macrocycleName: string;
  coachUserId: string;
  weeksTotal: number;
  blockCount: number;
  onAssigned?: () => void;
}

export const AssignMacrocycleDialog = memo(function AssignMacrocycleDialog({
  open,
  onOpenChange,
  macrocycleId,
  macrocycleName,
  coachUserId,
  weeksTotal,
  blockCount,
  onAssigned,
}: AssignMacrocycleDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [mode, setMode] = useState<"client" | "team">("client");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedClientSub, setSelectedClientSub] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const loadClients = useCallback(async () => {
    try {
      const { data: subs, error } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("coach_id", coachUserId)
        .eq("status", "active");
      if (error) throw error;
      const list: ClientOption[] = [];
      for (const sub of subs ?? []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", sub.user_id)
          .maybeSingle();
        if (profile) {
          list.push({
            subscriptionId: sub.id,
            userId: sub.user_id,
            firstName: profile.first_name || "Unknown",
            lastName: profile.last_name,
          });
        }
      }
      list.sort((a, b) => a.firstName.localeCompare(b.firstName));
      setClients(list);
    } catch (e: unknown) {
      toast({ title: "Error loading clients", description: sanitizeErrorForUser(e), variant: "destructive" });
    }
  }, [coachUserId, toast]);

  const loadTeams = useCallback(async () => {
    try {
      const { data: teamData, error } = await supabase
        .from("coach_teams")
        .select("id, name")
        .eq("coach_id", coachUserId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const list: TeamOption[] = [];
      for (const team of teamData ?? []) {
        const { data: memberSubs } = await supabase
          .from("subscriptions")
          .select("id, user_id, status")
          .eq("team_id", team.id)
          .in("status", ["pending", "active"]);
        const members: TeamMember[] = [];
        for (const sub of memberSubs ?? []) {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", sub.user_id)
            .maybeSingle();
          if (profile) {
            members.push({
              subscriptionId: sub.id,
              userId: sub.user_id,
              firstName: profile.first_name || "Unknown",
              displayName: profile.display_name,
              status: sub.status,
            });
          }
        }
        list.push({ id: team.id, name: team.name, members });
      }
      setTeams(list);
    } catch (e: unknown) {
      toast({ title: "Error loading teams", description: sanitizeErrorForUser(e), variant: "destructive" });
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedClientSub("");
    setSelectedTeamId("");
    setStartDate(new Date());
    setErrors([]);
    setProgress({ current: 0, total: 0 });
    Promise.all([loadClients(), loadTeams()]).finally(() => setLoading(false));
  }, [open, loadClients, loadTeams]);

  const handleAssignClient = async () => {
    const client = clients.find(c => c.subscriptionId === selectedClientSub);
    if (!client) return;
    setAssigning(true);
    try {
      const result = await assignMacrocycleToClient({
        coachUserId,
        clientUserId: client.userId,
        subscriptionId: client.subscriptionId,
        macrocycleId,
        startDate,
      });
      if (!result.success) throw new Error(result.error || "Assignment failed");
      toast({
        title: "Macrocycle assigned",
        description: `"${macrocycleName}" scheduled for ${client.firstName} across ${result.weeksTotal} weeks.`,
      });
      onOpenChange(false);
      onAssigned?.();
    } catch (e: unknown) {
      toast({ title: "Assignment failed", description: sanitizeErrorForUser(e), variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignTeam = async () => {
    const team = teams.find(t => t.id === selectedTeamId);
    if (!team) return;
    const active = team.members.filter(m => m.status === "active");
    if (active.length === 0) {
      toast({ title: "No active members", description: "This team has no active members.", variant: "destructive" });
      return;
    }
    setAssigning(true);
    setProgress({ current: 0, total: active.length });
    setErrors([]);
    const errs: string[] = [];
    let ok = 0;
    for (let i = 0; i < active.length; i++) {
      const m = active[i];
      setProgress({ current: i + 1, total: active.length });
      const r = await assignMacrocycleToClient({
        coachUserId,
        clientUserId: m.userId,
        subscriptionId: m.subscriptionId,
        macrocycleId,
        startDate,
        teamId: team.id,
      });
      if (r.success) ok++;
      else errs.push(`${m.displayName || m.firstName}: ${r.error}`);
    }
    setErrors(errs);
    if (errs.length === 0) {
      toast({ title: "Macrocycle assigned", description: `Assigned to ${ok} team members.` });
      onOpenChange(false);
      onAssigned?.();
    } else if (ok > 0) {
      toast({
        title: "Partial success",
        description: `${ok} of ${active.length} assigned. ${errs.length} failed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Assignment failed",
        description: "No members were assigned.",
        variant: "destructive",
      });
    }
    setAssigning(false);
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const activeTeamMembers = selectedTeam?.members.filter(m => m.status === "active") ?? [];
  const endDate = addDays(startDate, weeksTotal * 7 - 1);

  const body = (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={v => setMode(v as "client" | "team")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="client">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Client
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Team
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "client" ? (
        <div className="space-y-2">
          <Label>Select Client</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active clients.</p>
          ) : (
            <Select value={selectedClientSub} onValueChange={setSelectedClientSub}>
              <SelectTrigger className={cn(isMobile && "h-10 text-base")}>
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.subscriptionId} value={c.subscriptionId}>
                    {c.firstName}
                    {c.lastName ? ` ${c.lastName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Select Team</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active teams.</p>
          ) : (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className={cn(isMobile && "h-10 text-base")}>
                <SelectValue placeholder="Choose a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.members.filter(m => m.status === "active").length} active)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedTeam && (
            <p className="text-xs text-muted-foreground">
              {activeTeamMembers.length} active member{activeTeamMembers.length !== 1 ? "s" : ""} will receive the macrocycle.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Start Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                isMobile && "h-10 text-base",
                !startDate && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={d => d && setStartDate(d)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs space-y-0.5">
        <p className="text-muted-foreground">
          <strong className="text-foreground">{blockCount}</strong> mesocycle{blockCount !== 1 ? "s" : ""} ·{" "}
          <strong className="text-foreground">{weeksTotal}</strong> week{weeksTotal !== 1 ? "s" : ""}
        </p>
        {weeksTotal > 0 && (
          <p className="text-muted-foreground">
            Ends <strong className="text-foreground">{format(endDate, "PP")}</strong>
          </p>
        )}
      </div>

      {assigning && mode === "team" && (
        <div className="space-y-2">
          <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} />
          <p className="text-sm text-center text-muted-foreground">
            Assigning {progress.current} / {progress.total}...
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-1">
          <p className="text-sm font-medium text-destructive">Failed assignments:</p>
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive/80">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>
        Cancel
      </Button>
      {mode === "client" ? (
        <Button onClick={handleAssignClient} disabled={!selectedClientSub || assigning}>
          {assigning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Assigning...
            </>
          ) : (
            "Assign"
          )}
        </Button>
      ) : (
        <Button
          onClick={handleAssignTeam}
          disabled={!selectedTeamId || assigning || activeTeamMembers.length === 0}
        >
          {assigning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Assigning...
            </>
          ) : (
            `Assign to ${activeTeamMembers.length} member${activeTeamMembers.length !== 1 ? "s" : ""}`
          )}
        </Button>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>Assign macrocycle</DrawerTitle>
            <DrawerDescription>
              Schedule "{macrocycleName}" with staggered mesocycle start dates.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2 overflow-y-auto flex-1">{body}</div>
          <DrawerFooter className="pt-2">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign macrocycle</DialogTitle>
          <DialogDescription>
            Schedule "{macrocycleName}" with staggered mesocycle start dates.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
