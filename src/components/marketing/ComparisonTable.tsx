import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFromPriceKwd } from "@/auth/roles";

interface FeatureRow {
  feature: string;
  team: boolean | string;
  online: boolean | string;
  hybrid: boolean | string;
  inPerson: boolean | string;
}

// Plan columns. Prices are data-driven from the level-based pricing in roles.ts
// (CLIENT_PRICE_PER_LEVEL) -- the public display is the "from" (junior) price; the
// exact price resolves at checkout once a coach is assigned. 1:1 Complete is retired.
const PLAN_COLUMNS: Array<{
  key: keyof Omit<FeatureRow, "feature">;
  label: string;
  slug: string;
  highlight?: boolean;
}> = [
  { key: "team", label: "Team", slug: "team_plan" },
  { key: "online", label: "1:1 Online", slug: "one_to_one_online" },
  { key: "hybrid", label: "Hybrid", slug: "hybrid", highlight: true },
  { key: "inPerson", label: "In-Person", slug: "in_person" },
];

// Features that are verified as built in the codebase
const comparisonFeatures: FeatureRow[] = [
  { feature: "Personalized Training Program", team: false, online: true, hybrid: true, inPerson: true },
  { feature: "Group Programming", team: true, online: false, hybrid: false, inPerson: false },
  { feature: "Direct Coach Messaging", team: false, online: true, hybrid: true, inPerson: true },
  { feature: "Weekly Check-ins", team: false, online: true, hybrid: true, inPerson: true },
  { feature: "Nutrition Coaching", team: false, online: true, hybrid: true, inPerson: true },
  { feature: "Dedicated Dietitian", team: false, online: false, hybrid: true, inPerson: true },
  { feature: "Advanced Calorie Calculator", team: true, online: true, hybrid: true, inPerson: true },
  { feature: "In-Person Sessions", team: false, online: false, hybrid: "Monthly", inPerson: "Weekly" },
  { feature: "Exercise Library Access", team: true, online: true, hybrid: true, inPerson: true },
  { feature: "Discord Community", team: true, online: true, hybrid: true, inPerson: true },
  { feature: "Progress Analytics", team: false, online: true, hybrid: true, inPerson: true },
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
    <div className="w-full">
      <p className="text-sm text-muted-foreground mb-2 md:hidden text-center">
        Swipe to see all plans →
      </p>
      <div className="w-full overflow-x-auto">
      <div className="min-w-[640px]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left p-4 font-semibold text-foreground border-b border-border">
                Feature
              </th>
              {PLAN_COLUMNS.map((col) => {
                const fromPrice = getFromPriceKwd(col.slug);
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "text-center p-4 font-semibold text-foreground border-b border-border",
                      col.highlight && "bg-primary/5"
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className={cn(col.highlight && "text-primary")}>{col.label}</span>
                      {fromPrice !== undefined && (
                        <span className="text-xs font-normal text-muted-foreground">
                          from {fromPrice} KWD/mo
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
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
                {PLAN_COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "p-4 text-center border-b border-border/50",
                      col.highlight && "bg-primary/5"
                    )}
                  >
                    <FeatureCell value={row[col.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
