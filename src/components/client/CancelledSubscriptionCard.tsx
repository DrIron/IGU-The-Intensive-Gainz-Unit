import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";

interface CancelledSubscriptionCardProps {
  status: string | null;
  subStatus: string | null;
}

export function CancelledSubscriptionCard({ status, subStatus }: CancelledSubscriptionCardProps) {
  const navigate = useNavigate();
  
  const isExpired = status === 'expired' || subStatus === 'expired';
  const title = isExpired ? "Membership Expired" : "Membership Cancelled";
  const description = isExpired 
    ? "Your previous plan has expired. You can restart anytime by choosing a new plan."
    : "Your previous plan has been cancelled. You can restart anytime by choosing a new plan.";

  return (
    <Card className="border-amber-500/50 bg-amber-500/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription className="text-foreground/80">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            onClick={() => navigate('/services')}
            className="flex-1"
          >
            Browse Plans
          </Button>
          <Button 
            onClick={() => window.location.href = 'mailto:support@theigu.com'}
            variant="outline"
            className="flex-1"
          >
            Contact Support
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
