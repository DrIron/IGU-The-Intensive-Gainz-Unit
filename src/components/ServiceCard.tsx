import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Star } from "lucide-react";

interface ServiceCardProps {
  name: string;
  type: string;
  price: number;
  description: string;
  features: string[] | null;
  onSelect: () => void;
  mostPopular?: boolean;
  ctaLabel?: string;
}

export const ServiceCard = ({
  name, type, price, description, features = [],
  onSelect, mostPopular = false, ctaLabel = "Get Started",
}: ServiceCardProps) => {
  return (
    <Card className={cn(
      "relative overflow-hidden bg-card transition-all duration-300",
      mostPopular
        ? "border-primary"
        : "border-border/50 hover:border-primary/50",
    )}>
      <CardHeader className="relative">
        {mostPopular && (
          <div className="inline-flex items-center gap-1 px-3 py-1 mb-2 w-fit text-xs font-semibold rounded-full bg-primary text-primary-foreground">
            <Star className="h-3 w-3 fill-current" />
            Most popular
          </div>
        )}
        <div className="inline-block px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-primary/10 text-primary w-fit">
          {type === 'team' ? 'Team Plan' : '1:1 Coaching'}
        </div>
        <CardTitle className="text-2xl font-semibold">{name}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <div className="mb-6">
          {/* 1:1 tiers are level-priced -- show the public "from" (junior) price; the
              exact price is confirmed at checkout once a coach is assigned. Team Plan
              is a single flat price, so no "from" prefix. */}
          {type !== "team" && (
            <span className="text-muted-foreground text-base mr-1.5 align-middle">from</span>
          )}
          <span className="text-4xl font-semibold text-primary">
            {price} KWD
          </span>
          <span className="text-muted-foreground">/month</span>
        </div>
        <ul className="space-y-3">
          {(features || []).map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/80">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="relative">
        <Button 
          variant="default"
          className="w-full"
          onClick={onSelect}
        >
          {ctaLabel}
        </Button>
      </CardFooter>
    </Card>
  );
};
