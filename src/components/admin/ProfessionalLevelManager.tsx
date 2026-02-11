import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, Info } from "lucide-react";
import {
  ProfessionalLevel,
  COACH_RATES,
  DIETITIAN_RATES,
  LEVEL_LABELS,
} from "@/auth/roles";

interface CoachRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  email: string | null;
  coach_level: ProfessionalLevel | null;
  is_head_coach: boolean | null;
  head_coach_specialisation: string | null;
}

interface SpecialistRow {
  id: string;
  user_id: string;
  role: string;
  level: ProfessionalLevel;
  name: string;
}

interface RateRow {
  role: string;
  level: ProfessionalLevel;
  work_type: string;
  hourly_rate_kwd: number;
}

// Track per-coach edits
interface CoachEdit {
  coach_level: ProfessionalLevel;
  is_head_coach: boolean;
  head_coach_specialisation: string;
}

export function ProfessionalLevelManager() {
  const { toast } = useToast();
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [coachEdits, setCoachEdits] = useState<Record<string, CoachEdit>>({});
  const [specialistEdits, setSpecialistEdits] = useState<Record<string, ProfessionalLevel>>({});
  const [savingCoach, setSavingCoach] = useState<string | null>(null);
  const [savingSpecialist, setSavingSpecialist] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch coaches from coaches_full view (includes coach_level, is_head_coach, etc.)
      const { data: coachesData, error: coachesError } = await supabase
        .from("coaches_full")
        .select("user_id, first_name, last_name, status, email, coach_level, is_head_coach, head_coach_specialisation")
        .in("status", ["approved", "active"])
        .order("first_name");

      if (coachesError) throw coachesError;
      setCoaches(coachesData || []);

      // Fetch specialists from staff_professional_info
      const { data: staffData, error: staffError } = await supabase
        .from("staff_professional_info")
        .select("id, user_id, role, level")
        .order("role");

      if (staffError) throw staffError;

      // Get names for specialists
      const staffUserIds = (staffData || []).map(s => s.user_id);
      let staffWithNames: SpecialistRow[] = [];
      if (staffUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", staffUserIds);

        const nameMap = new Map(
          (profiles || []).map(p => [p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown"])
        );

        staffWithNames = (staffData || []).map(s => ({
          ...s,
          name: nameMap.get(s.user_id) || "Unknown",
        }));
      }
      setSpecialists(staffWithNames);

      // Fetch rate reference from professional_levels table
      const { data: ratesData, error: ratesError } = await supabase
        .from("professional_levels")
        .select("role, level, work_type, hourly_rate_kwd")
        .order("role")
        .order("level");

      if (ratesError) throw ratesError;
      setRates(ratesData || []);
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  const getCoachEdit = (coach: CoachRow): CoachEdit => {
    return coachEdits[coach.user_id] || {
      coach_level: coach.coach_level || "junior",
      is_head_coach: coach.is_head_coach || false,
      head_coach_specialisation: coach.head_coach_specialisation || "",
    };
  };

  const updateCoachEdit = (userId: string, field: keyof CoachEdit, value: any) => {
    setCoachEdits(prev => ({
      ...prev,
      [userId]: {
        ...getCoachEditFromState(userId),
        [field]: value,
      },
    }));
  };

  // Helper to get edit state, falling back to coach data
  const getCoachEditFromState = (userId: string): CoachEdit => {
    const coach = coaches.find(c => c.user_id === userId);
    return coachEdits[userId] || {
      coach_level: coach?.coach_level || "junior",
      is_head_coach: coach?.is_head_coach || false,
      head_coach_specialisation: coach?.head_coach_specialisation || "",
    };
  };

  const hasCoachChanges = (coach: CoachRow): boolean => {
    const edit = coachEdits[coach.user_id];
    if (!edit) return false;
    return (
      edit.coach_level !== (coach.coach_level || "junior") ||
      edit.is_head_coach !== (coach.is_head_coach || false) ||
      edit.head_coach_specialisation !== (coach.head_coach_specialisation || "")
    );
  };

  const saveCoach = async (coach: CoachRow) => {
    const edit = getCoachEdit(coach);
    setSavingCoach(coach.user_id);
    try {
      const { error } = await supabase
        .from("coaches_public")
        .update({
          coach_level: edit.coach_level,
          is_head_coach: edit.is_head_coach,
          head_coach_specialisation: edit.head_coach_specialisation || null,
        })
        .eq("user_id", coach.user_id);

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Level updated for ${coach.first_name} ${coach.last_name}`,
      });

      // Clear edit state and refresh
      setCoachEdits(prev => {
        const next = { ...prev };
        delete next[coach.user_id];
        return next;
      });
      hasFetched.current = false;
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSavingCoach(null);
    }
  };

  const saveSpecialist = async (specialist: SpecialistRow) => {
    const newLevel = specialistEdits[specialist.id];
    if (!newLevel || newLevel === specialist.level) return;

    setSavingSpecialist(specialist.id);
    try {
      const { error } = await supabase
        .from("staff_professional_info")
        .update({ level: newLevel })
        .eq("id", specialist.id);

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Level updated for ${specialist.name}`,
      });

      setSpecialistEdits(prev => {
        const next = { ...prev };
        delete next[specialist.id];
        return next;
      });
      hasFetched.current = false;
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error saving",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSavingSpecialist(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ROLE_LABELS: Record<string, string> = {
    coach: "Coach",
    dietitian: "Dietitian",
  };

  const WORK_TYPE_LABELS: Record<string, string> = {
    online: "Online",
    in_person: "In-Person",
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Levels determine hourly payout rates. Changes take effect on the next billing cycle.
          Default level for new professionals is Junior.
        </AlertDescription>
      </Alert>

      {/* Coaches Section */}
      <Card>
        <CardHeader>
          <CardTitle>Coaches</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Head Coach</TableHead>
                <TableHead>HC Specialisation</TableHead>
                <TableHead className="text-right">Online Rate</TableHead>
                <TableHead className="text-right">In-Person Rate</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No active coaches found
                  </TableCell>
                </TableRow>
              ) : (
                coaches.map(coach => {
                  const edit = getCoachEdit(coach);
                  const changed = hasCoachChanges(coach);
                  const rateInfo = COACH_RATES[edit.coach_level];
                  return (
                    <TableRow key={coach.user_id}>
                      <TableCell className="font-medium">
                        {coach.first_name} {coach.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{coach.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.coach_level}
                          onValueChange={(v) => updateCoachEdit(coach.user_id, "coach_level", v as ProfessionalLevel)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="junior">Junior</SelectItem>
                            <SelectItem value="senior">Senior</SelectItem>
                            <SelectItem value="lead">Lead</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={edit.is_head_coach}
                          onCheckedChange={(checked) => updateCoachEdit(coach.user_id, "is_head_coach", checked)}
                        />
                      </TableCell>
                      <TableCell>
                        {edit.is_head_coach ? (
                          <Input
                            value={edit.head_coach_specialisation}
                            onChange={(e) => updateCoachEdit(coach.user_id, "head_coach_specialisation", e.target.value)}
                            placeholder="e.g. Fe Squad"
                            className="w-36"
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{rateInfo.online} KWD/hr</TableCell>
                      <TableCell className="text-right">{rateInfo.in_person} KWD/hr</TableCell>
                      <TableCell>
                        {changed && (
                          <Button
                            size="sm"
                            onClick={() => saveCoach(coach)}
                            disabled={savingCoach === coach.user_id}
                          >
                            {savingCoach === coach.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Specialists Section */}
      {specialists.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Specialists</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Online Rate</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {specialists.map(specialist => {
                  const currentLevel = specialistEdits[specialist.id] || specialist.level;
                  const changed = specialistEdits[specialist.id] && specialistEdits[specialist.id] !== specialist.level;
                  const rate = specialist.role === "dietitian"
                    ? DIETITIAN_RATES[currentLevel]
                    : COACH_RATES[currentLevel].online;
                  return (
                    <TableRow key={specialist.id}>
                      <TableCell className="font-medium">{specialist.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROLE_LABELS[specialist.role] || specialist.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={currentLevel}
                          onValueChange={(v) => setSpecialistEdits(prev => ({ ...prev, [specialist.id]: v as ProfessionalLevel }))}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="junior">Junior</SelectItem>
                            <SelectItem value="senior">Senior</SelectItem>
                            <SelectItem value="lead">Lead</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">{rate} KWD/hr</TableCell>
                      <TableCell>
                        {changed && (
                          <Button
                            size="sm"
                            onClick={() => saveSpecialist(specialist)}
                            disabled={savingSpecialist === specialist.id}
                          >
                            {savingSpecialist === specialist.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Rate Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Rate Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Work Type</TableHead>
                <TableHead className="text-right">Hourly Rate (KWD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate, i) => (
                <TableRow key={i}>
                  <TableCell>{ROLE_LABELS[rate.role] || rate.role}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{LEVEL_LABELS[rate.level] || rate.level}</Badge>
                  </TableCell>
                  <TableCell>{WORK_TYPE_LABELS[rate.work_type] || rate.work_type}</TableCell>
                  <TableCell className="text-right font-medium">{rate.hourly_rate_kwd} KWD</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
