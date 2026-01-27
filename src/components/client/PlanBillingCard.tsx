import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Calendar, CreditCard, Package } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionAddon {
  id: string;
  name: string;
  price_kwd: number;
  specialty: string;
  status: string;
  staff_profile?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface PlanBillingCardProps {
  subscription: any;
  onManageBilling?: () => void;
}

export function PlanBillingCard({ subscription, onManageBilling }: PlanBillingCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [addons, setAddons] = useState<SubscriptionAddon[]>([]);

  useEffect(() => {
    if (subscription?.id) {
      loadAddons();
    }
  }, [subscription?.id]);

  const loadAddons = async () => {
    // Fetch addons with staff profile info
    const { data: addonsData } = await supabase
      .from("subscription_addons")
      .select("id, name, price_kwd, specialty, status, staff_user_id")
      .eq("subscription_id", subscription.id)
      .eq("status", "active");
    
    if (!addonsData || addonsData.length === 0) {
      setAddons([]);
      return;
    }

    // Load staff names from coaches_client_safe (care team staff are coaches)
    // NOT profiles_public - RLS would block since these are staff, not clients
    const staffIds = addonsData.filter(a => a.staff_user_id).map(a => a.staff_user_id);
    const { data: staffData } = await supabase
      .from("coaches_client_safe")
      .select("user_id, first_name, last_name")
      .in("user_id", staffIds);

    const staffMap = new Map(staffData?.map(s => [s.user_id, { first_name: s.first_name, last_name: s.last_name }]) || []);

    const enrichedAddons = addonsData.map(addon => ({
      ...addon,
      staff_profile: addon.staff_user_id ? staffMap.get(addon.staff_user_id) : null,
    }));

    setAddons(enrichedAddons);
  };

  const getStatusBadge = () => {
    const status = subscription?.status;
    if (status === "active") return <Badge className="bg-status-success">Active</Badge>;
    if (status === "pending") return <Badge variant="outline">Pending</Badge>;
    if (status === "failed" || status === "inactive") return <Badge variant="destructive">Overdue</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const formatNextBilling = () => {
    if (!subscription?.next_billing_date) return "N/A";
    return format(new Date(subscription.next_billing_date), "dd MMM yyyy");
  };

  const getStaffName = (addon: SubscriptionAddon) => {
    if (!addon.staff_profile) return null;
    return `${addon.staff_profile.first_name || ''} ${addon.staff_profile.last_name || ''}`.trim();
  };

  const basePrice = subscription?.base_price_kwd ?? subscription?.services?.price_kwd ?? 0;
  const addonsTotal = addons.reduce((sum, a) => sum + a.price_kwd, 0);
  const totalMonthly = basePrice + addonsTotal;
  const hasDiscount = subscription?.discount_code_id && subscription?.billing_amount_kwd && subscription.billing_amount_kwd < basePrice;

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
            <CardTitle className="text-lg">Current Plan</CardTitle>
              <p className="text-2xl font-bold mt-2">{subscription?.services?.name || "No Plan"}</p>
              <p className="text-xs text-primary font-medium mt-1">
                Manual monthly payment
              </p>
              {subscription?.services?.type === "team" && (
                <p className="text-xs text-muted-foreground">
                  Team training plan – nutrition is self-service through the app
                </p>
              )}
              {subscription?.services?.type === "one_to_one" && (
                <p className="text-xs text-muted-foreground">
                  1:1 coaching plan – personalized support from your coach
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowCancelDialog(true)} className="text-destructive">
                    Cancel Subscription
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Pricing breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base plan</span>
              <span>
                {basePrice} KWD
                {hasDiscount && (
                  <span className="line-through ml-2 text-xs text-muted-foreground">
                    {subscription.services.price_kwd} KWD
                  </span>
                )}
              </span>
            </div>
            
            {addons.length > 0 && (
              <>
                <div className="pt-1 pb-1 border-t border-dashed">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Care Team Add-ons
                  </span>
                </div>
                {addons.map((addon) => {
                  const staffName = getStaffName(addon);
                  return (
                    <div key={addon.id} className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {addon.name}
                        </span>
                        {staffName && (
                          <span className="text-xs text-muted-foreground/70 ml-4">
                            with {staffName}
                          </span>
                        )}
                      </div>
                      <span>+{addon.price_kwd} KWD</span>
                    </div>
                  );
                })}
              </>
            )}

            {subscription?.discount_code_id && subscription?.discount_codes && (
              <div className="flex justify-between text-green-600">
                <span className="flex items-center gap-1">
                  Discount ({subscription.discount_codes.code})
                </span>
                <span>Applied</span>
              </div>
            )}
            
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Monthly total</span>
              <span>{subscription?.billing_amount_kwd ?? totalMonthly} KWD</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Next Billing: {formatNextBilling()}</span>
          </div>
          <Button className="w-full" onClick={onManageBilling}>
            <CreditCard className="h-4 w-4 mr-2" />
            Manage Billing
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? This action cannot be undone.
              Type CANCEL to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirm Cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
