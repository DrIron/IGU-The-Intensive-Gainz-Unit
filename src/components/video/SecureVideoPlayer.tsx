import { useState, useEffect, useRef } from "react";
import { useVideoSignedUrl } from "@/hooks/useVideoSignedUrl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Lock, RefreshCw, AlertTriangle } from "lucide-react";
import { VideoWatermark } from "./VideoWatermark";

interface SecureVideoPlayerProps {
  videoId: string;
  title?: string;
  className?: string;
  autoPlay?: boolean;
  showWatermark?: boolean;
  onError?: (error: string) => void;
  onLoad?: () => void;
  onVideoEnd?: () => void;
}

/**
 * Secure video player that fetches signed URLs from the edge function
 * - Never exposes direct storage URLs
 * - Handles URL expiration and refresh
 * - Shows appropriate error states for access denial
 */
export function SecureVideoPlayer({
  videoId,
  title,
  className = "",
  autoPlay = false,
  showWatermark = false,
  onError,
  onLoad,
  onVideoEnd,
}: SecureVideoPlayerProps) {
  const { getVideoUrl, loading, error } = useVideoSignedUrl();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [hasStarted, setHasStarted] = useState(autoPlay);
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch video URL when component mounts or videoId changes
  const fetchUrl = async () => {
    setIsExpired(false);
    const result = await getVideoUrl(videoId);
    
    if (result) {
      if (result.signed_url) {
        setVideoUrl(result.signed_url);
        setVideoType("storage");
        
        // Set expiration timer (refresh 1 minute before expiry)
        if (result.expires_in) {
          const expiryTime = new Date(Date.now() + result.expires_in * 1000);
          setExpiresAt(expiryTime);
          
          // Clear existing timer
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
          }
          
          // Set timer to refresh URL before it expires
          const refreshDelay = (result.expires_in - 60) * 1000; // 1 minute before expiry
          if (refreshDelay > 0) {
            refreshTimerRef.current = setTimeout(() => {
              setIsExpired(true);
            }, refreshDelay);
          }
        }
      } else if (result.embed_url) {
        setVideoUrl(result.embed_url);
        setVideoType(result.video_type);
      }
      onLoad?.();
    } else if (error) {
      onError?.(error);
    }
  };

  useEffect(() => {
    if (hasStarted) {
      fetchUrl();
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [videoId, hasStarted]);

  const handlePlay = () => {
    setHasStarted(true);
  };

  const handleRefresh = () => {
    fetchUrl();
  };

  // Generate embed URL for YouTube/Loom
  const getEmbedUrl = (url: string, type: string) => {
    if (type === "youtube") {
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      return match ? `https://www.youtube.com/embed/${match[1]}` : url;
    } else if (type === "loom") {
      const match = url.match(/loom\.com\/share\/([^?]+)/);
      return match ? `https://www.loom.com/embed/${match[1]}` : url;
    }
    return url;
  };

  // Initial play button state
  if (!hasStarted) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePlay}
              className="gap-2"
            >
              <Play className="h-5 w-5" />
              {title || "Play Video"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading video...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error/Access denied state
  if (error) {
    const isDenied = error === "Access denied" || error.includes("403");
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <div className="text-center p-4">
              {isDenied ? (
                <>
                  <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Video Access Restricted</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    This video is not available with your current subscription. 
                    Upgrade your plan to access this content.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Unable to Load Video</h3>
                  <p className="text-sm text-muted-foreground mb-3">{error}</p>
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Expired URL state
  if (isExpired) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <div className="text-center p-4">
              <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Video Session Expired</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Click to continue watching
              </p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Continue Watching
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No video URL
  if (!videoUrl) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="aspect-video bg-muted flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Video not available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render video player based on type
  if (videoType === "storage") {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <CardContent className="p-0">
          <div className="relative">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay={autoPlay}
              className="w-full aspect-video"
              onError={() => {
                setIsExpired(true);
              }}
              onEnded={() => {
                onVideoEnd?.();
              }}
            >
              Your browser does not support video playback.
            </video>
            {showWatermark && <VideoWatermark />}
          </div>
        </CardContent>
      </Card>
    );
  }

  // YouTube or Loom embed
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardContent className="p-0">
        <div className="aspect-video relative">
          <iframe
            src={getEmbedUrl(videoUrl, videoType || "external")}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          {showWatermark && <VideoWatermark />}
        </div>
      </CardContent>
    </Card>
  );
}
