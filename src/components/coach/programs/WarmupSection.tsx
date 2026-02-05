import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface WarmupSectionProps {
  exerciseCount: number;
  children: React.ReactNode;
}

export function WarmupSection({ exerciseCount, children }: WarmupSectionProps) {
  const [isOpen, setIsOpen] = useState(exerciseCount === 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg bg-amber-50/30 dark:bg-amber-950/10 border border-amber-200/30 dark:border-amber-800/20">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-amber-100/30 dark:hover:bg-amber-900/10 rounded-t-lg transition-colors">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            )}
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Warm-up
            </span>
            <Badge
              variant="secondary"
              className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
            >
              {exerciseCount}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
