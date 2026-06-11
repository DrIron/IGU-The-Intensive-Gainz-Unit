import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { withTimeout } from "@/lib/withTimeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, CheckCircle2, Gift } from "lucide-react";

// Fallback cap mirrors DEFAULT_EXEMPT_CAP in the create-manual-client edge fn.
const DEFAULT_EXEMPT_CAP = 5;

interface Service {
  id: string;
  name: string;
  price_kwd: number;
}

interface AddExemptClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  onClientCreated: () => void;
}

export function AddExemptClientDialog({
  open,
  onOpenChange,
  coachUserId,
  onClientCreated,
}: AddExemptClientDialogProps) {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [used, setUsed] = useState<number | null>(null);
  const [cap, setCap] = useState<number>(DEFAULT_EXEMPT_CAP);

  const loadMeta = useCallback(async () => {
    // Active services (any type -- head coaches may add exempt clients on any plan).
    const { data: svc, error: svcErr } = await supabase
      .from("services")
      .select("id, name, price_kwd")
      .eq("is_active", true);
    if (svcErr) {
      toast({ title: "Failed to load services", description: sanitizeErrorForUser(svcErr), variant: "destructive" });
    } else {
      setServices(svc ?? []);
    }

    // Cap + current usage for the "X of N used" hint.
    const [{ data: capRow }, { data: count, error: countErr }] = await Promise.all([
      supabase.from("coaches_public").select("max_exempt_clients").eq("user_id", coachUserId).maybeSingle(),
      supabase.rpc("count_active_exempt_clients_for_coach", { p_coach_id: coachUserId }),
    ]);
    setCap(capRow?.max_exempt_clients ?? DEFAULT_EXEMPT_CAP);
    if (!countErr && typeof count === "number") setUsed(count);
  }, [coachUserId, toast]);

  useEffect(() => {
    if (!open) return;
    loadMeta();
  }, [open, loadMeta]);

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setServiceId("");
    setReason("");
    setSent(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const atCap = used !== null && used >= cap;

  const handleSubmit = async () => {
    if (!email.trim() || !firstName.trim() || !lastName.trim() || !serviceId) {
      toast({ title: "Missing fields", description: "Fill in name, email and a plan first.", variant: "destructive" });
      return;
    }
    if (reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Add a short reason (e.g. \"trialing the app\").", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("create-manual-client", {
          body: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            serviceId,
            reason: reason.trim(),
          },
        }),
        15000,
        "create-manual-client"
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to add client");

      setSent(true);
      onClientCreated();
    } catch (err: unknown) {
      toast({ title: "Couldn't add client", description: sanitizeErrorForUser(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Add Payment Exempt Client
          </DialogTitle>
          <DialogDescription>
            Creates an active account with payment waived -- ideal for letting a
            client test drive the app. They'll get an email to set their password
            and will be assigned to you.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="font-medium text-lg">Client added!</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{firstName}</span> will get an email at{" "}
              <span className="font-medium">{email}</span> to set their password.
            </p>
            <Button variant="outline" onClick={handleClose} className="mt-2">
              Close
            </Button>
            <Button variant="ghost" onClick={reset} className="text-sm text-muted-foreground">
              Add another
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-2">
              {used !== null && (
                <p className="text-xs text-muted-foreground">
                  {used} of {cap} payment-exempt clients used.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-first-name">First name</Label>
                  <Input id="ex-first-name" placeholder="Khalid" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} disabled={submitting} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-last-name">Last name</Label>
                  <Input id="ex-last-name" placeholder="Al-Rashid" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} disabled={submitting} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex-email">Email address</Label>
                <Input id="ex-email" type="email" placeholder="client@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} disabled={submitting} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex-service">Service plan</Label>
                <Select value={serviceId} onValueChange={setServiceId} disabled={submitting}>
                  <SelectTrigger id="ex-service">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} -- {s.price_kwd} KWD
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex-reason">Reason</Label>
                <Textarea id="ex-reason" placeholder="e.g. trialing the app before signing up"
                  value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting}
                  rows={2} maxLength={500} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || atCap}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : atCap ? (
                  "Limit reached"
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Client
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
