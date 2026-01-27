import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Search, Copy, ChevronLeft, ChevronRight, Mail, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

interface EmailNotification {
  id: string;
  user_id: string;
  notification_type: string;
  status: string | null;
  sent_at: string | null;
  profile_email?: string;
  profile_name?: string;
}

const PAGE_SIZE = 25;

export default function EmailLog() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState<EmailNotification[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [initialized, setInitialized] = useState(false);
  
  // Filters
  const [emailFilter, setEmailFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  
  // Filter options
  const [notificationTypes, setNotificationTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  
  // Selected email for details
  const [selectedEmail, setSelectedEmail] = useState<EmailNotification | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Read email from query params on mount
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmailFilter(emailParam);
    }
    loadFilterOptions();
    setInitialized(true);
  }, [searchParams]);

  // Load emails when initialized or page changes
  useEffect(() => {
    if (initialized) {
      loadEmails();
    }
  }, [currentPage, initialized]);

  const loadFilterOptions = async () => {
    const { data: types } = await supabase
      .from("email_notifications")
      .select("notification_type")
      .order("notification_type");
    
    if (types) {
      const uniqueTypes = [...new Set(types.map(t => t.notification_type))];
      setNotificationTypes(uniqueTypes);
    }

    const { data: statusData } = await supabase
      .from("email_notifications")
      .select("status")
      .order("status");
    
    if (statusData) {
      const uniqueStatuses = [...new Set(statusData.map(s => s.status).filter(Boolean))] as string[];
      setStatuses(uniqueStatuses);
    }
  };

  const loadEmails = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("email_notifications")
        .select("id, user_id, notification_type, status, sent_at", { count: "exact" });
      
      if (typeFilter !== "all") {
        query = query.eq("notification_type", typeFilter);
      }
      
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      
      if (dateFrom) {
        query = query.gte("sent_at", `${dateFrom}T00:00:00`);
      }
      
      if (dateTo) {
        query = query.lte("sent_at", `${dateTo}T23:59:59`);
      }

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: notifications, count, error } = await query
        .order("sent_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        setEmails([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(notifications.map(n => n.user_id))];
      
      // Admin: fetch profiles_public for names, then admin RPC for email
      const profileMap = new Map<string, { email?: string; full_name?: string; first_name?: string; last_name?: string }>();
      
      for (const userId of userIds) {
        const [{ data: pub }, { data: priv }] = await Promise.all([
          supabase.from("profiles_public").select("id, first_name, display_name").eq("id", userId).maybeSingle(),
          supabase.rpc('admin_get_profile_private', { p_user_id: userId })
        ]);
        
        if (pub) {
          profileMap.set(userId, {
            first_name: pub.first_name,
            full_name: priv?.[0]?.full_name || pub.display_name,
            last_name: priv?.[0]?.last_name,
            email: priv?.[0]?.email,
          });
        }
      }

      let enrichedEmails: EmailNotification[] = notifications.map(n => {
        const profile = profileMap.get(n.user_id);
        const name = profile?.full_name || 
          (profile?.first_name || profile?.last_name 
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() 
            : undefined);
        return {
          ...n,
          profile_email: profile?.email,
          profile_name: name,
        };
      });

      if (emailFilter.trim()) {
        const lowerFilter = emailFilter.toLowerCase();
        enrichedEmails = enrichedEmails.filter(e => 
          e.profile_email?.toLowerCase().includes(lowerFilter)
        );
      }

      setEmails(enrichedEmails);
      setTotalCount(emailFilter.trim() ? enrichedEmails.length : (count || 0));
    } catch (error) {
      console.error("Error loading emails:", error);
      toast.error("Unable to load email log. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    loadEmails();
  };

  const handleRowClick = (email: EmailNotification) => {
    setSelectedEmail(email);
    setDrawerOpen(true);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Sent</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status || "Unknown"}</Badge>;
    }
  };

  const copyDebugSummary = () => {
    if (!selectedEmail) return;
    
    const summary = `
Email Log Summary
=================
Email: ${selectedEmail.profile_email || "N/A"}
Name: ${selectedEmail.profile_name || "—"}
User ID: ${selectedEmail.user_id}

Notification Type: ${selectedEmail.notification_type}
Status: ${selectedEmail.status || "Unknown"}
Sent At: ${selectedEmail.sent_at ? format(new Date(selectedEmail.sent_at), "PPpp") : "N/A"}

Email Notification ID: ${selectedEmail.id}
    `.trim();

    navigator.clipboard.writeText(summary);
    toast.success("Email summary copied.");
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getSummaryText = () => {
    const parts = [];
    if (dateFrom && dateTo) {
      parts.push(`${format(new Date(dateFrom), "MMM d")} - ${format(new Date(dateTo), "MMM d, yyyy")}`);
    }
    if (statusFilter !== "all") {
      parts.push(`Status: ${statusFilter}`);
    }
    if (typeFilter !== "all") {
      parts.push(`Type: ${typeFilter}`);
    }
    if (emailFilter.trim()) {
      parts.push(`Email: "${emailFilter}"`);
    }
    return parts.length > 0 ? parts.join(", ") : "All emails";
  };

  return (
    <AdminPageLayout 
      title="Email Log" 
      subtitle="Audit and debug all outgoing emails"
      activeSection="system-health"
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email-filter">Email</Label>
                <Input
                  id="email-filter"
                  placeholder="Search by email..."
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notification Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {notificationTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">From</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-to">To</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <Button onClick={handleApplyFilters} disabled={loading}>
                <Search className="h-4 w-4 mr-2" />
                Apply Filters
              </Button>
              <p className="text-sm text-muted-foreground">
                Showing {totalCount} email{totalCount !== 1 ? "s" : ""} ({getSummaryText()})
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No emails found for the selected filters.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Notification Type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emails.map((email) => (
                        <TableRow
                          key={email.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleRowClick(email)}
                        >
                          <TableCell className="font-mono text-sm">
                            {email.sent_at
                              ? format(new Date(email.sent_at), "MMM d, yyyy HH:mm")
                              : "—"}
                          </TableCell>
                          <TableCell>{email.profile_email || "—"}</TableCell>
                          <TableCell>{email.profile_name || "—"}</TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {email.notification_type.replace(/_/g, " ")}
                            </span>
                          </TableCell>
                          <TableCell>{getStatusBadge(email.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y">
                  {emails.map((email) => (
                    <div
                      key={email.id}
                      className="p-4 cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(email)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">
                          {email.profile_email || "—"}
                        </span>
                        {getStatusBadge(email.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {email.notification_type.replace(/_/g, " ")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {email.sent_at
                          ? format(new Date(email.sent_at), "MMM d, yyyy HH:mm")
                          : "—"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedEmail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Details
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Header Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="font-medium">{selectedEmail.profile_email || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span>{selectedEmail.profile_name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Sent At</span>
                    <span>
                      {selectedEmail.sent_at
                        ? format(new Date(selectedEmail.sent_at), "PPpp")
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    {getStatusBadge(selectedEmail.status)}
                  </div>
                </div>

                <hr />

                {/* Main Info */}
                <div className="space-y-3">
                  <h4 className="font-medium">Notification Details</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <span>{selectedEmail.notification_type.replace(/_/g, " ")}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">User ID</span>
                    <p className="font-mono text-xs break-all mt-1">{selectedEmail.user_id}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Notification ID</span>
                    <p className="font-mono text-xs break-all mt-1">{selectedEmail.id}</p>
                  </div>
                </div>

                <hr />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={copyDebugSummary} variant="outline" className="flex-1">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Summary
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminPageLayout>
  );
}