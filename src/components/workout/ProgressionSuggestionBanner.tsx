import { Button } from '@/components/ui/button';
import { TrendingUp, Minus, TrendingDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SuggestionType } from '@/types/workout-builder';

interface ProgressionSuggestionBannerProps {
  suggestionType: SuggestionType;
  suggestionText: string;
  onDismiss: () => void;
}

const STYLE_MAP: Record<
  Exclude<SuggestionType, 'none'>,
  { bg: string; border: string; icon: typeof TrendingUp; iconColor: string }
> = {
  increase_load: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: TrendingUp,
    iconColor: 'text-emerald-500',
  },
  increase_reps: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: ArrowUp,
    iconColor: 'text-emerald-500',
  },
  hold_steady: {
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/30',
    icon: Minus,
    iconColor: 'text-zinc-400',
  },
  reduce_load: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: TrendingDown,
    iconColor: 'text-amber-500',
  },
};

export function ProgressionSuggestionBanner({
  suggestionType,
  suggestionText,
  onDismiss,
}: ProgressionSuggestionBannerProps) {
  if (suggestionType === 'none') return null;

  const style = STYLE_MAP[suggestionType];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm animate-in fade-in slide-in-from-top-1 duration-300',
        style.bg,
        style.border,
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', style.iconColor)} />
      <span className="flex-1 text-foreground/90">{suggestionText}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs shrink-0"
        onClick={onDismiss}
      >
        Got it
      </Button>
    </div>
  );
}
