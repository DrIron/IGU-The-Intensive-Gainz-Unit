import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Shield, 
  Search, 
  RefreshCw, 
  Eye, 
  Download, 
  Key, 
  FileText,
  User,
  Calendar,
  Globe,
  AlertTriangle
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

interface PHIAccessLog {
  id: string;
  actor_user_id: string;
  target_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  fields_accessed: string[] | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

interface ActorProfile {
  id: string;
  display_name: string | null;
  first_name: string | null;
}

export function PHIAccessAuditLog() {
  const [actorFilter, setActorFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");

  const startDate = startOfDay(subDays(new Date(), parseInt(dateRange)));
  const endDate = endOfDay(new Date());

  // Fetch logs
  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["phi-access-logs", actorFilter, targetFilter, actionFilter, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("phi_access_audit_log")
        .select("*")
        .gte("occurred_at", startDate.toISOString())
        .lte("occurred_at", endDate.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PHIAccessLog[];
    },
  });

  // Fetch actor profiles for display names
  const actorIds = [...new Set(logs?.map(l => l.actor_user_id) || [])];
  const targetIds = [...new Set(logs?.map(l => l.target_user_id).filter(Boolean) || [])] as string[];
  const allUserIds = [...new Set([...actorIds, ...targetIds])];

  const { data: profiles } = useQuery({
    queryKey: ["phi-audit-profiles", allUserIds.join(",")],
    queryFn: async () => {
      if (allUserIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles_public")
        .select("id, display_name, first_name")
        .in("id", allUserIds);
      
      const profileMap: Record<string, ActorProfile> = {};
      data?.forEach(p => {
        profileMap[p.id] = p;
      });
      return profileMap;
    },
    enabled: allUserIds.length > 0,
  });

  const getDisplayName = (userId: string | null) => {
    if (!userId) return "—";
    const profile = profiles?.[userId];
    return profile?.display_name || profile?.first_name || userId.slice(0, 8) + "...";
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "decrypt": return <Key className="h-4 w-4" />;
      case "view": return <Eye className="h-4 w-4" />;
      case "export": return <Download className="h-4 w-4" />;
      case "bulk_export": return <Download className="h-4 w-4" />;
      case "query": return <Search className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, string> = {
      decrypt: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      view: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      export: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      bulk_export: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      query: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    };
    return (
      <Badge className={cn("flex items-center gap-1", variants[action] || variants.query)}>
        {getActionIcon(action)}
        {action}
      </Badge>
    );
  };

  // Filter logs client-side for actor/target name search
  const filteredLogs = logs?.filter(log => {
    if (actorFilter) {
      const actorName = getDisplayName(log.actor_user_id).toLowerCase();
      if (!actorName.includes(actorFilter.toLowerCase()) && 
          !log.actor_user_id.includes(actorFilter)) {
        return false;
      }
    }
    if (targetFilter) {
      const targetName = getDisplayName(log.target_user_id).toLowerCase();
      if (!targetName.includes(targetFilter.toLowerCase()) && 
          !(log.target_user_id?.includes(targetFilter))) {
        return false;
      }
    }
    return true;
  });

  // Stats
  const stats = {
    total: filteredLogs?.length || 0,
    decrypts: filteredLogs?.filter(l => l.action === "decrypt").length || 0,
    views: filteredLogs?.filter(l => l.action === "view").length || 0,
    exports: filteredLogs?.filter(l => ["export", "bulk_export"].includes(l.action)).length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            PHI Access Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">
            HIPAA compliance tracking for all PHI access events
          </p>
        </div>
        <Button 
          onClick={() => refetch()} 
          disabled={isRefetching}
          variant="outline"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Events</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-warning" />
              <div>
                <div className="text-2xl font-bold">{stats.decrypts}</div>
                <div className="text-xs text-muted-foreground">Decryptions</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{stats.views}</div>
                <div className="text-xs text-muted-foreground">Views</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-destructive" />
              <div>
                <div className="text-2xl font-bold">{stats.exports}</div>
                <div className="text-xs text-muted-foreground">Exports</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="actor-filter" className="flex items-center gap-1">
                <User className="h-3 w-3" /> Actor
              </Label>
              <Input
                id="actor-filter"
                placeholder="Filter by actor name/ID..."
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-filter" className="flex items-center gap-1">
                <User className="h-3 w-3" /> Target
              </Label>
              <Input
                id="target-filter"
                placeholder="Filter by target name/ID..."
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-filter">Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger id="action-filter">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="decrypt">Decrypt</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="export">Export</SelectItem>
                  <SelectItem value="bulk_export">Bulk Export</SelectItem>
                  <SelectItem value="query">Query</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-range" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date Range
              </Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger id="date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Access Events</CardTitle>
          <CardDescription>
            Showing {filteredLogs?.length || 0} events from the last {dateRange} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs && filteredLogs.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>IP / Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.occurred_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getDisplayName(log.actor_user_id)}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {log.actor_user_id.slice(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        {log.target_user_id ? (
                          <>
                            <div className="font-medium">{getDisplayName(log.target_user_id)}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {log.target_user_id.slice(0, 8)}...
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.fields_accessed && log.fields_accessed.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.fields_accessed.slice(0, 3).map(field => (
                              <Badge key={field} variant="outline" className="text-xs">
                                {field}
                              </Badge>
                            ))}
                            {log.fields_accessed.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{log.fields_accessed.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.resource_type ? (
                          <Badge variant="secondary" className="text-xs">
                            {log.resource_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.ip_address || log.user_agent ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3" />
                            {log.ip_address || "—"}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No PHI access events found for the selected filters.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Note */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">HIPAA Compliance</p>
              <p>
                This log tracks all access to Protected Health Information (PHI) including 
                decryption events, data views, and exports. Retain logs for a minimum of 6 years 
                per HIPAA requirements. Contact your compliance officer for audit requests.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
