import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface ServiceCardProps {
  name: string;
  type: string;
  price: number;
  description: string;
  features: string[] | null;
  onSelect: () => void;
}

export const ServiceCard = ({ name, type, price, description, features = [], onSelect }: ServiceCardProps) => {
  return (
    <Card className="relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
      <CardHeader className="relative">
        <div className="inline-block px-3 py-1 mb-2 text-xs font-semibold rounded-full bg-primary/10 text-primary w-fit">
          {type === 'team' ? 'Team Plan' : '1:1 Coaching'}
        </div>
        <CardTitle className="text-2xl font-bold">{name}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <div className="mb-6">
          <span className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {price} KWD
          </span>
          <span className="text-muted-foreground">/month</span>
        </div>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/80">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="relative">
        <Button 
          variant="gradient" 
          className="w-full"
          onClick={onSelect}
        >
          Get Started
        </Button>
      </CardFooter>
    </Card>
  );
};
