import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, UserPlus, Loader2, DollarSign, AlertTriangle,
  Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/integrations/supabase/types";

type StaffSpecialty = Database["public"]["Enums"]["staff_specialty"];

interface AvailableSpecialist {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  specialties: StaffSpecialty[] | null;
  profile_picture_url: string | null;
}

interface ExistingMember {
  staff_user_id: string;
  specialty: StaffSpecialty;
}

interface AddonCatalogItem {
  id: string;
  specialty: StaffSpecialty;
  default_name: string;
  default_price_kwd: number;
  default_payout_kwd: number;
  is_active: boolean;
}

interface AddSpecialistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  subscriptionId: string;
  existingTeam: ExistingMember[];
  onSuccess: () => void;
}

const SPECIALTY_OPTIONS: { value: StaffSpecialty; label: string; icon: React.ElementType }[] = [
  { value: "nutrition", label: "Nutrition", icon: Apple },
  { value: "lifestyle", label: "Lifestyle", icon: Heart },
  { value: "bodybuilding", label: "Bodybuilding", icon: Dumbbell },
  { value: "powerlifting", label: "Powerlifting", icon: Medal },
  { value: "running", label: "Running", icon: PersonStanding },
  { value: "calisthenics", label: "Calisthenics", icon: Accessibility },
  { value: "mobility", label: "Mobility", icon: Activity },
  { value: "physiotherapy", label: "Physiotherapy", icon: Heart },
];

export function AddSpecialistDialog({
  open,
  onOpenChange,
  clientId,
  subscriptionId,
  existingTeam,
  onSuccess,
}: AddSpecialistDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [specialists, setSpecialists] = useState<AvailableSpecialist[]>([]);
  const [filteredSpecialists, setFilteredSpecialists] = useState<AvailableSpecialist[]>([]);
  const [addonCatalog, setAddonCatalog] = useState<AddonCatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<StaffSpecialty | "all">("all");
  const [selectedSpecialist, setSelectedSpecialist] = useState<AvailableSpecialist | null>(null);
  const [assignedSpecialty, setAssignedSpecialty] = useState<StaffSpecialty | "">("");
  const [assignedScope, setAssignedScope] = useState<"read" | "write">("write");
  const [createBillableAddon, setCreateBillableAddon] = useState(true);

  const resetForm = () => {
    setSearchQuery("");
    setSelectedSpecialty("all");
    setSelectedSpecialist(null);
    setAssignedSpecialty("");
    setAssignedScope("write");
    setCreateBillableAddon(true);
  };

  const fetchAddonCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from("addon_catalog")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      setAddonCatalog(data || []);
    } catch (error: any) {
      console.error("Error fetching addon catalog:", error);
    }
  };

  const fetchSpecialists = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all active coaches with specialties
      const { data, error } = await supabase
        .from("coaches")
        .select("id, user_id, first_name, last_name, specialties, profile_picture_url")
        .eq("status", "active");

      if (error) throw error;

      // Filter out specialists already on the team for the same specialty
      const existingMap = new Set(
        existingTeam.map(m => `${m.staff_user_id}-${m.specialty}`)
      );

      const available = (data || []).filter(coach => {
        // Keep coaches who have at least one specialty not already assigned
        if (!coach.specialties || coach.specialties.length === 0) return false;
        return coach.specialties.some(
          (s: StaffSpecialty) => !existingMap.has(`${coach.user_id}-${s}`)
        );
      });

      setSpecialists(available as AvailableSpecialist[]);
    } catch (error: any) {
      console.error("Error fetching specialists:", error);
      toast({
        title: "Error",
        description: "Failed to load specialists",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [existingTeam, toast]);

  const filterSpecialists = useCallback(() => {
    let filtered = specialists;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.first_name.toLowerCase().includes(query) ||
        (s.last_name && s.last_name.toLowerCase().includes(query))
      );
    }

    // Filter by specialty
    if (selectedSpecialty !== "all") {
      filtered = filtered.filter(s => 
        s.specialties?.includes(selectedSpecialty)
      );
    }

    setFilteredSpecialists(filtered);
  }, [searchQuery, selectedSpecialty, specialists]);

  useEffect(() => {
    if (open) {
      fetchSpecialists();
      fetchAddonCatalog();
      resetForm();
    }
  }, [open, fetchSpecialists]);

  useEffect(() => {
    filterSpecialists();
  }, [filterSpecialists]);

  const handleSelectSpecialist = (specialist: AvailableSpecialist) => {
    setSelectedSpecialist(specialist);
    // Auto-select first available specialty
    if (specialist.specialties && specialist.specialties.length > 0) {
      const existingForUser = existingTeam
        .filter(m => m.staff_user_id === specialist.user_id)
        .map(m => m.specialty);
      const availableSpecialty = specialist.specialties.find(
        s => !existingForUser.includes(s)
      );
      if (availableSpecialty) {
        setAssignedSpecialty(availableSpecialty);
      }
    }
  };

  const getAddonPricing = (specialty: StaffSpecialty) => {
    return addonCatalog.find(a => a.specialty === specialty);
  };

  const handleSubmit = async () => {
    if (!selectedSpecialist || !assignedSpecialty) {
      toast({
        title: "Missing selection",
        description: "Please select a specialist and specialty",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      // Get current user for added_by
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Insert care team assignment with scope
      const { error: careTeamError } = await supabase
        .from("care_team_assignments")
        .insert({
          client_id: clientId,
          subscription_id: subscriptionId,
          staff_user_id: selectedSpecialist.user_id,
          specialty: assignedSpecialty,
          scope: assignedScope,
          is_billable: createBillableAddon,
          added_by: user.id,
        });

      if (careTeamError) throw careTeamError;

      // Create billable addon if requested
      if (createBillableAddon) {
        const addonPricing = getAddonPricing(assignedSpecialty);
        if (addonPricing) {
          const { error: addonError } = await supabase
            .from("subscription_addons")
            .insert({
              subscription_id: subscriptionId,
              client_id: clientId,
              specialty: assignedSpecialty,
              staff_user_id: selectedSpecialist.user_id,
              name: addonPricing.default_name,
              price_kwd: addonPricing.default_price_kwd,
              payout_kwd: addonPricing.default_payout_kwd,
              billing_type: "recurring",
              created_by: user.id,
            });

          if (addonError) {
            console.error("Error creating addon:", addonError);
            // Don't fail the whole operation, just log it
          }
        }
      }

      toast({
        title: "Specialist added",
        description: `${selectedSpecialist.first_name} has been added to the care team as a ${assignedSpecialty} specialist.${createBillableAddon ? " Billing will apply next cycle." : ""}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding specialist:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getAvailableSpecialtiesForUser = (specialist: AvailableSpecialist) => {
    const existingForUser = existingTeam
      .filter(m => m.staff_user_id === specialist.user_id)
      .map(m => m.specialty);
    return (specialist.specialties || []).filter(s => !existingForUser.includes(s));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Specialist
          </DialogTitle>
          <DialogDescription>
            Add a specialist to this client's care team. They will gain access to the client's relevant data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedSpecialty} onValueChange={(v) => setSelectedSpecialty(v as StaffSpecialty | "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Specialty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialties</SelectItem>
                {SPECIALTY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Specialists List */}
          <div className="border rounded-lg">
            <ScrollArea className="h-[200px]">
              {loading ? (
                <div className="flex items-center justify-center h-full py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSpecialists.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No matching specialists found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredSpecialists.map((specialist) => (
                    <div
                      key={specialist.id}
                      className={`p-3 cursor-pointer transition-colors ${
                        selectedSpecialist?.id === specialist.id
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleSelectSpecialist(specialist)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            {specialist.profile_picture_url ? (
                              <img 
                                src={specialist.profile_picture_url} 
                                alt={specialist.first_name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-sm font-medium">
                                {specialist.first_name.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {specialist.first_name} {specialist.last_name || ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-[120px] justify-end">
                          {getAvailableSpecialtiesForUser(specialist).slice(0, 2).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                          {getAvailableSpecialtiesForUser(specialist).length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{getAvailableSpecialtiesForUser(specialist).length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Selected Specialist Details */}
          {selectedSpecialist && (
            <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Selected:</span>
                <span className="text-sm">
                  {selectedSpecialist.first_name} {selectedSpecialist.last_name || ''}
                </span>
              </div>
              <div className="space-y-2">
                <Label>Assign as specialty:</Label>
                <Select value={assignedSpecialty} onValueChange={(v) => setAssignedSpecialty(v as StaffSpecialty)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialty for this assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableSpecialtiesForUser(selectedSpecialist).map((s) => {
                      const opt = SPECIALTY_OPTIONS.find(o => o.value === s);
                      const pricing = getAddonPricing(s);
                      return (
                        <SelectItem key={s} value={s}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{opt?.label || s}</span>
                            {pricing && (
                              <span className="text-xs text-muted-foreground">
                                +{pricing.default_price_kwd} KWD/mo
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Scope selection */}
              <div className="space-y-2">
                <Label>Access level:</Label>
                <Select value={assignedScope} onValueChange={(v) => setAssignedScope(v as "read" | "write")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="write">
                      <div className="flex flex-col">
                        <span className="font-medium">Full access (write)</span>
                        <span className="text-xs text-muted-foreground">Can view and modify client data</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="read">
                      <div className="flex flex-col">
                        <span className="font-medium">View only (read)</span>
                        <span className="text-xs text-muted-foreground">Can only view client data</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Billing confirmation */}
              {assignedSpecialty && getAddonPricing(assignedSpecialty) && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createBillableAddon"
                      checked={createBillableAddon}
                      onCheckedChange={(checked) => setCreateBillableAddon(!!checked)}
                    />
                    <Label htmlFor="createBillableAddon" className="text-sm font-normal">
                      Add monthly billing for this specialist
                    </Label>
                  </div>
                  
                  {createBillableAddon && (
                    <Alert>
                      <DollarSign className="h-4 w-4" />
                      <AlertDescription>
                        This will add <strong>+{getAddonPricing(assignedSpecialty)?.default_price_kwd} KWD/month</strong> to 
                        the client's subscription starting next billing cycle.
                        <br />
                        <span className="text-muted-foreground text-xs">
                          Specialist payout: {getAddonPricing(assignedSpecialty)?.default_payout_kwd} KWD/month
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!selectedSpecialist || !assignedSpecialty || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Add to Care Team
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
