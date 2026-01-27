import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowLeft, CheckCircle2, Clock, ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday } from "date-fns";

interface DayData {
  date: string;
  title: string;
  modules: {
    id: string;
    title: string;
    module_type: string;
    status: string;
  }[];
}

function WorkoutCalendarContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daysData, setDaysData] = useState<Record<string, DayData>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [user, setUser] = useState<any>(null);

  useDocumentTitle({
    title: "Workout Calendar",
    description: "View your workout schedule",
  });

  useEffect(() => {
    loadCalendarData();
  }, [currentMonth]);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      setUser(currentUser);

      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      // Get all program days for this month
      const { data, error } = await supabase
        .from("client_program_days")
        .select(`
          id,
          date,
          title,
          client_programs!inner (
            user_id,
            status
          ),
          client_day_modules (
            id,
            title,
            module_type,
            status
          )
        `)
        .eq("client_programs.user_id", currentUser.id)
        .eq("client_programs.status", "active")
        .gte("date", format(monthStart, 'yyyy-MM-dd'))
        .lte("date", format(monthEnd, 'yyyy-MM-dd'));

      if (error) throw error;

      const dataMap: Record<string, DayData> = {};
      (data || []).forEach((day: any) => {
        dataMap[day.date] = {
          date: day.date,
          title: day.title,
          modules: day.client_day_modules || [],
        };
      });

      setDaysData(dataMap);
    } catch (error: any) {
      console.error("Error loading calendar:", error);
      toast({
        title: "Error loading calendar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  // Pad start of month to align with weekday
  const startDay = startOfMonth(currentMonth).getDay();
  const paddedDays = Array(startDay).fill(null).concat(days);

  const getDayStatus = (date: Date): 'completed' | 'partial' | 'scheduled' | 'none' => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayData = daysData[dateStr];
    
    if (!dayData || dayData.modules.length === 0) return 'none';
    
    const completed = dayData.modules.filter(m => m.status === 'completed').length;
    const total = dayData.modules.length;
    
    if (completed === total) return 'completed';
    if (completed > 0) return 'partial';
    return 'scheduled';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'partial': return 'bg-yellow-500';
      case 'scheduled': return 'bg-primary';
      default: return '';
    }
  };

  const selectedDayData = selectedDate ? daysData[format(selectedDate, 'yyyy-MM-dd')] : null;

  return (
    <>
      <Navigation user={user} userRole="client" />
      <div className="container max-w-4xl py-8 pt-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Workout Calendar
            </h1>
            <p className="text-muted-foreground">View your workout schedule</p>
          </div>
        </div>

        {/* Calendar Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-4">
            {loading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array(35).fill(0).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            ) : (
              <>
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {paddedDays.map((date, idx) => {
                    if (!date) {
                      return <div key={`pad-${idx}`} className="aspect-square" />;
                    }
                    
                    const status = getDayStatus(date);
                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const hasWorkout = daysData[dateStr]?.modules?.length > 0;
                    
                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(date)}
                        className={`
                          aspect-square rounded-lg flex flex-col items-center justify-center relative
                          transition-colors border
                          ${isToday(date) ? 'border-primary' : 'border-transparent'}
                          ${isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}
                          ${hasWorkout ? 'cursor-pointer' : 'cursor-default'}
                        `}
                      >
                        <span className={`text-sm ${isToday(date) ? 'font-bold text-primary' : ''}`}>
                          {format(date, 'd')}
                        </span>
                        {status !== 'none' && (
                          <div className={`absolute bottom-1 w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span>Scheduled</span>
          </div>
        </div>

        {/* Selected Day Details */}
        {selectedDate && (
          <Card>
            <CardHeader>
              <CardTitle>{format(selectedDate, 'EEEE, MMMM d')}</CardTitle>
              <CardDescription>
                {selectedDayData ? selectedDayData.title : 'No workouts scheduled'}
              </CardDescription>
            </CardHeader>
            {selectedDayData && selectedDayData.modules.length > 0 && (
              <CardContent className="space-y-3">
                {selectedDayData.modules.map((module) => (
                  <div
                    key={module.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/client/workout/session/${module.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      {module.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{module.title}</p>
                        <Badge variant="outline" className="text-xs">
                          {module.module_type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant={module.status === 'completed' ? 'default' : 'secondary'}>
                      {module.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            )}
            {(!selectedDayData || selectedDayData.modules.length === 0) && (
              <CardContent>
                <div className="text-center py-6 text-muted-foreground">
                  <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Rest day - no workouts scheduled</p>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

export default function WorkoutCalendar() {
  return (
    <ProtectedRoute>
      <WorkoutCalendarContent />
    </ProtectedRoute>
  );
}
