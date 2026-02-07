import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSubroles } from "@/hooks/useUserSubroles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldOff,
  Send,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { SubroleStatus } from "@/auth/roles";

interface SubroleDefinition {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  requires_credentials: boolean;
}

interface SubroleRequestFormProps {
  userId: string;
}

export function SubroleRequestForm({ userId }: SubroleRequestFormProps) {
  const queryClient = useQueryClient();
  const { data: userSubroles, isLoading: subrolesToading } = useUserSubroles(userId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<SubroleDefinition | null>(null);
  const [credentialNotes, setCredentialNotes] = useState("");
  const [isReRequest, setIsReRequest] = useState(false);

  // Fetch all available subrole definitions
  const { data: definitions = [], isLoading: defsLoading } = useQuery({
    queryKey: ["subrole-definitions"],
    queryFn: async (): Promise<SubroleDefinition[]> => {
      const { data, error } = await supabase
        .from("subrole_definitions")
        .select("id, slug, display_name, description, requires_credentials")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const requestMutation = useMutation({
    mutationFn: async ({
      subroleId,
      notes,
      reRequest,
    }: {
      subroleId: string;
      notes: string;
      reRequest: boolean;
    }) => {
      if (reRequest) {
        // Update rejected record back to pending
        const existing = userSubroles.find((s) => s.subrole_id === subroleId);
        if (!existing) throw new Error("No existing request found");

        const { error } = await supabase
          .from("user_subroles")
          .update({
            status: "pending",
            credential_notes: notes || null,
            admin_notes: null,
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_subroles").insert({
          user_id: userId,
          subrole_id: subroleId,
          status: "pending",
          credential_notes: notes || null,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isReRequest ? "Re-request submitted" : "Subrole request submitted");
      queryClient.invalidateQueries({ queryKey: ["user-subroles", userId] });
      setDialogOpen(false);
      setSelectedDefinition(null);
      setCredentialNotes("");
      setIsReRequest(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit request");
    },
  });

  const handleOpenDialog = (def: SubroleDefinition, reRequest: boolean) => {
    setSelectedDefinition(def);
    setIsReRequest(reRequest);
    if (reRequest) {
      const existing = userSubroles.find((s) => s.subrole_id === def.id);
      setCredentialNotes(existing?.credential_notes || "");
    } else {
      setCredentialNotes("");
    }
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedDefinition) return;
    requestMutation.mutate({
      subroleId: selectedDefinition.id,
      notes: credentialNotes,
      reRequest: isReRequest,
    });
  };

  const getStatusBadge = (status: SubroleStatus) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="secondary" className="gap-1 bg-orange-500/20 text-orange-400">
            <ShieldOff className="h-3 w-3" />
            Revoked
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const isLoading = subrolesToading || defsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading subroles...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            My Subroles
          </CardTitle>
          <CardDescription>
            Request additional practitioner credentials to unlock specialized capabilities
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {definitions.map((def) => {
          const existing = userSubroles.find((s) => s.subrole_id === def.id);
          const canRequest = !existing;
          const canReRequest = existing?.status === "rejected";

          return (
            <Card key={def.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{def.display_name}</CardTitle>
                    {def.description && (
                      <CardDescription className="mt-1 text-xs">
                        {def.description}
                      </CardDescription>
                    )}
                  </div>
                  {existing && getStatusBadge(existing.status)}
                </div>
              </CardHeader>
              <CardContent>
                {existing?.admin_notes && existing.status !== "approved" && (
                  <p className="text-sm text-muted-foreground mb-3 p-2 bg-muted rounded">
                    Admin: {existing.admin_notes}
                  </p>
                )}

                {canRequest && (
                  <Button
                    onClick={() => handleOpenDialog(def, false)}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Request
                  </Button>
                )}

                {canReRequest && (
                  <Button
                    onClick={() => handleOpenDialog(def, true)}
                    size="sm"
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Re-Request
                  </Button>
                )}

                {existing?.status === "pending" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Your request is being reviewed
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isReRequest ? "Re-Request" : "Request"} {selectedDefinition?.display_name}
            </DialogTitle>
            <DialogDescription>
              {selectedDefinition?.requires_credentials
                ? "Please provide details about your credentials and qualifications."
                : "This subrole does not require special credentials."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedDefinition?.requires_credentials && (
              <div className="space-y-2">
                <Label>
                  Credential Details
                </Label>
                <Textarea
                  value={credentialNotes}
                  onChange={(e) => setCredentialNotes(e.target.value)}
                  placeholder="Describe your certifications, license numbers, and relevant qualifications..."
                  rows={4}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={requestMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending
                ? "Submitting..."
                : isReRequest
                ? "Re-Submit Request"
                : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
