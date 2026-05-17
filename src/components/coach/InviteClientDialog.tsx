import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";

interface Service {
  id: string;
  name: string;
  type: string;
}

interface InviteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachUserId: string;
  isHeadCoach: boolean;
}

export function InviteClientDialog({
  open,
  onOpenChange,
  coachUserId,
  isHeadCoach,
}: InviteClientDialogProps) {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Load services the coach can invite for:
    // - 1:1 services always; team only if head coach
    //
    // Column is `services.type` (the enum is named `service_type` — easy to
    // confuse). Querying `service_type` returns PostgREST 400 and silently
    // empties the dropdown — smoke-tested on 2026-05-17.
    supabase
      .from("services")
      .select("id, name, type")
      .eq("is_active", true)
      .then(({ data, error }) => {
        if (error) {
          toast({
            title: "Failed to load services",
            description: sanitizeErrorForUser(error),
            variant: "destructive",
          });
          return;
        }
        if (!data) return;
        const filtered = data.filter((s) => {
          if (s.type === "team_plan") return isHeadCoach;
          // Only 1:1 service types (exclude any pure team/squad variants)
          return (
            s.type === "one_to_one_online" ||
            s.type === "one_to_one_complete" ||
            s.type === "hybrid" ||
            s.type === "in_person" ||
            // fallback: include any non-team service
            s.type !== "team_plan"
          );
        });
        setServices(filtered);
      });
  }, [open, isHeadCoach]);

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setServiceId("");
    setSent(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !firstName.trim() || !lastName.trim() || !serviceId) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields before sending the invitation.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("coach-invite-client", {
        body: { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), serviceId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Failed to send invitation");

      setSent(true);
    } catch (err: any) {
      toast({
        title: "Invitation failed",
        description: err.message ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite a New Client
          </DialogTitle>
          <DialogDescription>
            An invitation email will be sent with a personalised link to the
            onboarding form. They will be pre-assigned to you.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="font-medium text-lg">Invitation sent!</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">{firstName}</span> will receive an
              email at <span className="font-medium">{email}</span> with a link
              to complete their registration.
            </p>
            <Button variant="outline" onClick={handleClose} className="mt-2">
              Close
            </Button>
            <Button
              variant="ghost"
              onClick={reset}
              className="text-sm text-muted-foreground"
            >
              Invite another client
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-first-name">First name</Label>
                  <Input
                    id="inv-first-name"
                    placeholder="Khalid"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-last-name">Last name</Label>
                  <Input
                    id="inv-last-name"
                    placeholder="Al-Rashid"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email address</Label>
                <Input
                  id="inv-email"
                  type="email"
                  placeholder="client@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-service">Service plan</Label>
                <Select value={serviceId} onValueChange={setServiceId} disabled={submitting}>
                  <SelectTrigger id="inv-service">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Send Invitation
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
