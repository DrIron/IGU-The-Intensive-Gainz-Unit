import { useState } from "react";
import ClientList from "@/components/ClientList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleBreadcrumb } from "@/components/coach/RoleBreadcrumb";
import { DebugBanner } from "@/components/coach/DebugBanner";

export function AdminClientDirectory() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Status filter options
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending Onboarding" },
    { value: "pending_coach_approval", label: "Pending Coach Approval" },
    { value: "pending_payment", label: "Pending Payment" },
    { value: "needs_medical_review", label: "Needs Medical Review" },
    { value: "cancelled", label: "Cancelled" },
    { value: "inactive", label: "Inactive" },
  ];

  // Derive filter prop for ClientList based on status
  const getFilterProp = () => {
    if (statusFilter === "all") return undefined;
    return statusFilter;
  };

  return (
    <div className="space-y-6">
      {/* Debug Banner (dev only) */}
      <DebugBanner 
        role="admin"
        viewMode="admin"
        activeTab="clients"
      />

      {/* Role Breadcrumb */}
      <RoleBreadcrumb role="admin" currentPage="Client Directory" />

      {/* Status Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Client List */}
      <ClientList filter={getFilterProp()} />
    </div>
  );
}
