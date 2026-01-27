import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserCheck } from "lucide-react";

interface CoachChangeRequest {
  id: string;
  user_id: string;
  current_coach_id: string | null;
  requested_coach_id: string;
  status: string;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
  current_coach: {
    first_name: string;
    last_name: string;
  } | null;
}

export default function CoachChangeRequests({ coachUserId }: { coachUserId: string }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<CoachChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [coachUserId]);

  const fetchRequests = async () => {
    try {
      // Fetch change requests (without profile join due to view limitations)
      const { data, error } = await supabase
        .from("coach_change_requests")
        .select(`
          id,
          user_id,
          current_coach_id,
          requested_coach_id,
          status,
          created_at,
          current_coach:coaches!coach_change_requests_current_coach_id_fkey(first_name, last_name)
        `)
        .eq("requested_coach_id", coachUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch profile info separately for each request
      const enrichedData = await Promise.all(
        (data || []).map(async (req) => {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("display_name, first_name")
            .eq("id", req.user_id)
            .single();
          return {
            ...req,
            profiles: {
              full_name: profile?.display_name || profile?.first_name || 'Unknown',
              email: '' // Not accessible to coaches
            }
          };
        })
      );
      
      setRequests(enrichedData as any || []);
    } catch (error: any) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (requestId: string, action: "approved" | "rejected") => {
    setLoading(true);
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      // Update the request status
      const { error: updateError } = await supabase
        .from("coach_change_requests")
        .update({
          status: action,
          processed_at: new Date().toISOString(),
          processed_by: coachUserId,
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // If approved, update the subscription
      if (action === "approved") {
        const { error: subError } = await supabase
          .from("subscriptions")
          .update({ coach_id: coachUserId })
          .eq("user_id", request.user_id)
          .eq("status", "active");

        if (subError) throw subError;
      }

      toast({
        title: action === "approved" ? "Request Approved" : "Request Rejected",
        description: `Coach change request has been ${action}`,
      });

      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Loading requests...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          Coach Change Requests
        </CardTitle>
        <CardDescription>
          Manage requests from clients who want to switch to you as their coach
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No coach change requests</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Previous Coach</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{request.profiles.full_name || "N/A"}</p>
                      <p className="text-sm text-muted-foreground">{request.profiles.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {request.current_coach ? `${request.current_coach.first_name} ${request.current_coach.last_name}` : "No previous coach"}
                  </TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        request.status === "approved"
                          ? "default"
                          : request.status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleRequest(request.id, "approved")}
                          disabled={loading}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRequest(request.id, "rejected")}
                          disabled={loading}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}