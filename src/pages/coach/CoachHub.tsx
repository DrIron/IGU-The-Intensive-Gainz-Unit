import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CoachShell } from "@/components/coach/CoachShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/lib/utils";
import { Search, Play, BookOpen, Lock, PlayCircle, FileText, Award, ExternalLink, GraduationCap } from "lucide-react";
import { CoachTrainingDashboard } from "@/pages/coach/CoachTrainingDashboard";

interface CoachContentRow {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  external_url: string | null;
  cover_url: string | null;
  duration_minutes: number | null;
  content_type: "video" | "ebook" | "course" | "link";
  section: "training" | "library" | "resources";
  category: string | null;
  level: "intro" | "advanced" | null;
  author: string | null;
}

type HubTab = "training" | "library" | "resources";
const TABS: { value: HubTab; label: string; icon: typeof PlayCircle }[] = [
  { value: "training", label: "Training", icon: GraduationCap },
  { value: "library", label: "Library", icon: PlayCircle },
  { value: "resources", label: "Resources", icon: BookOpen },
];

function openExternal(url: string | null) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export default function CoachHub() {
  const { user } = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: HubTab = tabParam === "library" || tabParam === "resources" ? tabParam : "training";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [rows, setRows] = useState<CoachContentRow[]>([]);
  const fetched = useRef(false);

  useDocumentTitle({ title: "Coach Hub", description: "Coach-only training, library, and resources" });

  const setTab = (next: HubTab) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
  };

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    void (async () => {
      const { data, error } = await supabase
        .from("coach_educational_content")
        .select("id, title, description, video_url, external_url, cover_url, duration_minutes, content_type, section, category, level, author")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) console.error("[CoachHub] load:", error.message);
      else setRows((data ?? []) as CoachContentRow[]);
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const matchesSearch = (r: CoachContentRow) =>
    !q || r.title.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q);

  const libraryRows = rows.filter((r) => r.section === "library");
  const categories = useMemo(() => Array.from(new Set(libraryRows.map((r) => r.category).filter(Boolean) as string[])), [libraryRows]);
  const visibleLibrary = libraryRows.filter(
    (r) => matchesSearch(r) && (category === "all" || r.category === category) && (level === "all" || r.level === level),
  );
  const resourceRows = rows.filter((r) => r.section === "resources" && matchesSearch(r));
  const ebooks = resourceRows.filter((r) => r.content_type === "ebook" || r.content_type === "link");
  const courses = resourceRows.filter((r) => r.content_type === "course");

  return (
    <CoachShell>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Coach Hub</h1>
            <p className="text-muted-foreground mt-1">Advanced training, a coach-only library, and recommended courses &amp; reading.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-600 dark:text-sky-400">
            <Lock className="h-3 w-3" aria-hidden /> Coaches only
          </span>
        </div>

        {/* Segmented control + shared search */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border bg-card p-1 self-start" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-[40px]",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t.label}
                </button>
              );
            })}
          </div>
          {tab !== "training" && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "library" ? "Search the library..." : "Search resources..."}
                className="pl-10"
              />
            </div>
          )}
        </div>

        {tab === "training" && (user?.id ? <CoachTrainingDashboard coachUserId={user.id} /> : null)}

        {tab === "library" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip label="All" active={category === "all"} onClick={() => setCategory("all")} />
              {categories.map((c) => (
                <FilterChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
              ))}
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              {(["all", "intro", "advanced"] as const).map((l) => (
                <FilterChip key={l} label={l === "all" ? "All levels" : l[0].toUpperCase() + l.slice(1)} active={level === l} onClick={() => setLevel(l)} />
              ))}
            </div>

            {visibleLibrary.length === 0 ? (
              <EmptyState icon={PlayCircle} title="Nothing here yet" body="Advanced coach-only videos will appear here." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleLibrary.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openExternal(r.video_url ?? r.external_url)}
                    className="overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="relative flex h-32 items-center justify-center bg-muted">
                      {r.cover_url ? (
                        <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Play className="h-8 w-8 text-muted-foreground" aria-hidden />
                      )}
                      {r.duration_minutes ? (
                        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{r.duration_minutes} min</span>
                      ) : null}
                      {r.level && (
                        <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px]", r.level === "advanced" ? "bg-pink-500/20 text-pink-300" : "bg-emerald-500/15 text-emerald-400")}>
                          {r.level[0].toUpperCase() + r.level.slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium">{r.title}</p>
                      {r.category && <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.category}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "resources" && (
          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Recommended reading</h2>
              {ebooks.length === 0 ? (
                <EmptyState icon={FileText} title="No reading yet" body="Ebooks, guides, and useful links will appear here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {ebooks.map((r) => (
                    <div key={r.id} className="flex gap-3 rounded-xl border bg-card p-3">
                      <div className="flex h-[72px] w-[54px] shrink-0 items-center justify-center rounded-md border bg-muted">
                        <FileText className="h-6 w-6 text-sky-500" aria-hidden />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{r.title}</p>
                        {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                        <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => openExternal(r.external_url)}>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          {r.content_type === "ebook" ? "Open PDF" : "Open"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium">Courses &amp; certifications</h2>
              {courses.length === 0 ? (
                <EmptyState icon={Award} title="No courses yet" body="Recommended courses and certifications will appear here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {courses.map((r) => (
                    <div key={r.id} className="rounded-xl border bg-card p-4">
                      <div className="mb-2 flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Award className="h-5 w-5 text-amber-500" aria-hidden />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{r.title}</p>
                          {r.author && <p className="text-xs text-muted-foreground">{r.author}</p>}
                        </div>
                      </div>
                      {r.description && <p className="mb-3 text-xs text-muted-foreground">{r.description}</p>}
                      <button type="button" onClick={() => openExternal(r.external_url)} className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline dark:text-sky-400">
                        View course <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
    </CoachShell>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors",
        active ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground hover:bg-muted/50",
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof PlayCircle; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed py-12 text-center">
      <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
