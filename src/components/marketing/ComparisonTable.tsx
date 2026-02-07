import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureRow {
  feature: string;
  team: boolean | string;
  online: boolean | string;
  hybrid: boolean | string;
  inPerson: boolean | string;
}

// Features that are verified as built in the codebase
const comparisonFeatures: FeatureRow[] = [
  {
    feature: "Personalized Training Program",
    team: false,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Group Programming",
    team: true,
    online: false,
    hybrid: false,
    inPerson: false,
  },
  {
    feature: "Direct Coach Messaging",
    team: false,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Weekly Check-ins",
    team: false,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Nutrition Coaching",
    team: false,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Advanced Calorie Calculator",
    team: true,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "In-Person Sessions",
    team: false,
    online: false,
    hybrid: "Monthly",
    inPerson: "Weekly",
  },
  {
    feature: "Exercise Library Access",
    team: true,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Discord Community",
    team: true,
    online: true,
    hybrid: true,
    inPerson: true,
  },
  {
    feature: "Progress Analytics",
    team: false,
    online: true,
    hybrid: true,
    inPerson: true,
  },
];

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="text-sm font-medium text-primary">{value}</span>
    );
  }

  if (value === true) {
    return (
      <div className="flex justify-center">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
          <Check className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        <Minus className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export function ComparisonTable() {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-4 font-semibold text-foreground border-b border-border">
                Feature
              </th>
              <th className="text-center p-4 font-semibold text-foreground border-b border-border">
                <div className="flex flex-col items-center gap-1">
                  <span>Team</span>
                  <span className="text-xs font-normal text-muted-foreground">12 KWD/mo</span>
                </div>
              </th>
              <th className="text-center p-4 font-semibold text-foreground border-b border-border">
                <div className="flex flex-col items-center gap-1">
                  <span>1:1 Online</span>
                  <span className="text-xs font-normal text-muted-foreground">50 KWD/mo</span>
                </div>
              </th>
              <th className="text-center p-4 font-semibold text-foreground border-b border-border bg-primary/5">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-primary">Hybrid</span>
                  <span className="text-xs font-normal text-muted-foreground">175 KWD/mo</span>
                </div>
              </th>
              <th className="text-center p-4 font-semibold text-foreground border-b border-border">
                <div className="flex flex-col items-center gap-1">
                  <span>In-Person</span>
                  <span className="text-xs font-normal text-muted-foreground">250 KWD/mo</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisonFeatures.map((row, index) => (
              <tr
                key={row.feature}
                className={cn(
                  "transition-colors hover:bg-muted/50",
                  index % 2 === 0 ? "bg-background" : "bg-muted/20"
                )}
              >
                <td className="p-4 text-sm text-foreground border-b border-border/50">
                  {row.feature}
                </td>
                <td className="p-4 text-center border-b border-border/50">
                  <FeatureCell value={row.team} />
                </td>
                <td className="p-4 text-center border-b border-border/50">
                  <FeatureCell value={row.online} />
                </td>
                <td className="p-4 text-center border-b border-border/50 bg-primary/5">
                  <FeatureCell value={row.hybrid} />
                </td>
                <td className="p-4 text-center border-b border-border/50">
                  <FeatureCell value={row.inPerson} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
