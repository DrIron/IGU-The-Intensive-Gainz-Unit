import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { 
  ClipboardCheck, 
  User, 
  Users, 
  ShieldCheck, 
  CreditCard, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserCheck,
  Dumbbell,
  Building2,
  Laptop
} from "lucide-react";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

interface ChecklistSection {
  title: string;
  icon: React.ReactNode;
  items: ChecklistItem[];
}

const testAccounts = [
  { role: "Admin", email: "qa_admin@theigu.com", icon: <ShieldCheck className="h-4 w-4" /> },
  { role: "Coach", email: "qa_coach@theigu.com", icon: <UserCheck className="h-4 w-4" /> },
  { role: "Client (Fe Squad)", email: "qa_fesquad@theigu.com", icon: <Users className="h-4 w-4" /> },
  { role: "Client (1:1 Online)", email: "qa_1on1_online@theigu.com", icon: <Laptop className="h-4 w-4" /> },
  { role: "Client (1:1 In-Person)", email: "qa_1on1_inperson@theigu.com", icon: <Building2 className="h-4 w-4" /> },
];

const checklistSections: ChecklistSection[] = [
  {
    title: "1. Signup & Account Creation",
    icon: <User className="h-5 w-5" />,
    items: [
      { id: "signup-1", label: "New user can create account via /auth" },
      { id: "signup-2", label: "Email confirmation works (or auto-confirm in dev)" },
      { id: "signup-3", label: "Profile record created with status = 'pending'" },
      { id: "signup-4", label: "User redirected to /onboarding after first login" },
    ],
  },
  {
    title: "2. Onboarding Flow",
    icon: <ClipboardCheck className="h-5 w-5" />,
    items: [
      { id: "onboard-1", label: "Step 1: Service selection works (Fe Squad, 1:1 Online, 1:1 In-Person)" },
      { id: "onboard-2", label: "Step 2: Personal details & goals captured" },
      { id: "onboard-3", label: "Step 3: PAR-Q health questions appear and save" },
      { id: "onboard-4", label: "Step 4: Legal documents show with progress indicator" },
      { id: "onboard-5", label: "Coach selection: 'Auto-match' vs 'Choose coach' clear" },
      { id: "onboard-6", label: "In-person booking fields ONLY appear for In-Person/Hybrid" },
      { id: "onboard-7", label: "Submission creates subscription with correct service_id" },
      { id: "onboard-8", label: "No dead-ends or forced refreshes" },
    ],
  },
  {
    title: "3. Medical Review (If Triggered)",
    icon: <AlertTriangle className="h-5 w-5" />,
    items: [
      { id: "medical-1", label: "PAR-Q 'Yes' triggers needs_medical_review status" },
      { id: "medical-2", label: "Admin sees client in medical review queue" },
      { id: "medical-3", label: "Admin can approve → moves to pending_coach_approval (1:1) or pending_payment (team)" },
      { id: "medical-4", label: "Admin can reject with reason" },
    ],
  },
  {
    title: "4. Coach Approval (1:1 Plans Only)",
    icon: <UserCheck className="h-5 w-5" />,
    items: [
      { id: "coach-1", label: "1:1 client appears in Coach → My Clients → Pending Approvals" },
      { id: "coach-2", label: "Coach can view client details (no PHI/PII)" },
      { id: "coach-3", label: "Coach 'Approve' → profile.status = pending_payment" },
      { id: "coach-4", label: "Coach 'Decline' → profile.status = inactive, subscription cancelled" },
      { id: "coach-5", label: "Coach notification email sent on new pending client" },
      { id: "coach-6", label: "Team plans skip coach approval entirely" },
    ],
  },
  {
    title: "5. Payment Flow",
    icon: <CreditCard className="h-5 w-5" />,
    items: [
      { id: "payment-1", label: "Client in pending_payment sees payment page on dashboard" },
      { id: "payment-2", label: "Payment button initiates TAP checkout" },
      { id: "payment-3", label: "Successful payment → profile.status = active, subscription.status = active" },
      { id: "payment-4", label: "Discount codes apply correctly (one-time, limited, lifetime)" },
      { id: "payment-5", label: "Payment deadline displayed if set" },
      { id: "payment-6", label: "next_billing_date set to +30 days from activation" },
    ],
  },
  {
    title: "6. Declined Payment & Retry",
    icon: <AlertTriangle className="h-5 w-5" />,
    items: [
      { id: "decline-1", label: "Payment failure keeps status = pending_payment (NOT cancelled)" },
      { id: "decline-2", label: "User sees friendly error: 'Payment wasn't completed...'" },
      { id: "decline-3", label: "Retry payment button works" },
      { id: "decline-4", label: "Multiple retries allowed before deadline" },
      { id: "decline-5", label: "No accidental account cancellation on payment failure" },
    ],
  },
  {
    title: "7. Active Client Access",
    icon: <CheckCircle2 className="h-5 w-5" />,
    items: [
      { id: "access-1", label: "Active client can access Dashboard with full features" },
      { id: "access-2", label: "Nutrition page accessible (correct route for plan type)" },
      { id: "access-3", label: "Workout Library accessible" },
      { id: "access-4", label: "Educational Videos accessible" },
      { id: "access-5", label: "Billing page shows next payment date" },
      { id: "access-6", label: "Coach card displays assigned coach info" },
    ],
  },
  {
    title: "8. Overdue & Grace Period",
    icon: <Clock className="h-5 w-5" />,
    items: [
      { id: "overdue-1", label: "Reminder emails sent at 7, 3, 1 days before due" },
      { id: "overdue-2", label: "On due date: subscription → past_due, profile stays active (soft lock)" },
      { id: "overdue-3", label: "Grace period (days 1-7): limited access, 'Pay Now' banner shown" },
      { id: "overdue-4", label: "Day 8+: both subscription & profile → inactive (hard lock)" },
      { id: "overdue-5", label: "Past-due reminder emails sent at 1, 3, 6 days after due" },
      { id: "overdue-6", label: "Successful payment restores full access immediately" },
    ],
  },
  {
    title: "9. Role-Based Access Control",
    icon: <ShieldCheck className="h-5 w-5" />,
    items: [
      { id: "rbac-1", label: "Coaches cannot access /admin/* routes" },
      { id: "rbac-2", label: "Admins cannot access /coach/* routes (separate account required)" },
      { id: "rbac-3", label: "Clients cannot access coach or admin routes" },
      { id: "rbac-4", label: "Coaches see only their assigned clients" },
      { id: "rbac-5", label: "Coaches cannot see client PII (email, phone, DOB)" },
      { id: "rbac-6", label: "PHI access logged in audit table" },
    ],
  },
];

export default function LaunchTestChecklist() {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [testerName, setTesterName] = useState("");

  const toggleItem = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalItems = checklistSections.reduce((sum, s) => sum + s.items.length, 0);
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;
  const progressPercent = Math.round((checkedCount / totalItems) * 100);

  const handleExport = () => {
    const report = {
      date: new Date().toISOString(),
      tester: testerName || "Unknown",
      progress: `${checkedCount}/${totalItems} (${progressPercent}%)`,
      checkedItems,
      notes,
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `launch-checklist-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success("Checklist exported successfully");
  };

  const handleReset = () => {
    setCheckedItems({});
    setNotes("");
    toast.info("Checklist reset");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Dumbbell className="h-6 w-6 text-primary" />
            Launch Test Checklist
          </h1>
          <p className="text-muted-foreground mt-1">
            Internal QA tool — verify end-to-end user flows before launch
          </p>
        </div>
        <Badge variant={progressPercent === 100 ? "default" : "secondary"} className="text-lg px-4 py-1">
          {checkedCount}/{totalItems} ({progressPercent}%)
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-3">
        <div 
          className="bg-primary h-3 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Test Accounts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Test Accounts
          </CardTitle>
          <CardDescription>
            Use these accounts to test each role's journey. Passwords should be set in your password manager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {testAccounts.map((account) => (
              <div 
                key={account.email}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <div className="p-2 rounded-full bg-primary/10 text-primary">
                  {account.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{account.role}</p>
                  <p className="text-xs text-muted-foreground truncate">{account.email}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Checklist Sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        {checklistSections.map((section) => {
          const sectionChecked = section.items.filter(i => checkedItems[i.id]).length;
          const sectionComplete = sectionChecked === section.items.length;
          
          return (
            <Card key={section.title} className={sectionComplete ? "border-green-500/50 bg-green-500/5" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {section.icon}
                    {section.title}
                  </span>
                  <Badge variant={sectionComplete ? "default" : "outline"} className="text-xs">
                    {sectionChecked}/{section.items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={checkedItems[item.id] || false}
                      onCheckedChange={() => toggleItem(item.id)}
                      className="mt-0.5"
                    />
                    <span className={`text-sm ${checkedItems[item.id] ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Notes & Sign-off */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notes & Sign-off</CardTitle>
          <CardDescription>Record any issues, observations, or blockers found during testing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">QA Tester Name</label>
              <input
                type="text"
                value={testerName}
                onChange={(e) => setTesterName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Test Date</label>
              <input
                type="text"
                value={new Date().toLocaleDateString()}
                disabled
                className="w-full px-3 py-2 rounded-md border bg-muted text-sm"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes & Observations</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document any issues, edge cases, or observations..."
              rows={4}
            />
          </div>

          <Separator />

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleReset}>
              Reset Checklist
            </Button>
            <Button onClick={handleExport}>
              Export Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        This page is for internal QA use only. Do not share test account credentials.
      </p>
    </div>
  );
}
