import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Eye, CheckCircle2 } from "lucide-react";

interface EngagementRow {
  video_id: string;
  title: string;
  category: string;
  is_active: boolean;
  is_pinned: boolean;
  is_free_preview: boolean;
  total_views: number;
  unique_viewers: number;
  completions: number;
  completion_rate: number;
  last_viewed_at: string | null;
  avg_days_to_complete: number | null;
  created_at: string;
}

export default function ContentEngagement() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_video_engagement_stats");
      if (error) throw error;
      setRows((data ?? []) as EngagementRow[]);
    } catch (e: unknown) {
      toast({ title: "Failed to load engagement stats", variant: "destructive" });
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const totalVideos = rows.length;
  const totalViews = rows.reduce((acc, r) => acc + Number(r.total_views), 0);
  const totalCompletions = rows.reduce((acc, r) => acc + Number(r.completions), 0);
  const avgCompletionRate = totalVideos > 0
    ? Math.round(rows.reduce((acc, r) => acc + Number(r.completion_rate), 0) / totalVideos)
    : 0;

  return (
    <AdminPageLayout title="Content Engagement" subtitle="How clients are using the educational library." activeSection="admin-content-engagement">
      <div className="space-y-6 pb-24 md:pb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> Content Engagement
          </h1>
          <p className="text-muted-foreground">How clients are using the educational library.</p>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total videos</CardDescription>
              <CardTitle className="text-2xl">{totalVideos}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total views</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Eye className="h-5 w-5" />{totalViews.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completions</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />{totalCompletions.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg completion rate</CardDescription>
              <CardTitle className="text-2xl">{avgCompletionRate}%</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Per-video breakdown</CardTitle>
            <CardDescription>Sorted by views, descending.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No videos yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Viewers</TableHead>
                    <TableHead className="text-right">Completions</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Avg days</TableHead>
                    <TableHead className="text-right">Last viewed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.video_id} className={!r.is_active ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        <div className="flex gap-1 mt-1">
                          {!r.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                          {r.is_pinned && <Badge variant="secondary" className="text-xs">Pinned</Badge>}
                          {r.is_free_preview && <Badge variant="secondary" className="text-xs">Free preview</Badge>}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.total_views).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.unique_viewers).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.completions).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.completion_rate).toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{r.avg_days_to_complete != null ? Number(r.avg_days_to_complete).toFixed(1) : "--"}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.last_viewed_at ? new Date(r.last_viewed_at).toLocaleDateString() : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
