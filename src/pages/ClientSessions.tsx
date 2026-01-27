import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useClientAccess, getAccessDeniedMessage } from "@/hooks/useClientAccess";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar as CalendarIcon, Clock, MapPin, User, AlertCircle, Check, X, Loader2 } from "lucide-react";
import { format, parseISO, startOfWeek, addDays, isSameDay } from "date-fns";

interface SessionBooking {
  id: string;
  slot_id: string;
  session_start: string;
  session_end: string;
  status: string;
  coach_id: string;
  coach_time_slots: {
    location: string | null;
    slot_type: string;
  } | null;
}

interface AvailableSlot {
  id: string;
  slot_start: string;
  slot_end: string;
  location: string | null;
  slot_type: string;
  coach_id: string;
}

interface SessionSubscription {
  id: string;
  coach_id: string | null;
  weekly_session_limit: number | null;
  services: {
    id: string;
    name: string;
    type: string;
  } | null;
}

interface Coach {
  first_name: string;
  last_name: string | null;
  nickname: string | null;
}

function ClientSessionsContent() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const access = useClientAccess();

  const [sessionSubscription, setSessionSubscription] = useState<SessionSubscription | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<SessionBooking[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [coachInfo, setCoachInfo] = useState<Coach | null>(null);
  const [weeklyUsed, setWeeklyUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  // Access check - redirect if not allowed
  useEffect(() => {
    if (!access.loading && !access.isStaff && !access.hasActiveSubscription) {
      toast({
        title: "Access Denied",
        description: getAccessDeniedMessage(access),
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  }, [access.loading, access.isStaff, access.hasActiveSubscription, navigate, toast]);

  // Fetch session subscription and data
  useEffect(() => {
    if (access.loading || !access.profile) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch active subscription with session booking enabled
        const { data: subData, error: subError } = await supabase
          .from("subscriptions")
          .select(`
            id,
            coach_id,
            weekly_session_limit,
            services (id, name, type)
          `)
          .eq("user_id", access.profile!.id)
          .eq("status", "active")
          .eq("session_booking_enabled", true)
          .maybeSingle();

        if (subError) throw subError;

        if (!subData) {
          setSessionSubscription(null);
          setLoading(false);
          return;
        }

        setSessionSubscription(subData as SessionSubscription);

        // Fetch coach info if we have a coach_id - use coaches_directory (public-safe view)
        if (subData.coach_id) {
          const { data: coach } = await supabase
            .from("coaches_directory")
            .select("first_name, last_name, nickname")
            .eq("user_id", subData.coach_id)
            .maybeSingle();
          
          if (coach) {
            setCoachInfo(coach);
          }
        }

        // Fetch weekly usage
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
        const weekEnd = addDays(weekStart, 7);

        const { count: usedCount, error: countError } = await supabase
          .from("session_bookings")
          .select("*", { count: "exact", head: true })
          .eq("subscription_id", subData.id)
          .in("status", ["booked", "completed"])
          .gte("session_start", weekStart.toISOString())
          .lt("session_start", weekEnd.toISOString());

        if (countError) throw countError;
        setWeeklyUsed(usedCount || 0);

        // Fetch upcoming bookings
        const { data: bookings, error: bookingsError } = await supabase
          .from("session_bookings")
          .select(`
            id,
            slot_id,
            session_start,
            session_end,
            status,
            coach_id,
            coach_time_slots (location, slot_type)
          `)
          .eq("client_id", access.profile!.id)
          .eq("status", "booked")
          .gte("session_start", new Date().toISOString())
          .order("session_start", { ascending: true });

        if (bookingsError) throw bookingsError;
        setUpcomingBookings((bookings || []) as SessionBooking[]);

        // Fetch available slots for the assigned coach
        if (subData.coach_id) {
          const { data: slots, error: slotsError } = await supabase
            .from("coach_time_slots")
            .select(`
              id,
              slot_start,
              slot_end,
              location,
              slot_type,
              coach_id
            `)
            .eq("coach_id", subData.coach_id)
            .eq("status", "available")
            .gte("slot_start", new Date().toISOString())
            .order("slot_start", { ascending: true });

          if (slotsError) throw slotsError;
          setAvailableSlots((slots || []) as AvailableSlot[]);
        }
      } catch (error: any) {
        console.error("Error fetching session data:", error);
        toast({
          title: "Error",
          description: "Failed to load session data. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [access.loading, access.profile, toast]);

  const weeklyLimit = sessionSubscription?.weekly_session_limit ?? 0;
  const remaining = Math.max(weeklyLimit - weeklyUsed, 0);

  const handleBookSession = async (slotId: string) => {
    try {
      setBookingSlotId(slotId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("book-session", {
        body: { slot_id: slotId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to book session");
      }

      const result = response.data;

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Session Booked!",
        description: "Your session has been successfully booked.",
      });

      // Refresh data
      setAvailableSlots((prev) => prev.filter((s) => s.id !== slotId));
      setWeeklyUsed((prev) => prev + 1);

      // Refetch bookings to get the new one with full data
      if (access.profile) {
        const { data: bookings } = await supabase
          .from("session_bookings")
          .select(`
            id,
            slot_id,
            session_start,
            session_end,
            status,
            coach_id,
            coach_time_slots (location, slot_type)
          `)
          .eq("client_id", access.profile.id)
          .eq("status", "booked")
          .gte("session_start", new Date().toISOString())
          .order("session_start", { ascending: true });

        if (bookings) {
          setUpcomingBookings(bookings as SessionBooking[]);
        }
      }
    } catch (error: any) {
      console.error("Error booking session:", error);
      toast({
        title: "Booking Failed",
        description: error.message || "Failed to book session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBookingSlotId(null);
    }
  };

  const handleCancelSession = async (bookingId: string) => {
    try {
      setCancellingBookingId(bookingId);

      const response = await supabase.functions.invoke("cancel-session", {
        body: { booking_id: bookingId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to cancel session");
      }

      const result = response.data;

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Session Cancelled",
        description: "Your session has been cancelled.",
      });

      // Refresh data
      setUpcomingBookings((prev) => prev.filter((b) => b.id !== bookingId));
      setWeeklyUsed((prev) => Math.max(prev - 1, 0));

      // Refetch available slots
      if (sessionSubscription?.coach_id) {
        const { data: slots } = await supabase
          .from("coach_time_slots")
          .select(`
            id,
            slot_start,
            slot_end,
            location,
            slot_type,
            coach_id
          `)
          .eq("coach_id", sessionSubscription.coach_id)
          .eq("status", "available")
          .gte("slot_start", new Date().toISOString())
          .order("slot_start", { ascending: true });

        if (slots) {
          setAvailableSlots(slots as AvailableSlot[]);
        }
      }
    } catch (error: any) {
      console.error("Error cancelling session:", error);
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingBookingId(null);
    }
  };

  // Filter slots for selected date
  const slotsForSelectedDate = availableSlots.filter((slot) =>
    isSameDay(parseISO(slot.slot_start), selectedDate)
  );

  // Get dates that have available slots for calendar highlighting
  const datesWithSlots = availableSlots.map((slot) => parseISO(slot.slot_start));

  const getCoachDisplayName = () => {
    if (!coachInfo) return "Your Coach";
    if (coachInfo.nickname) return coachInfo.nickname;
    return `${coachInfo.first_name}${coachInfo.last_name ? ` ${coachInfo.last_name}` : ""}`;
  };

  if (access.loading || loading) {
    return (
      <>
        <Navigation />
        <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid gap-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </>
    );
  }

  // No session-enabled subscription
  if (!sessionSubscription) {
    return (
      <>
        <Navigation />
        <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
          <h1 className="text-3xl font-bold mb-8">Sessions</h1>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Session Booking Not Available</AlertTitle>
            <AlertDescription>
              Your current plan does not include session booking. Please contact your coach or upgrade your plan to access this feature.
            </AlertDescription>
          </Alert>
        </main>
      </>
    );
  }

  // No weekly limit set
  if (weeklyLimit === 0 || weeklyLimit === null) {
    return (
      <>
        <Navigation />
        <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
          <h1 className="text-3xl font-bold mb-8">Sessions</h1>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuration Required</AlertTitle>
            <AlertDescription>
              Your weekly session limit has not been configured. Please contact your coach to set up your session allowance.
            </AlertDescription>
          </Alert>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
        <h1 className="text-3xl font-bold mb-8">Sessions</h1>

        {/* Weekly Summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Weekly Sessions
            </CardTitle>
            <CardDescription>
              Your session usage for this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-primary">
                {weeklyUsed} / {weeklyLimit}
              </div>
              <div className="text-sm text-muted-foreground">
                sessions used this week
              </div>
            </div>
            {remaining <= 0 && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You've reached your weekly session limit. New sessions will be available next week.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Sessions */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Your Upcoming Sessions
            </CardTitle>
            <CardDescription>
              Sessions you have booked
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No upcoming sessions. Book a session below!
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-lg">
                        <CalendarIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {format(parseISO(booking.session_start), "EEEE, MMMM d, yyyy")}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(booking.session_start), "h:mm a")} -{" "}
                            {format(parseISO(booking.session_end), "h:mm a")}
                          </span>
                          {booking.coach_time_slots?.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {booking.coach_time_slots.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {getCoachDisplayName()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{booking.status}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelSession(booking.id)}
                        disabled={cancellingBookingId === booking.id}
                      >
                        {cancellingBookingId === booking.id ? (
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

        {/* Book a New Session */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              Book a New Session
            </CardTitle>
            <CardDescription>
              Select a date to see available time slots
            </CardDescription>
          </CardHeader>
          <CardContent>
            {remaining <= 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No remaining sessions this week. Check back next week for new availability.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Calendar */}
                <div>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date < new Date()}
                    modifiers={{
                      hasSlots: datesWithSlots,
                    }}
                    modifiersClassNames={{
                      hasSlots: "bg-primary/10 text-primary font-medium",
                    }}
                    className="rounded-md border"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Highlighted dates have available slots
                  </p>
                </div>

                {/* Available Slots */}
                <div>
                  <h3 className="font-medium mb-3">
                    Available slots for {format(selectedDate, "MMMM d, yyyy")}
                  </h3>
                  {slotsForSelectedDate.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No available slots for this day. Please choose another date.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {slotsForSelectedDate.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div>
                            <div className="font-medium">
                              {format(parseISO(slot.slot_start), "h:mm a")} -{" "}
                              {format(parseISO(slot.slot_end), "h:mm a")}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              {slot.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {slot.location}
                                </span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {slot.slot_type}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleBookSession(slot.id)}
                            disabled={bookingSlotId === slot.id}
                          >
                            {bookingSlotId === slot.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Book"
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function ClientSessions() {
  return (
    <ProtectedRoute>
      <ClientSessionsContent />
    </ProtectedRoute>
  );
}
