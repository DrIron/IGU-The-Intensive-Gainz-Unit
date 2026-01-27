import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User, Shield } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface Coach {
  user_id: string;
  first_name: string;
  last_name: string;
}

interface ProfileData {
  email: string;
  phone: string | null;
  full_name: string | null;
}

interface CoachChangeRequest {
  id: string;
  status: string;
  requested_coach_id: string;
  created_at: string;
  coaches: {
    first_name: string;
    last_name: string;
  };
}

export default function ProfileEditor({ userId }: { userId: string }) {
  const { toast } = useToast();
  const { isAdmin, isCoach, userId: currentUserId } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [currentCoach, setCurrentCoach] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<CoachChangeRequest | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: "",
    phone: "",
    full_name: "",
  });
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    full_name: "",
    requested_coach_id: "",
  });

  useEffect(() => {
    fetchProfileData();
    fetchCoaches();
    fetchCurrentCoach();
    fetchPendingRequest();
  }, [userId]);

  const fetchProfileData = async () => {
    try {
      // Fetch from split tables - profiles_private for PII (own user has access via RLS)
      const [{ data: profilePrivate, error: privateError }, { data: profilePublic, error: publicError }] = await Promise.all([
        supabase
          .from("profiles_private")
          .select("email, phone, full_name")
          .eq("profile_id", userId)
          .single(),
        supabase
          .from("profiles_public")
          .select("first_name")
          .eq("id", userId)
          .single()
      ]);

      if (privateError) throw privateError;

      const data = {
        email: profilePrivate?.email || "",
        phone: profilePrivate?.phone || null,
        full_name: profilePrivate?.full_name || null,
      };

      setProfileData(data);
      setFormData({
        email: data.email,
        phone: data.phone || "",
        full_name: data.full_name || "",
        requested_coach_id: "",
      });
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchCoaches = async () => {
    try {
      // Use coaches_directory (public-safe view) for client-facing coach list
      const { data, error } = await supabase
        .from("coaches_directory")
        .select("user_id, first_name, last_name")
        .order("first_name");

      if (error) throw error;
      setCoaches(data || []);
    } catch (error: any) {
      console.error("Error fetching coaches:", error);
    }
  };

  const fetchCurrentCoach = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("coach_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .single();

      if (error) throw error;
      setCurrentCoach(data?.coach_id || null);
    } catch (error: any) {
      console.error("Error fetching current coach:", error);
    }
  };

  const fetchPendingRequest = async () => {
    try {
      const { data, error } = await supabase
        .from("coach_change_requests")
        .select(`
          id,
          status,
          requested_coach_id,
          created_at,
          coaches:coaches!coach_change_requests_requested_coach_id_fkey(first_name, last_name)
        `)
        .eq("user_id", userId)
        .eq("status", "pending")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      setPendingRequest(data);
    } catch (error: any) {
      console.error("Error fetching pending request:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update profiles_private for PII fields (RLS allows own user to update)
      const { error } = await supabase
        .from("profiles_private")
        .update({
          phone: formData.phone,
          full_name: formData.full_name,
        })
        .eq("profile_id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      fetchProfileData();
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

  const handleRequestCoachChange = async () => {
    if (!formData.requested_coach_id || formData.requested_coach_id === currentCoach) {
      toast({
        title: "Invalid Request",
        description: "Please select a different coach",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("coach_change_requests")
        .insert({
          user_id: userId,
          current_coach_id: currentCoach,
          requested_coach_id: formData.requested_coach_id,
        });

      if (error) throw error;

      toast({
        title: "Request Submitted",
        description: "Your coach change request has been submitted for approval",
      });
      setFormData({ ...formData, requested_coach_id: "" });
      fetchPendingRequest();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile Information
        </CardTitle>
        <CardDescription>
          Update your personal information and coach preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Coach access restriction notice */}
        {isCoach && !isAdmin && currentUserId !== userId && (
          <Alert className="mb-4">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Profile editing is restricted. Coaches cannot modify client personal information.
              Contact admin for required changes.
            </AlertDescription>
          </Alert>
        )}
        
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading || (isCoach && !isAdmin && currentUserId !== userId)} 
              className="w-full"
            >
              {loading ? "Updating..." : "Update Profile"}
            </Button>
          </div>
        </form>

        <div className="mt-8 pt-8 border-t">
          <h3 className="text-lg font-semibold mb-4">Coach Change Request</h3>
          
          {pendingRequest ? (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Pending Request</p>
              <p className="text-sm text-muted-foreground">
                You have a pending request to change to coach: <span className="font-medium">{pendingRequest.coaches.first_name} {pendingRequest.coaches.last_name}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Requested on {new Date(pendingRequest.created_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="coach">Request New Coach</Label>
                <Select
                  value={formData.requested_coach_id}
                  onValueChange={(value) => setFormData({ ...formData, requested_coach_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches
                      .filter(coach => coach.user_id !== currentCoach)
                      .map((coach) => (
                        <SelectItem key={coach.user_id} value={coach.user_id}>
                          {coach.first_name} {coach.last_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleRequestCoachChange}
                disabled={loading || !formData.requested_coach_id}
                className="w-full"
              >
                Submit Coach Change Request
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}