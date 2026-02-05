import { Video } from "lucide-react";
import { getYouTubeThumbnailUrl } from "@/types/workout-builder";

interface VideoThumbnailProps {
  videoUrl?: string;
  exerciseName: string;
  size?: "sm" | "md";
}

export function VideoThumbnail({ videoUrl, exerciseName, size = "sm" }: VideoThumbnailProps) {
  const dimensions = size === "sm" ? "h-10 w-16" : "h-14 w-24";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-6 w-6";

  if (!videoUrl) {
    return (
      <div
        className={`${dimensions} rounded bg-muted flex items-center justify-center shrink-0`}
      >
        <Video className={`${iconSize} text-muted-foreground`} />
      </div>
    );
  }

  const thumbnailUrl = getYouTubeThumbnailUrl(videoUrl);

  if (!thumbnailUrl) {
    return (
      <a
        href={videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${dimensions} rounded bg-muted flex items-center justify-center shrink-0 hover:scale-105 hover:ring-2 hover:ring-primary transition-all`}
      >
        <Video className={`${iconSize} text-muted-foreground`} />
      </a>
    );
  }

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${dimensions} rounded overflow-hidden shrink-0 hover:scale-105 hover:ring-2 hover:ring-primary transition-all`}
    >
      <img
        src={thumbnailUrl}
        alt={`${exerciseName} demo`}
        className="h-full w-full object-cover"
      />
    </a>
  );
}
