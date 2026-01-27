import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Plus, Check, X, Loader2 } from "lucide-react";
import { format, parseISO, startOfDay, addMinutes } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CoachSessionsProps {
  coachUserId: string;
}

interface SessionBooking {
  id: string;
  slot_id: string;
  client_id: string;
  session_type: string;
  session_start: string;
  session_end: string;
  status: string;
  client_name: string;
  // Removed client_email - coaches should not access client PII
  service_name: string;
  location: string | null;
}

interface TimeSlot {
  id: string;
  slot_start: string;
  slot_end: string;
  location: string | null;
  slot_type: string;
  status: string;
}

export function CoachSessions({ coachUserId }: CoachSessionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionBooking[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Add slots dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [slotDate, setSlotDate] = useState<Date | undefined>(undefined);
  const [slotStartTime, setSlotStartTime] = useState("09:00");
  const [slotDuration, setSlotDuration] = useState("60");
  const [slotCount, setSlotCount] = useState("1");
  const [slotLocation, setSlotLocation] = useState("");
  const [slotType, setSlotType] = useState<"in_person" | "online">("in_person");
  const [addingSlots, setAddingSlots] = useState(false);

  useEffect(() => {
    if (coachUserId) {
      fetchData();
    }
  }, [coachUserId]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchUpcomingSessions(), fetchTimeSlots()]);
    setLoading(false);
  };

  const fetchUpcomingSessions = async () => {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("session_bookings")
        .select(`
          id,
          slot_id,
          client_id,
          session_type,
          session_start,
          session_end,
          status,
          coach_time_slots!inner (
            location
          ),
          profiles_public!session_bookings_client_id_fkey (
            first_name,
            display_name
          ),
          subscriptions!inner (
            services!inner (
              name
            )
          )
        `)
        .eq("coach_id", coachUserId)
        .eq("status", "booked")
        .gte("session_start", now)
        .order("session_start", { ascending: true });

      if (error) throw error;

      const sessions: SessionBooking[] = (data || []).map((booking: any) => ({
        id: booking.id,
        slot_id: booking.slot_id,
        client_id: booking.client_id,
        session_type: booking.session_type,
        session_start: booking.session_start,
        session_end: booking.session_end,
        status: booking.status,
        client_name: booking.profiles_public?.display_name || 
          booking.profiles_public?.first_name || 
          'Client',
        service_name: booking.subscriptions?.services?.name || 'Unknown Service',
        location: booking.coach_time_slots?.location || null,
      }));

      setUpcomingSessions(sessions);
    } catch (error) {
      console.error("Error fetching upcoming sessions:", error);
      toast({
        title: "Error",
        description: "Failed to load upcoming sessions",
        variant: "destructive",
      });
    }
  };

  const fetchTimeSlots = async () => {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("coach_time_slots")
        .select("id, slot_start, slot_end, location, slot_type, status")
        .eq("coach_id", coachUserId)
        .gte("slot_start", now)
        .order("slot_start", { ascending: true });

      if (error) throw error;
      setTimeSlots(data || []);
    } catch (error) {
      console.error("Error fetching time slots:", error);
      toast({
        title: "Error",
        description: "Failed to load time slots",
        variant: "destructive",
      });
    }
  };

  const handleMarkCompleted = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const { error } = await supabase
        .from("session_bookings")
        .update({ status: "completed" })
        .eq("id", bookingId);

      if (error) throw error;

      toast({
        title: "Session Completed",
        description: "The session has been marked as completed",
      });
      
      // Remove from upcoming list
      setUpcomingSessions(prev => prev.filter(s => s.id !== bookingId));
    } catch (error) {
      console.error("Error marking session completed:", error);
      toast({
        title: "Error",
        description: "Failed to mark session as completed",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSession = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("cancel-session", {
        body: { booking_id: bookingId },
      });

      if (response.error) throw response.error;

      toast({
        title: "Session Cancelled",
        description: "The session has been cancelled and the slot is now available",
      });
      
      // Refresh data
      await fetchData();
    } catch (error) {
      console.error("Error cancelling session:", error);
      toast({
        title: "Error",
        description: "Failed to cancel session",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSlotStatus = async (slotId: string, currentStatus: string) => {
    setActionLoading(slotId);
    const newStatus = currentStatus === "available" ? "blocked" : "available";
    
    try {
      const { error } = await supabase
        .from("coach_time_slots")
        .update({ status: newStatus })
        .eq("id", slotId);

      if (error) throw error;

      toast({
        title: newStatus === "blocked" ? "Slot Blocked" : "Slot Available",
        description: newStatus === "blocked" 
          ? "The slot has been blocked" 
          : "The slot is now available for booking",
      });
      
      setTimeSlots(prev => prev.map(slot => 
        slot.id === slotId ? { ...slot, status: newStatus } : slot
      ));
    } catch (error) {
      console.error("Error updating slot status:", error);
      toast({
        title: "Error",
        description: "Failed to update slot status",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddSlots = async () => {
    if (!slotDate) {
      toast({
        title: "Missing Date",
        description: "Please select a date for the slots",
        variant: "destructive",
      });
      return;
    }

    setAddingSlots(true);
    try {
      const [hours, minutes] = slotStartTime.split(":").map(Number);
      const duration = parseInt(slotDuration);
      const count = parseInt(slotCount);

      const slots = [];
      for (let i = 0; i < count; i++) {
        const slotStart = new Date(slotDate);
        slotStart.setHours(hours, minutes + (i * duration), 0, 0);
        
        const slotEnd = addMinutes(slotStart, duration);

        slots.push({
          coach_id: coachUserId,
          slot_start: slotStart.toISOString(),
          slot_end: slotEnd.toISOString(),
          location: slotLocation || null,
          slot_type: slotType,
          status: "available",
          created_by: coachUserId,
        });
      }

      const { error } = await supabase
        .from("coach_time_slots")
        .insert(slots);

      if (error) throw error;

      toast({
        title: "Slots Created",
        description: `Successfully created ${count} time slot(s)`,
      });

      // Reset form and close dialog
      setSlotDate(undefined);
      setSlotStartTime("09:00");
      setSlotDuration("60");
      setSlotCount("1");
      setSlotLocation("");
      setSlotType("in_person");
      setAddDialogOpen(false);

      // Refresh slots
      await fetchTimeSlots();
    } catch (error) {
      console.error("Error creating slots:", error);
      toast({
        title: "Error",
        description: "Failed to create time slots",
        variant: "destructive",
      });
    } finally {
      setAddingSlots(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      available: { variant: "default", label: "Available" },
      booked: { variant: "secondary", label: "Booked" },
      blocked: { variant: "outline", label: "Blocked" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSessionTypeBadge = (type: string) => {
    return (
      <Badge variant="outline" className="text-xs">
        {type === "in_person" ? "In-Person" : "Online"}
      </Badge>
    );
  };

  // Group time slots by date
  const slotsByDate = timeSlots.reduce((acc, slot) => {
    const date = format(parseISO(slot.slot_start), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, TimeSlot[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upcoming Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Sessions
          </CardTitle>
          <CardDescription>
            Sessions booked by your clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingSessions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No upcoming sessions booked
            </p>
          ) : (
            <div className="space-y-4">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{session.client_name}</span>
                      {getSessionTypeBadge(session.session_type)}
                      <Badge variant="secondary">Booked</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {format(parseISO(session.session_start), "EEE, MMM d, yyyy 'at' h:mm a")}
                      </div>
                      {session.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {session.location}
                        </div>
                      )}
                      <div className="text-xs">{session.service_name}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkCompleted(session.id)}
                      disabled={actionLoading === session.id}
                    >
                      {actionLoading === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Complete
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleCancelSession(session.id)}
                      disabled={actionLoading === session.id}
                    >
                      {actionLoading === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manage Time Slots */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Manage Time Slots
              </CardTitle>
              <CardDescription>
                Create and manage your availability
              </CardDescription>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Slots
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Time Slots</DialogTitle>
                  <DialogDescription>
                    Create one or more consecutive time slots for bookings
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !slotDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {slotDate ? format(slotDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={slotDate}
                          onSelect={setSlotDate}
                          disabled={(date) => date < startOfDay(new Date())}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={slotStartTime}
                        onChange={(e) => setSlotStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Duration (minutes)</Label>
                      <Select value={slotDuration} onValueChange={setSlotDuration}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 min</SelectItem>
                          <SelectItem value="45">45 min</SelectItem>
                          <SelectItem value="60">60 min</SelectItem>
                          <SelectItem value="90">90 min</SelectItem>
                          <SelectItem value="120">120 min</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Number of Slots</Label>
                      <Select value={slotCount} onValueChange={setSlotCount}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} slot{n > 1 ? "s" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={slotType} onValueChange={(v) => setSlotType(v as "in_person" | "online")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in_person">In-Person</SelectItem>
                          <SelectItem value="online">Online</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Location (optional)</Label>
                    <Input
                      placeholder="e.g., IGU Gym, Hospital Gym"
                      value={slotLocation}
                      onChange={(e) => setSlotLocation(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddSlots} disabled={addingSlots}>
                    {addingSlots ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Create Slots
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(slotsByDate).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No upcoming time slots. Create some slots for clients to book.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(slotsByDate).map(([date, slots]) => (
                <div key={date}>
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">
                    {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                  </h4>
                  <div className="space-y-2">
                    {slots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="font-medium">
                              {format(parseISO(slot.slot_start), "h:mm a")} - {format(parseISO(slot.slot_end), "h:mm a")}
                            </span>
                          </div>
                          {slot.location && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {slot.location}
                            </div>
                          )}
                          {getSessionTypeBadge(slot.slot_type)}
                          {getStatusBadge(slot.status)}
                        </div>
                        <div>
                          {slot.status === "available" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleSlotStatus(slot.id, slot.status)}
                              disabled={actionLoading === slot.id}
                            >
                              {actionLoading === slot.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Block"
                              )}
                            </Button>
                          )}
                          {slot.status === "blocked" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleSlotStatus(slot.id, slot.status)}
                              disabled={actionLoading === slot.id}
                            >
                              {actionLoading === slot.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Make Available"
                              )}
                            </Button>
                          )}
                          {slot.status === "booked" && (
                            <span className="text-xs text-muted-foreground">
                              View in Upcoming Sessions
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
