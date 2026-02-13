import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { CreditCard, FileText, Loader2, User, Lock, Trash2, AlertTriangle, Users } from "lucide-react";
import { Footer } from "@/components/Footer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CoachProfile from "@/components/CoachProfile";

interface Subscription {
  id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  coach_id: string | null;
  service: {
    name: string;
    price_kwd: number;
    type: string;
  };
}

interface Coach {
  user_id: string;
  first_name: string;
  last_name: string;
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

interface ProfileData {
  email: string;
  phone: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

export default function AccountManagement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [pendingRequest, setPendingRequest] = useState<CoachChangeRequest | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: "",
    phone: "",
    full_name: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
  });
  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    countryCode: "+965",
    full_name: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    gender: "",
    requested_coach_id: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [userRoles, setUserRoles] = useState<string[]>([]);

  const getUserRoles = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    setUserRoles(roles?.map(r => r.role) || []);
  }, []);

  const checkUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setUser(user);
    await Promise.all([
      loadSubscription(user.id),
      loadProfileData(user.id),
      loadCoaches(),
      loadPendingRequest(user.id),
    ]);
  }, [navigate]);

  useEffect(() => {
    checkUser();
    getUserRoles();
  }, [checkUser, getUserRoles]);

  const loadProfileData = async (userId: string) => {
    try {
      // Split query for public/private data (own user has RLS access)
      const [{ data: profilePublic, error: publicError }, { data: profilePrivate, error: privateError }] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("first_name")
          .eq("id", userId)
          .single(),
        supabase
          .from("profiles_private")
          .select("email, phone, full_name, last_name, date_of_birth, gender")
          .eq("profile_id", userId)
          .single()
      ]);

      if (publicError) throw publicError;
      if (privateError) throw privateError;

      const data = {
        email: profilePrivate?.email || null,
        phone: profilePrivate?.phone || null,
        full_name: profilePrivate?.full_name || null,
        first_name: profilePublic?.first_name || null,
        last_name: profilePrivate?.last_name || null,
        date_of_birth: profilePrivate?.date_of_birth || null,
        gender: profilePrivate?.gender || null,
      };

      setProfileData(data);
      
      // Extract country code from phone if present
      const phoneWithCode = data.phone || "";
      let extractedCode = "+965";
      let extractedPhone = phoneWithCode;
      
      if (phoneWithCode) {
        const match = phoneWithCode.match(/^(\+\d+)\s*(.*)$/);
        if (match) {
          extractedCode = match[1];
          extractedPhone = match[2];
        }
      }
      
      setFormData(prev => ({
        ...prev,
        email: data.email,
        phone: extractedPhone,
        countryCode: extractedCode,
        full_name: data.full_name || "",
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        date_of_birth: data.date_of_birth || "",
        gender: data.gender || "",
      }));
    } catch (error: any) {
      console.error("Error fetching profile:", error);
    }
  };

  const loadCoaches = async () => {
    try {
      // Use coaches_directory view - public-safe fields only (no contact/capacity data)
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

  const loadPendingRequest = async (userId: string) => {
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
        .maybeSingle();

      if (error) throw error;
      setPendingRequest(data);
    } catch (error: any) {
      console.error("Error fetching pending request:", error);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setUpdatingProfile(true);
    try {
      // Check if email has changed
      if (formData.email !== profileData.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        });

        if (emailError) throw emailError;

        toast({
          title: "Email Update Initiated",
          description: "Please check both your old and new email addresses to confirm the change.",
        });
      }

      // Combine country code and phone number
      const fullPhone = formData.phone ? `${formData.countryCode} ${formData.phone}` : "";
      
      // Split updates to profiles_public and profiles_private (own user has RLS access)
      const [{ error: publicError }, { error: privateError }] = await Promise.all([
        supabase
          .from("profiles_public")
          .update({
            first_name: formData.first_name,
            display_name: formData.full_name || `${formData.first_name} ${formData.last_name}`,
          })
          .eq("id", user.id),
        supabase
          .from("profiles_private")
          .update({
            phone: fullPhone,
            full_name: formData.full_name,
            last_name: formData.last_name,
            date_of_birth: formData.date_of_birth || null,
            gender: formData.gender || null,
          })
          .eq("profile_id", user.id)
      ]);

      if (publicError) throw publicError;
      if (privateError) throw privateError;

      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      await loadProfileData(user.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setFormData(prev => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleRequestCoachChange = async () => {
    if (!user || !formData.requested_coach_id || formData.requested_coach_id === subscription?.coach_id) {
      toast({
        title: "Invalid Request",
        description: "Please select a different coach",
        variant: "destructive",
      });
      return;
    }

    setUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from("coach_change_requests")
        .insert({
          user_id: user.id,
          current_coach_id: subscription?.coach_id,
          requested_coach_id: formData.requested_coach_id,
        });

      if (error) throw error;

      toast({
        title: "Request Submitted",
        description: "Your coach change request has been submitted for approval",
      });
      setFormData(prev => ({ ...prev, requested_coach_id: "" }));
      await loadPendingRequest(user.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setDeletingAccount(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { userId: user.id },
      });

      if (error) throw error;

      toast({
        title: "Account Deleted",
        description: "Your account and all associated data have been permanently deleted.",
      });

      await supabase.auth.signOut();
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      setDeletingAccount(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user || !subscription) return;

    const confirmed = window.confirm(
      "Are you sure you want to cancel your subscription? This action cannot be undone."
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: {
          userId: user.id,
          reason: 'User requested cancellation',
        },
      });

      if (error) throw error;

      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled successfully.",
      });

      await loadSubscription(user.id);
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSubscription = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          *,
          service:services(name, price_kwd, type)
        `)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      setSubscription(data);
    } catch (error: any) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation user={user} />
        <div className="pt-24 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />
      
      <main className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">Account Settings</h1>

          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="account">
                <User className="h-4 w-4 mr-2" />
                Account
              </TabsTrigger>
              {(userRoles.includes('coach') || userRoles.includes('admin')) && (
                <TabsTrigger value="coach-profile">
                  <Users className="h-4 w-4 mr-2" />
                  Coach Profile
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="account" className="space-y-6">
              {/* Profile Section */}
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profile</h2>
              
              {/* Profile Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="your.email@example.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        Changing your email will require confirmation from both your old and new email addresses.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name">First Name</Label>
                        <Input
                          id="first_name"
                          type="text"
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          placeholder="John"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="last_name">Last Name</Label>
                        <Input
                          id="last_name"
                          type="text"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="date_of_birth">Date of Birth</Label>
                      <Input
                        id="date_of_birth"
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select
                        value={formData.gender}
                        onValueChange={(value) => setFormData({ ...formData, gender: value })}
                      >
                        <SelectTrigger id="gender">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="countryCode">Country Code</Label>
                        <Select
                          value={formData.countryCode}
                          onValueChange={(value) => setFormData({ ...formData, countryCode: value })}
                        >
                          <SelectTrigger id="countryCode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="+965">+965 (Kuwait)</SelectItem>
                            <SelectItem value="+966">+966 (Saudi Arabia)</SelectItem>
                            <SelectItem value="+971">+971 (UAE)</SelectItem>
                            <SelectItem value="+973">+973 (Bahrain)</SelectItem>
                            <SelectItem value="+974">+974 (Qatar)</SelectItem>
                            <SelectItem value="+968">+968 (Oman)</SelectItem>
                            <SelectItem value="+962">+962 (Jordan)</SelectItem>
                            <SelectItem value="+961">+961 (Lebanon)</SelectItem>
                            <SelectItem value="+20">+20 (Egypt)</SelectItem>
                            <SelectItem value="+1">+1 (USA/Canada)</SelectItem>
                            <SelectItem value="+44">+44 (UK)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="1234 5678"
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={updatingProfile}>
                      {updatingProfile ? "Updating..." : "Update Profile"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

          {/* Security Section */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-4">Security</h2>
          
          {/* Password Change */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your account password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={updatingPassword || !formData.newPassword || !formData.confirmPassword}
                >
                  {updatingPassword ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Coaching & Billing Section */}
          {!userRoles.includes('admin') && !userRoles.includes('coach') && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-4">Coaching & Billing</h2>
          )}
          
          {/* Coach Change Request - Only for clients */}
          {subscription && !userRoles.includes('admin') && !userRoles.includes('coach') && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Coach Assignment</CardTitle>
                <CardDescription>
                  For team plans like Fe Squad, coach changes may be limited and are primarily handled by the coaching team. If you need to change coaches, submit a request here or contact support.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                            .filter(coach => coach.user_id !== subscription.coach_id)
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
                      disabled={updatingProfile || !formData.requested_coach_id}
                    >
                      Submit Coach Change Request
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Subscription Management - Only for clients */}
          {!userRoles.includes('admin') && !userRoles.includes('coach') && (
            <Card className="mb-6 mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription Management
                </CardTitle>
                <CardDescription>
                  Manage your current subscription and billing
                </CardDescription>
              </CardHeader>
            <CardContent>
              {subscription ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Plan</p>
                      <p className="text-lg font-semibold">{subscription.service.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {subscription.service.price_kwd} KWD/month
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="text-lg font-semibold capitalize">{subscription.status}</p>
                      {subscription.status === 'active' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Your payments are handled securely via Tap Payments.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Next Billing Date</p>
                      <p className="text-lg font-semibold">
                        {subscription.next_billing_date 
                          ? new Date(subscription.next_billing_date).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Start Date</p>
                      <p className="text-lg font-semibold">
                        {subscription.start_date 
                          ? new Date(subscription.start_date).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  {subscription.status === 'active' && (
                    <div className="flex flex-col gap-4 pt-4">
                      <p className="text-xs text-muted-foreground">
                        Manual monthly payment – no card on file. Pay when your renewal is due.
                      </p>
                      <div className="flex gap-4">
                        <Button variant="outline" onClick={() => navigate("/billing/pay")}>
                          Pay Now
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={handleCancelSubscription}
                          disabled={loading}
                        >
                          {loading ? "Cancelling..." : "Cancel Subscription"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No active subscription found</p>
                  <Button onClick={() => navigate("/")}>Browse Plans</Button>
                </div>
              )}
            </CardContent>
            </Card>
          )}

          {/* Invoices - Only for clients */}
          {!userRoles.includes('admin') && !userRoles.includes('coach') && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoices
                </CardTitle>
                <CardDescription>
                  View and download your billing history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>No invoices available yet</p>
                  <p className="text-sm mt-2">Invoices will appear here after your first billing cycle</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Safety Section */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-4">Account Safety</h2>
          
          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that permanently affect your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
                <div>
                  <h4 className="font-medium text-destructive">Delete Account</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Deleting your account will permanently remove your access, progress data, and any active coaching subscriptions. This cannot be undone.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account,
                        cancel any active subscriptions, and remove all your data from our servers including:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Your profile information</li>
                          <li>All subscription history</li>
                          <li>Uploaded documents and forms</li>
                          <li>Coach change requests</li>
                          <li>All testimonials and reviews</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={deletingAccount}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deletingAccount ? "Deleting..." : "Yes, delete my account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
            </TabsContent>

            {(userRoles.includes('coach') || userRoles.includes('admin')) && (
              <TabsContent value="coach-profile">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Coach Profile for Meet Our Team
                    </CardTitle>
                    <CardDescription>
                      Edit your public coach profile displayed on the Meet Our Team page
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CoachProfile />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
