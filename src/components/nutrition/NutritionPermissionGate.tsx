import { ReactNode } from "react";
import { useNutritionPermissions } from "@/hooks/useNutritionPermissions";
import { Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface NutritionPermissionGateProps {
  clientUserId: string;
  children: ReactNode;
  /** If true, shows read-only message instead of hiding content */
  showReadOnlyMessage?: boolean;
  /** Custom message when access is denied */
  deniedMessage?: string;
}

/**
 * Permission wrapper component for nutrition editing.
 *
 * When a dietitian is assigned to a client:
 * - Dietitian can edit nutrition
 * - Coach becomes read-only
 *
 * Use this to wrap any editable nutrition components.
 */
export function NutritionPermissionGate({
  clientUserId,
  children,
  showReadOnlyMessage = true,
  deniedMessage,
}: NutritionPermissionGateProps) {
  const { canEdit, isLoading, clientHasDietitian, currentUserRole } = useNutritionPermissions({
    clientUserId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (canEdit) {
    return <>{children}</>;
  }

  if (!showReadOnlyMessage) {
    return null;
  }

  // Construct appropriate message based on context
  let message = deniedMessage;
  if (!message) {
    if (currentUserRole === 'coach' && clientHasDietitian) {
      message = "Nutrition management is handled by the assigned dietitian. You have read-only access.";
    } else if (currentUserRole === 'none') {
      message = "You do not have permission to edit nutrition for this client.";
    } else {
      message = "You have read-only access to this section.";
    }
  }

  return (
    <Alert className="bg-muted/50">
      <Lock className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
