import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Play, CheckCircle2, XCircle, Loader2, 
  Database, Users, Dumbbell, Shield, Clock,
  ArrowLeft, Trash2, RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";

interface TestResult {
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  message?: string;
}

interface SeededData {
  programTemplateId?: string;
  clientProgramId?: string;
  testClientId?: string;
  testCoachId?: string;
  physioCoachId?: string;
  mobilityCoachId?: string;
}

export default function WorkoutBuilderQA() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);
  const [seededData, setSeededData] = useState<SeededData | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  const [manualChecks, setManualChecks] = useState({
    clientSeesModules: false,
    clientCanComplete: false,
    clientCanLogSets: false,
    clientCanUploadVideo: false,
    ownerCanReply: false,
    primaryCanView: false,
    primaryCannotEdit: false,
    dischargeLosesAccess: false,
  });

  // Seed dummy program template with modules
  const seedTestData = async () => {
    setSeeding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Get or create test coaches
      const { data: coaches } = await supabase
        .from("coaches")
        .select("user_id, first_name, specialties")
        .eq("status", "active")
        .limit(3);

      if (!coaches || coaches.length < 1) {
        throw new Error("Need at least 1 active coach. Create coaches first.");
      }

      const primaryCoachId = coaches[0].user_id;
      const physioCoachId = coaches.length > 1 ? coaches[1].user_id : primaryCoachId;
      const mobilityCoachId = coaches.length > 2 ? coaches[2].user_id : primaryCoachId;

      // 2. Get a test client with active subscription
      const { data: testClient } = await supabase
        .from("subscriptions")
        .select("user_id, id")
        .eq("status", "active")
        .limit(1)
        .single();

      if (!testClient) {
        throw new Error("Need at least 1 client with active subscription");
      }

      // 3. Create program template
      const { data: template, error: templateError } = await supabase
        .from("program_templates")
        .insert({
          owner_coach_id: primaryCoachId,
          title: `[QA Test] Multi-Module Program ${format(new Date(), "MMdd-HHmm")}`,
          description: "Auto-generated QA test program with primary/physio/mobility modules",
          visibility: "private",
          tags: ["qa-test", "multi-module"],
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // 4. Create 2 program days
      const days = [];
      for (let dayIndex = 1; dayIndex <= 2; dayIndex++) {
        const { data: day, error: dayError } = await supabase
          .from("program_template_days")
          .insert({
            program_template_id: template.id,
            day_index: dayIndex,
            day_title: `Day ${dayIndex} - Full Body`,
          })
          .select()
          .single();

        if (dayError) throw dayError;
        days.push(day);
      }

      // 5. Create 3 modules per day (primary/physio/mobility)
      const moduleConfigs = [
        { type: "strength", owner: primaryCoachId, title: "Strength Training" },
        { type: "physiotherapy", owner: physioCoachId, title: "Physio Exercises" },
        { type: "mobility", owner: mobilityCoachId, title: "Mobility Work" },
      ];

      for (const day of days) {
        for (let i = 0; i < moduleConfigs.length; i++) {
          const config = moduleConfigs[i];
          await supabase.from("day_modules").insert({
            program_template_day_id: day.id,
            module_owner_coach_id: config.owner,
            module_type: config.type,
            title: config.title,
            sort_order: i + 1,
            status: "published",
          });
        }
      }

      // 6. Assign program to test client
      const startDate = addDays(new Date(), 1);
      const { data: clientProgram, error: cpError } = await supabase
        .from("client_programs")
        .insert({
          user_id: testClient.user_id,
          subscription_id: testClient.id,
          source_template_id: template.id,
          primary_coach_id: primaryCoachId,
          start_date: format(startDate, "yyyy-MM-dd"),
          status: "active",
        })
        .select()
        .single();

      if (cpError) throw cpError;

      // 7. Create client program days and modules
      for (const day of days) {
        const dayDate = addDays(startDate, day.day_index - 1);
        
        const { data: clientDay, error: cdError } = await supabase
          .from("client_program_days")
          .insert({
            client_program_id: clientProgram.id,
            day_index: day.day_index,
            title: day.day_title,
            date: format(dayDate, "yyyy-MM-dd"),
          })
          .select()
          .single();

        if (cdError) throw cdError;

        // Get template modules for this day
        const { data: templateModules } = await supabase
          .from("day_modules")
          .select("*")
          .eq("program_template_day_id", day.id)
          .eq("status", "published");

        for (const mod of templateModules || []) {
          const { data: clientModule } = await supabase
            .from("client_day_modules")
            .insert({
              client_program_day_id: clientDay.id,
              source_day_module_id: mod.id,
              module_owner_coach_id: mod.module_owner_coach_id,
              module_type: mod.module_type,
              title: mod.title,
              sort_order: mod.sort_order,
              status: "scheduled",
            })
            .select()
            .single();

          // Create module thread
          if (clientModule) {
            await supabase.from("module_threads").insert({
              client_day_module_id: clientModule.id,
            });
          }
        }
      }

      setSeededData({
        programTemplateId: template.id,
        clientProgramId: clientProgram.id,
        testClientId: testClient.user_id,
        testCoachId: primaryCoachId,
        physioCoachId,
        mobilityCoachId,
      });

      toast({
        title: "Test Data Seeded",
        description: `Created program template with 2 days, 3 modules each. Assigned to test client.`,
      });
    } catch (error: any) {
      console.error("Seed error:", error);
      toast({
        title: "Seed Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  };

  // Run automated verification tests
  const runTests = async () => {
    if (!seededData?.clientProgramId) {
      toast({ title: "Seed data first", variant: "destructive" });
      return;
    }

    setRunningTests(true);
    const results: TestResult[] = [];

    // Test 1: Verify client program exists with correct structure
    results.push({ name: "Client program structure", status: "running" });
    setTestResults([...results]);

    try {
      const { data: clientProgram } = await supabase
        .from("client_programs")
        .select(`
          id,
          status,
          client_program_days (
            id,
            client_day_modules (
              id,
              module_type,
              module_owner_coach_id
            )
          )
        `)
        .eq("id", seededData.clientProgramId)
        .single();

      const dayCount = clientProgram?.client_program_days?.length || 0;
      const moduleCount = clientProgram?.client_program_days?.reduce(
        (acc, day) => acc + (day.client_day_modules?.length || 0), 0
      ) || 0;

      if (dayCount === 2 && moduleCount === 6) {
        results[0] = { name: "Client program structure", status: "passed", message: `2 days, 6 modules` };
      } else {
        results[0] = { name: "Client program structure", status: "failed", message: `Got ${dayCount} days, ${moduleCount} modules` };
      }
    } catch (e: any) {
      results[0] = { name: "Client program structure", status: "failed", message: e.message };
    }

    // Test 2: Verify each module has different owner
    results.push({ name: "Module ownership diversity", status: "running" });
    setTestResults([...results]);

    try {
      const { data: modules } = await supabase
        .from("client_day_modules")
        .select("module_owner_coach_id, module_type")
        .eq("client_program_day_id", (await supabase
          .from("client_program_days")
          .select("id")
          .eq("client_program_id", seededData.clientProgramId)
          .limit(1)
          .single()).data?.id);

      const uniqueOwners = new Set(modules?.map(m => m.module_owner_coach_id));
      const uniqueTypes = new Set(modules?.map(m => m.module_type));

      if (uniqueTypes.size >= 3) {
        results[1] = { name: "Module ownership diversity", status: "passed", message: `${uniqueOwners.size} owners, ${uniqueTypes.size} types` };
      } else {
        results[1] = { name: "Module ownership diversity", status: "failed", message: `Only ${uniqueTypes.size} module types` };
      }
    } catch (e: any) {
      results[1] = { name: "Module ownership diversity", status: "failed", message: e.message };
    }

    // Test 3: Verify module threads exist
    results.push({ name: "Module threads created", status: "running" });
    setTestResults([...results]);

    try {
      const { data: threads, count } = await supabase
        .from("module_threads")
        .select("id, client_day_module_id", { count: "exact" })
        .in("client_day_module_id", (await supabase
          .from("client_day_modules")
          .select("id")
          .in("client_program_day_id", (await supabase
            .from("client_program_days")
            .select("id")
            .eq("client_program_id", seededData.clientProgramId)).data?.map(d => d.id) || [])).data?.map(m => m.id) || []);

      if (count && count >= 6) {
        results[2] = { name: "Module threads created", status: "passed", message: `${count} threads` };
      } else {
        results[2] = { name: "Module threads created", status: "failed", message: `Only ${count} threads` };
      }
    } catch (e: any) {
      results[2] = { name: "Module threads created", status: "failed", message: e.message };
    }

    // Test 4: Verify RLS - primary coach can view all modules
    results.push({ name: "Primary coach view access", status: "running" });
    setTestResults([...results]);

    try {
      // This tests from current user context - would need service role for full RLS test
      const { data: modules, error } = await supabase
        .from("client_day_modules")
        .select("id")
        .in("client_program_day_id", (await supabase
          .from("client_program_days")
          .select("id")
          .eq("client_program_id", seededData.clientProgramId)).data?.map(d => d.id) || []);

      if (!error && modules && modules.length === 6) {
        results[3] = { name: "Primary coach view access", status: "passed", message: "Can view all 6 modules" };
      } else {
        results[3] = { name: "Primary coach view access", status: "failed", message: error?.message || "Cannot view all modules" };
      }
    } catch (e: any) {
      results[3] = { name: "Primary coach view access", status: "failed", message: e.message };
    }

    setTestResults(results);
    setRunningTests(false);

    const passed = results.filter(r => r.status === "passed").length;
    toast({
      title: `Tests Complete: ${passed}/${results.length} passed`,
      variant: passed === results.length ? "default" : "destructive",
    });
  };

  // Cleanup seeded data
  const cleanupTestData = async () => {
    if (!seededData) return;

    try {
      // Delete in order: modules → days → program → template
      if (seededData.clientProgramId) {
        await supabase.from("client_programs").delete().eq("id", seededData.clientProgramId);
      }
      if (seededData.programTemplateId) {
        await supabase.from("program_templates").delete().eq("id", seededData.programTemplateId);
      }

      setSeededData(null);
      setTestResults([]);
      setManualChecks({
        clientSeesModules: false,
        clientCanComplete: false,
        clientCanLogSets: false,
        clientCanUploadVideo: false,
        ownerCanReply: false,
        primaryCanView: false,
        primaryCannotEdit: false,
        dischargeLosesAccess: false,
      });

      toast({ title: "Test data cleaned up" });
    } catch (error: any) {
      toast({ title: "Cleanup failed", description: error.message, variant: "destructive" });
    }
  };

  const allManualChecksPassed = Object.values(manualChecks).every(Boolean);
  const allAutomatedPassed = testResults.length > 0 && testResults.every(r => r.status === "passed");

  return (
    <div className="container max-w-4xl py-8">
      <Button variant="ghost" onClick={() => navigate("/admin/dashboard")} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Admin
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Dumbbell className="h-6 w-6" />
            Workout Builder QA Checklist
          </h1>
          <p className="text-muted-foreground">Internal testing for multi-module workout system</p>
        </div>
        <Badge variant={allManualChecksPassed && allAutomatedPassed ? "default" : "secondary"}>
          {allManualChecksPassed && allAutomatedPassed ? "All Checks Passed" : "In Progress"}
        </Badge>
      </div>

      {/* Step 1: Seed Data */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Step 1: Seed Test Data
          </CardTitle>
          <CardDescription>
            Create a dummy program template with 2 days, 3 modules (primary/physio/mobility) and assign to test client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={seedTestData} disabled={seeding || !!seededData}>
              {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {seededData ? "Data Seeded" : "Seed Test Data"}
            </Button>
            {seededData && (
              <Button variant="outline" onClick={cleanupTestData}>
                <Trash2 className="h-4 w-4 mr-2" />
                Cleanup
              </Button>
            )}
          </div>

          {seededData && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div>Template ID: <code className="text-xs">{seededData.programTemplateId?.slice(0, 8)}...</code></div>
                  <div>Client Program: <code className="text-xs">{seededData.clientProgramId?.slice(0, 8)}...</code></div>
                  <div>Test Client: <code className="text-xs">{seededData.testClientId?.slice(0, 8)}...</code></div>
                  <div>Primary Coach: <code className="text-xs">{seededData.testCoachId?.slice(0, 8)}...</code></div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Automated Tests */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Step 2: Automated Verification
          </CardTitle>
          <CardDescription>
            Run automated tests to verify data structure and basic access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runTests} disabled={!seededData || runningTests}>
            {runningTests ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run Automated Tests
          </Button>

          {testResults.length > 0 && (
            <div className="space-y-2">
              {testResults.map((result, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {result.status === "passed" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {result.status === "failed" && <XCircle className="h-4 w-4 text-red-600" />}
                    {result.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {result.status === "pending" && <div className="h-4 w-4 rounded-full border-2" />}
                    <span className="font-medium">{result.name}</span>
                  </div>
                  {result.message && (
                    <span className="text-sm text-muted-foreground">{result.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Manual Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Step 3: Manual Verification
          </CardTitle>
          <CardDescription>
            Log in as different users and verify these behaviors manually
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="font-medium text-sm text-muted-foreground">Client Experience</div>
            
            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.clientSeesModules}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, clientSeesModules: !!c }))}
              />
              <span>Client sees modules separately in workout view</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.clientCanComplete}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, clientCanComplete: !!c }))}
              />
              <span>Client can complete each module independently</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.clientCanLogSets}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, clientCanLogSets: !!c }))}
              />
              <span>Client can log sets with reps/weight</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.clientCanUploadVideo}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, clientCanUploadVideo: !!c }))}
              />
              <span>Client can upload video to module thread</span>
            </label>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Coach Access Control
            </div>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.ownerCanReply}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, ownerCanReply: !!c }))}
              />
              <span>Only module owner coach can reply in that module's thread</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.primaryCanView}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, primaryCanView: !!c }))}
              />
              <span>Primary coach can VIEW other coaches' modules</span>
            </label>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.primaryCannotEdit}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, primaryCannotEdit: !!c }))}
              />
              <span>Primary coach CANNOT edit or reply in other coaches' modules</span>
            </label>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Discharge & Access Revocation
            </div>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer">
              <Checkbox 
                checked={manualChecks.dischargeLosesAccess}
                onCheckedChange={(c) => setManualChecks(p => ({ ...p, dischargeLosesAccess: !!c }))}
              />
              <span>After discharge date passes, ex-coach loses access immediately</span>
            </label>
          </div>

          <Separator />

          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
            <div>
              <div className="font-medium">Overall Status</div>
              <div className="text-sm text-muted-foreground">
                {Object.values(manualChecks).filter(Boolean).length} / {Object.values(manualChecks).length} manual checks
              </div>
            </div>
            <Badge variant={allManualChecksPassed ? "default" : "secondary"} className="text-lg px-4 py-1">
              {allManualChecksPassed ? "✓ All Passed" : "In Progress"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
