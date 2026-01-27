import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Loader2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import { PersonalDetailsFields } from "@/components/forms/PersonalDetailsFields";

const clientEditSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required" }),
  lastName: z.string().min(1, { message: "Last name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  phone: z.string().min(1, { message: "Phone number is required" }),
  countryCode: z.string().min(1, { message: "Country code is required" }),
  dateOfBirth: z.string().min(1, { message: "Date of birth is required" }),
  gender: z.string().min(1, { message: "Gender is required" }),
});

type ClientEditFormData = z.infer<typeof clientEditSchema>;

interface Client {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  full_name: string | null;
  gender: string | null;
}

interface CareTeamMember {
  id: string;
  staff_role: string;
  is_primary: boolean;
  notes: string | null;
  staff: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  primary_coach: { label: "Primary Coach", color: "bg-primary text-primary-foreground" },
  nutrition: { label: "Nutrition", color: "bg-green-500/20 text-green-700 dark:text-green-400" },
  lifestyle: { label: "Lifestyle", color: "bg-blue-500/20 text-blue-700 dark:text-blue-400" },
  bodybuilding: { label: "Bodybuilding", color: "bg-purple-500/20 text-purple-700 dark:text-purple-400" },
  powerlifting: { label: "Powerlifting", color: "bg-orange-500/20 text-orange-700 dark:text-orange-400" },
  running: { label: "Running", color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-400" },
  mobility: { label: "Mobility", color: "bg-pink-500/20 text-pink-700 dark:text-pink-400" },
  physiotherapist: { label: "Physiotherapist", color: "bg-red-500/20 text-red-700 dark:text-red-400" },
  other: { label: "Staff", color: "bg-muted text-muted-foreground" },
};

export function ClientAccountEditor() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [loadingCareTeam, setLoadingCareTeam] = useState(false);

  const form = useForm<ClientEditFormData>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: "+965",
      dateOfBirth: "",
      gender: "",
    },
  });

  useEffect(() => {
    if (selectedClient) {
      // Extract country code from phone if present
      const phoneWithCode = selectedClient.phone || "";
      let extractedCode = "+965";
      let extractedPhone = phoneWithCode;
      
      if (phoneWithCode) {
        const match = phoneWithCode.match(/^(\+\d+)\s*(.*)$/);
        if (match) {
          extractedCode = match[1];
          extractedPhone = match[2];
        }
      }

      form.reset({
        firstName: selectedClient.first_name || "",
        lastName: selectedClient.last_name || "",
        email: selectedClient.email,
        phone: extractedPhone,
        countryCode: extractedCode,
        dateOfBirth: selectedClient.date_of_birth || "",
        gender: selectedClient.gender || "",
      });

      // Load care team when client is selected
      loadCareTeam(selectedClient.id);
    } else {
      setCareTeam([]);
    }
  }, [selectedClient, form]);

  const loadCareTeam = async (clientId: string) => {
    setLoadingCareTeam(true);
    try {
      const { data, error } = await supabase
        .from('client_care_team')
        .select(`
          id,
          staff_role,
          is_primary,
          notes,
          staff:staff_user_id (
            id,
            email,
            full_name
          )
        `)
        .eq('user_id', clientId);

      if (error) {
        console.error('Error loading care team:', error);
        toast({
          title: "Warning",
          description: "Failed to load care team information",
          variant: "destructive",
        });
        return;
      }

      setCareTeam((data as unknown as CareTeamMember[]) || []);
    } catch (error) {
      console.error('Error loading care team:', error);
    } finally {
      setLoadingCareTeam(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Required",
        description: "Please enter a name or email to search",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    try {
      // Admin search: use profiles_public for name, then RPC for private data
      const { data: publicData, error: publicError } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name")
        .or(`first_name.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(10);

      if (publicError) throw publicError;

      // For each result, fetch private data via admin RPC
      const results: Client[] = [];
      for (const pub of publicData || []) {
        const { data: privateData } = await supabase
          .rpc('admin_get_profile_private', { p_user_id: pub.id });
        
        if (privateData && privateData.length > 0) {
          const priv = privateData[0];
          results.push({
            id: pub.id,
            email: priv.email || '',
            first_name: pub.first_name,
            last_name: priv.last_name,
            phone: priv.phone,
            date_of_birth: priv.date_of_birth,
            full_name: priv.full_name,
            gender: priv.gender,
          });
        }
      }

      setSearchResults(results);
      
      if (results.length === 0) {
        toast({
          title: "No Results",
          description: "No clients found matching your search",
        });
      }
    } catch (error: any) {
      console.error("Error searching clients:", error);
      toast({
        title: "Search Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
  };

  const onSubmit = async (data: ClientEditFormData) => {
    if (!selectedClient) return;

    setUpdating(true);
    try {
      const fullPhone = `${data.countryCode} ${data.phone}`;

      // Admin update: split updates to profiles_public and profiles_private
      const [{ error: publicError }, { error: privateError }] = await Promise.all([
        supabase
          .from("profiles_public")
          .update({
            first_name: data.firstName,
            display_name: `${data.firstName} ${data.lastName}`,
          })
          .eq("id", selectedClient.id),
        supabase
          .from("profiles_private")
          .update({
            last_name: data.lastName,
            phone: fullPhone,
            date_of_birth: data.dateOfBirth,
            gender: data.gender,
            full_name: `${data.firstName} ${data.lastName}`,
          })
          .eq("profile_id", selectedClient.id)
      ]);

      if (publicError) throw publicError;
      if (privateError) throw privateError;

      toast({
        title: "Client Updated",
        description: `${data.firstName} ${data.lastName}'s account has been updated successfully`,
      });

      // Refresh the selected client data using profiles view (admin RLS access)
      const { data: updatedClient } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, phone, date_of_birth, full_name, gender")
        .eq("id", selectedClient.id)
        .single();

      if (updatedClient) {
        setSelectedClient(updatedClient);
      }
    } catch (error: any) {
      console.error("Error updating client:", error);
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const config = ROLE_LABELS[role] || ROLE_LABELS.other;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Edit Client Accounts
          </CardTitle>
          <CardDescription>
            Search for and edit client personal details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Section */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Search Results</h3>
              <div className="border rounded-lg divide-y">
                {searchResults.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                      selectedClient?.id === client.id ? "bg-accent" : ""
                    }`}
                  >
                    <p className="font-medium">
                      {client.first_name && client.last_name
                        ? `${client.first_name} ${client.last_name}`
                        : client.full_name || "No Name"}
                    </p>
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Edit Form */}
          {selectedClient && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">
                Edit Client: {selectedClient.first_name} {selectedClient.last_name}
              </h3>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <PersonalDetailsFields
                    control={form.control}
                    emailDisabled={true}
                    emailValue={selectedClient.email}
                  />
                  
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedClient(null);
                        setSearchResults([]);
                        setSearchQuery("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updating}>
                      {updating ? "Updating..." : "Update Client"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Care Team Card - Only shown when a client is selected */}
      {selectedClient && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Care Team
            </CardTitle>
            <CardDescription>
              Staff members assigned to this client
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCareTeam ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading care team...
              </div>
            ) : careTeam.length === 0 ? (
              <p className="text-sm text-muted-foreground">No care team members assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {careTeam.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {member.staff?.full_name?.charAt(0) || member.staff?.email?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.staff?.full_name || member.staff?.email || 'Unknown'}
                        </p>
                        {member.staff?.email && member.staff?.full_name && (
                          <p className="text-xs text-muted-foreground">{member.staff.email}</p>
                        )}
                        {member.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">{member.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRoleBadge(member.staff_role)}
                      {member.is_primary && (
                        <Badge variant="outline" className="border-primary text-primary">
                          Primary
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
