/**
 * PricingPayoutsCallout
 * 
 * A simple callout card that directs users to the centralized Pricing & Payouts page.
 * Used in other admin sections where pricing/payment controls used to exist.
 */

import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PricingPayoutsCalloutProps {
  title?: string;
  description?: string;
  showAlert?: boolean;
}

export function PricingPayoutsCallout({ 
  title = "Pricing & Payouts", 
  description = "Service pricing, add-on catalog, and coach payout rates are managed centrally.",
  showAlert = true 
}: PricingPayoutsCalloutProps) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAlert && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              To maintain consistency and prevent conflicts, all pricing configurations, 
              payout percentages, and billing settings are now managed from a single location.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate('/admin/pricing-payouts')}>
            <DollarSign className="h-4 w-4 mr-2" />
            Go to Pricing & Payouts
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/admin/pricing-payouts?tab=payouts')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Coach Payout Rates
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Manage service pricing, add-on catalog, client billing, and payout rules at{" "}
          <code className="bg-muted px-1 py-0.5 rounded">/admin/pricing-payouts</code>
        </p>
      </CardContent>
    </Card>
  );
}
