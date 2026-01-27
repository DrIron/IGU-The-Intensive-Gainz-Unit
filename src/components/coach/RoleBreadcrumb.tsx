import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RoleBreadcrumbProps {
  role: "admin" | "coach";
  currentPage: string;
}

export function RoleBreadcrumb({ role, currentPage }: RoleBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Badge 
        variant={role === "admin" ? "default" : "secondary"}
        className={role === "admin" ? "bg-primary" : ""}
      >
        {role === "admin" ? "Admin" : "Coach"}
      </Badge>
      <ChevronRight className="h-4 w-4" />
      <span className="font-medium text-foreground">{currentPage}</span>
    </div>
  );
}
