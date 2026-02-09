import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserCheck,
  UserX,
  ShieldOff,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Award,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import type { SubroleStatus } from "@/auth/roles";

interface SubroleRequest {
  id: string;
  user_id: string;
  subrole_id: string;
  status: SubroleStatus;
  credential_notes: string | null;
  credential_document_url: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  subrole_definitions: {
    slug: string;
    display_name: string;
  };
  // Joined user info
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
}

async function fetchSubroleRequests(): Promise<SubroleRequest[]> {
  // Fetch subrole requests with definition info
  const { data, error } = await supabase
    .from("user_subroles")
    .select(`
      id,
      user_id,
      subrole_id,
      status,
      credential_notes,
      credential_document_url,
      admin_notes,
      reviewed_by,
      reviewed_at,
      created_at,
      subrole_definitions!inner (
        slug,
        display_name
      )
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Fetch user profile info for each request
  const userIds = [...new Set((data || []).map((r: any) => r.user_id))];

  let profileMap: Record<string, { first_name: string; last_name: string; email: string }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles_public")
      .select("id, first_name")
      .in("id", userIds);

    const { data: privateProfiles } = await supabase
      .from("profiles_private")
      .select("profile_id, last_name, email")
      .in("profile_id", userIds);

    for (const p of profiles || []) {
      const priv = (privateProfiles || []).find((pp: any) => pp.profile_id === p.id);
      profileMap[p.id] = {
        first_name: p.first_name || "",
        last_name: priv?.last_name || "",
        email: priv?.email || "",
      };
    }
  }

  return (data || []).map((row: any) => ({
    ...row,
    user_first_name: profileMap[row.user_id]?.first_name,
    user_last_name: profileMap[row.user_id]?.last_name,
    user_email: profileMap[row.user_id]?.email,
  }));
}

export function SubroleApprovalQueue() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<SubroleRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revoke" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-subrole-requests"],
    queryFn: fetchSubroleRequests,
    staleTime: 30 * 1000, // 30s for admin queue
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: SubroleStatus;
      notes: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_subroles")
        .update({
          status,
          admin_notes: notes || null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      const actionLabel =
        variables.status === "approved"
          ? "approved"
          : variables.status === "rejected"
          ? "rejected"
          : "revoked";
      toast.success(`Subrole request ${actionLabel} successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-subrole-requests"] });
      setDialogOpen(false);
      setSelectedRequest(null);
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast.error(sanitizeErrorForUser(error));
    },
  });

  const handleOpenDialog = (
    request: SubroleRequest,
    action: "approve" | "reject" | "revoke"
  ) => {
    setSelectedRequest(request);
    setActionType(action);
    setAdminNotes(request.admin_notes || "");
    setDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!selectedRequest || !actionType) return;

    const statusMap: Record<string, SubroleStatus> = {
      approve: "approved",
      reject: "rejected",
      revoke: "revoked",
    };

    updateMutation.mutate({
      id: selectedRequest.id,
      status: statusMap[actionType],
      notes: adminNotes,
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

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const approvedRequests = requests.filter((r) => r.status === "approved");
  const rejectedRequests = requests.filter((r) => r.status === "rejected");
  const revokedRequests = requests.filter((r) => r.status === "revoked");

  const renderRequestCard = (request: SubroleRequest) => (
    <Card key={request.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {request.user_first_name} {request.user_last_name}
            </CardTitle>
            <CardDescription className="mt-1">
              {request.user_email}
              {" · "}
              Requested {format(new Date(request.created_at), "MMM dd, yyyy")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{request.subrole_definitions.display_name}</Badge>
            {getStatusBadge(request.status)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {request.credential_notes && (
          <div>
            <p className="text-xs font-semibold mb-1 flex items-center gap-1">
              <Award className="h-3 w-3" />
              Credential Notes
            </p>
            <p className="text-sm text-muted-foreground">{request.credential_notes}</p>
          </div>
        )}

        {request.credential_document_url && (
          <div>
            <p className="text-xs font-semibold mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Document
            </p>
            <a
              href={request.credential_document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              View credential document
            </a>
          </div>
        )}

        {request.admin_notes && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold mb-1">Admin Notes</p>
            <p className="text-sm text-muted-foreground">{request.admin_notes}</p>
          </div>
        )}

        {request.reviewed_at && (
          <p className="text-xs text-muted-foreground">
            Reviewed {format(new Date(request.reviewed_at), "MMM dd, yyyy")}
          </p>
        )}

        {request.status === "pending" && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleOpenDialog(request, "approve")}
              className="flex-1"
              variant="default"
              size="sm"
            >
              <UserCheck className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              onClick={() => handleOpenDialog(request, "reject")}
              className="flex-1"
              variant="destructive"
              size="sm"
            >
              <UserX className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        )}

        {request.status === "approved" && (
          <div className="pt-2">
            <Button
              onClick={() => handleOpenDialog(request, "revoke")}
              variant="outline"
              size="sm"
              className="text-orange-400 border-orange-400/50 hover:bg-orange-500/10"
            >
              <ShieldOff className="h-4 w-4 mr-1" />
              Revoke
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading subrole requests...</p>
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
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Subrole Approval Queue
              </CardTitle>
              <CardDescription>
                Review and approve practitioner credential requests
              </CardDescription>
            </div>
            {pendingRequests.length > 0 && (
              <Badge variant="default" className="text-sm">
                {pendingRequests.length} pending
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({rejectedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="revoked">
            Revoked ({revokedRequests.length})
          </TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected", "revoked"] as const).map((tab) => {
          const tabRequests =
            tab === "pending"
              ? pendingRequests
              : tab === "approved"
              ? approvedRequests
              : tab === "rejected"
              ? rejectedRequests
              : revokedRequests;

          return (
            <TabsContent key={tab} value={tab} className="space-y-4">
              {tabRequests.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      No {tab} requests
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {tabRequests.map(renderRequestCard)}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve"
                ? "Approve Subrole"
                : actionType === "reject"
                ? "Reject Subrole"
                : "Revoke Subrole"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? `Approve ${selectedRequest?.user_first_name} ${selectedRequest?.user_last_name} as ${selectedRequest?.subrole_definitions.display_name}. They will gain the associated capabilities.`
                : actionType === "reject"
                ? `Reject this ${selectedRequest?.subrole_definitions.display_name} request. The user can re-submit with updated credentials.`
                : `Revoke ${selectedRequest?.user_first_name} ${selectedRequest?.user_last_name}'s ${selectedRequest?.subrole_definitions.display_name} subrole. They will lose the associated capabilities immediately.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Admin Notes {actionType !== "approve" ? "(recommended)" : "(optional)"}</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder={
                  actionType === "reject"
                    ? "Reason for rejection..."
                    : actionType === "revoke"
                    ? "Reason for revocation..."
                    : "Any notes about this approval..."
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={actionType === "approve" ? "default" : "destructive"}
              onClick={handleConfirmAction}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? "Processing..."
                : actionType === "approve"
                ? "Approve"
                : actionType === "reject"
                ? "Reject"
                : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
