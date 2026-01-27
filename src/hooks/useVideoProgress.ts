import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UseVideoProgressReturn {
  markComplete: (videoId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to manage video progress tracking
 * Allows marking videos as complete via the secure RPC function
 */
export function useVideoProgress(): UseVideoProgressReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const markComplete = useCallback(async (videoId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("mark_video_complete", {
        p_video_id: videoId,
      });

      if (rpcError) {
        console.error("[useVideoProgress] RPC error:", rpcError);
        setError(rpcError.message || "Failed to mark video complete");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save your progress. Please try again.",
        });
        return false;
      }

      toast({
        title: "Video completed!",
        description: "Your progress has been saved.",
      });
      return true;
    } catch (err: any) {
      console.error("[useVideoProgress] Unexpected error:", err);
      setError(err.message || "Unexpected error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { markComplete, loading, error };
}
