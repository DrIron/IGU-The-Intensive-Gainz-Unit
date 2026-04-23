import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonPanelProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * Placeholder used by tabs that are wired into the nav but not yet built.
 * Keeps deep links from 404'ing and makes the full nav shape visible while
 * individual sections ship one PR at a time.
 */
export function ComingSoonPanel({ icon: Icon, title, description }: ComingSoonPanelProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
        </div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Coming soon
        </p>
      </CardContent>
    </Card>
  );
}
