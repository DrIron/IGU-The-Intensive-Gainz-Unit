import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Flame, Beef, Croissant, Droplet } from "lucide-react";
import { CoachNutritionGoal } from "@/components/nutrition/CoachNutritionGoal";
import { CoachNutritionGraphs } from "@/components/nutrition/CoachNutritionGraphs";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TeamMemberNutritionDialogProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamMemberNutritionDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: TeamMemberNutritionDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<any>(null);
  const isMobile = useIsMobile();

  const loadNutritionData = useCallback(async () => {
    try {
      setLoading(true);

      // Get active nutrition phase for this client
      const { data: phase, error: phaseError } = await supabase
        .from('nutrition_phases')
        .select('*')
        .eq('user_id', clientId)
        .eq('is_active', true)
        .maybeSingle();

      if (phaseError) throw phaseError;
      
      setActivePhase(phase);
    } catch (error: any) {
      console.error('Error loading nutrition data:', error);
      toast({
        title: "Error",
        description: "Failed to load nutrition data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  useEffect(() => {
    if (open && clientId) {
      loadNutritionData();
    }
  }, [open, clientId, loadNutritionData]);

  const content = (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !activePhase ? (
        <Card className="border-muted">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Flame className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">No Nutrition Phase Available</p>
                <p className="text-sm text-muted-foreground">
                  No measurements available for your coaching period. This team member may not have set up nutrition goals yet, or their data may be from before your assignment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Current Macros Summary Card */}
          <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Flame className="h-5 w-5 text-primary" />
                Current Daily Targets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Flame className="h-4 w-4" />
                    <span>Calories</span>
                  </div>
                  <p className="text-2xl font-bold">{Math.round(activePhase.daily_calories)}</p>
                  <p className="text-xs text-muted-foreground">kcal/day</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Beef className="h-4 w-4" />
                    <span>Protein</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">{Math.round(activePhase.protein_grams)}g</p>
                  <p className="text-xs text-muted-foreground">
                    {activePhase.protein_intake_g_per_kg.toFixed(1)}g/kg
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Droplet className="h-4 w-4" />
                    <span>Fat</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-500">{Math.round(activePhase.fat_grams)}g</p>
                  <p className="text-xs text-muted-foreground">
                    {activePhase.fat_intake_percentage}% of cals
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Croissant className="h-4 w-4" />
                    <span>Carbs</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-500">{Math.round(activePhase.carb_grams)}g</p>
                  <p className="text-xs text-muted-foreground">remaining cals</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <CoachNutritionGoal 
            clientUserId={clientId} 
            phase={activePhase}
            onPhaseUpdated={loadNutritionData}
          />
          <CoachNutritionGraphs phase={activePhase} />
        </>
      )}
    </div>
  );

  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{clientName} - Nutrition Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-80px)] pr-4">
            {content}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{clientName} - Nutrition Details</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="max-h-[80vh] px-4 pb-6">
          {content}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
