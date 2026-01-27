import { useState } from "react";
import ClientList from "@/components/ClientList";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Users, Search } from "lucide-react";
import { RoleBreadcrumb } from "@/components/coach/RoleBreadcrumb";
import { DebugBanner } from "@/components/coach/DebugBanner";

export function AdminClientDirectory() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

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

      {/* Header with Title and Badge */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-5 w-5" />
                  Admin Client Directory
                </CardTitle>
                <Badge variant="default" className="hidden sm:flex gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
              </div>
              <CardDescription>
                Global view (Admin only) — View and manage all coaching clients across IGU
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Filters Row */}
          <div className="flex flex-wrap gap-3 mb-4">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
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

            {/* Plan Filter */}
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="one_to_one">1:1 Plans</SelectItem>
                <SelectItem value="team">Team Plans</SelectItem>
              </SelectContent>
            </Select>

            {/* Coach Filter */}
            <Select value={coachFilter} onValueChange={setCoachFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Coach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coaches</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {/* Dynamic coach list would be populated here */}
              </SelectContent>
            </Select>

            {/* Payment Filter */}
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="exempt">Payment Exempt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Client List */}
          <ClientList filter={getFilterProp()} />
        </CardContent>
      </Card>
    </div>
  );
}
