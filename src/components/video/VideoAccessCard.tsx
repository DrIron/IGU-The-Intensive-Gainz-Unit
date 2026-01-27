import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Eye, CheckCircle2, Pin } from "lucide-react";
import { SecureVideoPlayer } from "./SecureVideoPlayer";

export type VideoAccessState = "unlocked" | "locked" | "preview";

interface VideoAccessCardProps {
  id: string;
  title: string;
  description: string | null;
  category: string;
  isPinned: boolean;
  isFreePreview: boolean;
  accessState: VideoAccessState;
  isCompleted: boolean;
  onComplete?: (videoId: string) => void;
  completionLoading?: boolean;
}

/**
 * Video card component with access state visualization
 * Shows locked/unlocked/preview states with appropriate UI
 */
export function VideoAccessCard({
  id,
  title,
  description,
  category,
  isPinned,
  isFreePreview,
  accessState,
  isCompleted,
  onComplete,
  completionLoading,
}: VideoAccessCardProps) {
  const isAccessible = accessState === "unlocked" || accessState === "preview";

  const getAccessBadge = () => {
    switch (accessState) {
      case "unlocked":
        return (
          <Badge variant="default" className="gap-1">
            <Unlock className="h-3 w-3" />
            Unlocked
          </Badge>
        );
      case "preview":
        return (
          <Badge variant="secondary" className="gap-1">
            <Eye className="h-3 w-3" />
            Free Preview
          </Badge>
        );
      case "locked":
        return (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        );
    }
  };

  return (
    <Card 
      className={`overflow-hidden transition-all ${
        accessState === "locked" 
          ? "opacity-75 hover:opacity-85" 
          : "hover:shadow-lg"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg line-clamp-2">{title}</CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {isPinned && (
              <Badge variant="secondary" className="shrink-0">
                <Pin className="h-3 w-3" />
              </Badge>
            )}
            {isCompleted && (
              <Badge variant="default" className="gap-1 bg-primary">
                <CheckCircle2 className="h-3 w-3" />
                Done
              </Badge>
            )}
          </div>
        </div>
        
        {/* Description only shown for accessible videos */}
        {isAccessible && description ? (
          <CardDescription className="line-clamp-2">
            {description}
          </CardDescription>
        ) : accessState === "locked" ? (
          <CardDescription className="italic text-muted-foreground/70">
            Upgrade your plan to access this content
          </CardDescription>
        ) : null}
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{category}</Badge>
          {getAccessBadge()}
        </div>

        {/* Video player for accessible content */}
        {isAccessible ? (
          <div className="space-y-2">
            <SecureVideoPlayer
              videoId={id}
              title={title}
              showWatermark
              onVideoEnd={() => !isCompleted && onComplete?.(id)}
            />
            
            {/* Complete button for accessible, non-completed videos */}
            {!isCompleted && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => onComplete?.(id)}
                disabled={completionLoading}
              >
                <CheckCircle2 className="h-4 w-4" />
                {completionLoading ? "Saving..." : "Mark as Complete"}
              </Button>
            )}
          </div>
        ) : (
          /* Locked state placeholder */
          <div className="aspect-video bg-muted/50 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
            <div className="text-center p-4">
              <Lock className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {isFreePreview 
                  ? "Sign in to watch this preview"
                  : "This content requires an active subscription"
                }
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
