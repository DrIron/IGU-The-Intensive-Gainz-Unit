import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Users, Clock, CheckCircle2, Mail } from "lucide-react";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";

/**
 * Awaiting Approval page - shown after medical clearance, waiting for coach assignment.
 */
export default function AwaitingApproval() {
  return (
    <PublicLayout minimal>
      <div className="container max-w-2xl py-8 px-4">
        <OnboardingProgress currentStep="approval" />
        
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Coach Assignment in Progress
            </CardTitle>
            <CardDescription>
              We're matching you with the perfect coach for your goals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-primary/50 bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle>Great news!</AlertTitle>
              <AlertDescription>
                Your health questionnaire has been approved. We're now finding the 
                best coach to help you achieve your fitness goals.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="font-semibold">What's happening now?</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-primary" />
                  <span>Coach matching typically takes 24-48 hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-primary" />
                  <span>We consider your goals, schedule, and preferences</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 text-primary" />
                  <span>You'll receive an email when your coach is assigned</span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">While you wait...</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Check out our free resources to get started on your fitness journey.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" asChild>
                  <a href="/calorie-calculator">
                    Free Calorie Calculator
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/meet-our-team">
                    Meet Our Coaches
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
