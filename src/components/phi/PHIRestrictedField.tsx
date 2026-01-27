import { ReactNode } from "react";
import { Lock, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PHIRestrictedFieldProps {
  /** The actual value to display (if user has access) */
  value: ReactNode;
  /** Whether the current user can view this field */
  canView: boolean;
  /** Label for the field */
  label?: string;
  /** Show a placeholder when restricted */
  placeholder?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Component that conditionally displays PHI/PII fields based on user role.
 * Shows a restricted placeholder for coaches, actual value for admins/owners.
 */
export function PHIRestrictedField({
  value,
  canView,
  label,
  placeholder = "Access restricted",
  className = "",
}: PHIRestrictedFieldProps) {
  if (canView) {
    return (
      <div className={className}>
        {label && <p className="text-sm text-muted-foreground">{label}</p>}
        <p className="font-medium">{value || "Not provided"}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span className="text-sm italic">{placeholder}</span>
      </div>
    </div>
  );
}

interface MedicalSectionHeaderProps {
  title: string;
  isReadOnly: boolean;
  showAdminBadge?: boolean;
}

/**
 * Header for medical/PHI sections that indicates read-only status for coaches.
 */
export function MedicalSectionHeader({
  title,
  isReadOnly,
  showAdminBadge = false,
}: MedicalSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        {isReadOnly && <Shield className="h-5 w-5 text-muted-foreground" />}
        {title}
      </h3>
      <div className="flex items-center gap-2">
        {isReadOnly && (
          <Badge variant="outline" className="text-xs">
            <Lock className="h-3 w-3 mr-1" />
            Read-only
          </Badge>
        )}
        {showAdminBadge && (
          <Badge variant="default" className="text-xs bg-primary">
            Admin Access
          </Badge>
        )}
      </div>
    </div>
  );
}

interface PHIBlockedEditAlertProps {
  onClose?: () => void;
}

/**
 * Alert displayed when a coach attempts to edit medical data.
 */
export function PHIBlockedEditAlert({ onClose }: PHIBlockedEditAlertProps) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
      <Shield className="h-5 w-5 text-destructive mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-destructive">Access Denied</p>
        <p className="text-sm text-muted-foreground mt-1">
          Medical data can only be edited by administrators. Contact admin support if changes are required.
        </p>
      </div>
    </div>
  );
}
