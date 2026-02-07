import { useSiteContent } from "@/hooks/useSiteContent";
import { useFadeUp } from "@/hooks/useFadeUp";
import { ClipboardCheck, UserCheck, Dumbbell, Rocket } from "lucide-react";

interface Step {
  icon: React.ElementType;
  title: string;
  description: string;
}

const defaultSteps: Step[] = [
  {
    icon: ClipboardCheck,
    title: "Choose Your Plan",
    description: "Browse our team training and 1:1 coaching options. Select the program that matches your goals and budget.",
  },
  {
    icon: UserCheck,
    title: "Complete Onboarding",
    description: "Fill out your intake form with training history, goals, and preferences so we can customize your experience.",
  },
  {
    icon: Dumbbell,
    title: "Get Matched",
    description: "We'll pair you with a coach who specializes in your goals. 1:1 clients get personalized programming.",
  },
  {
    icon: Rocket,
    title: "Start Training",
    description: "Access your program through our app, track workouts, and communicate with your coach. Let's go!",
  },
];

const iconMap: Record<string, React.ElementType> = {
  ClipboardCheck,
  UserCheck,
  Dumbbell,
  Rocket,
};

export function HowItWorksSection() {
  const { data: cmsContent } = useSiteContent("homepage");
  const fadeUp = useFadeUp();

  // Build steps from CMS content or use defaults
  const steps: Step[] = [1, 2, 3, 4].map((i) => {
    const title = cmsContent?.how_it_works?.[`step_${i}_title`];
    const description = cmsContent?.how_it_works?.[`step_${i}_description`];
    const iconName = cmsContent?.how_it_works?.[`step_${i}_icon`];

    if (title && description) {
      return {
        icon: iconMap[iconName] || defaultSteps[i - 1].icon,
        title,
        description,
      };
    }
    return defaultSteps[i - 1];
  });

  return (
    <section className="py-24 px-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-10" />
      <div
        ref={fadeUp.ref}
        className={`container mx-auto max-w-6xl relative z-10 fade-up ${fadeUp.isVisible ? "visible" : ""}`}
      >
        <div className="text-center mb-16">
          <h2 className="font-display text-5xl md:text-6xl tracking-tight mb-4">
            {cmsContent?.how_it_works?.title || "How It Works"}
          </h2>
          <p className="text-xl text-muted-foreground">
            {cmsContent?.how_it_works?.subtitle || "Your journey to gains in 4 simple steps"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connector line (hidden on mobile and after last item) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 bg-gradient-to-r from-primary/50 to-primary/20" />
              )}

              <div className="flex flex-col items-center text-center">
                {/* Step number badge */}
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                </div>

                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
