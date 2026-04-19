import { lazy, Suspense, useEffect, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { AuthGuard } from "@/components/AuthGuard";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { TestEnvironmentBanner } from "@/components/TestEnvironmentBanner";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
const RoutesDebugPanel = lazy(() =>
  import("./components/admin/RoutesDebugPanel").then(m => ({ default: m.RoutesDebugPanel }))
);
import { OnboardingGuard } from "@/components/OnboardingGuard";
import { WaitlistGuard } from "@/components/WaitlistGuard";
import { useTokenGuard } from "@/hooks/useTokenGuard";
import { captureUTMParams } from "@/lib/utm";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

// Lazy-loaded page components
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AccountManagement = lazy(() => import("./pages/AccountManagement"));
const OnboardingForm = lazy(() => import("./pages/OnboardingForm"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CalorieCalculator = lazy(() => import("./pages/CalorieCalculator"));
const WorkoutLibrary = lazy(() => import("./pages/WorkoutLibrary"));
const Services = lazy(() => import("./pages/Services"));
const Testimonial = lazy(() => import("./pages/Testimonial"));
const ClientSubmission = lazy(() => import("./pages/ClientSubmission"));
const MeetOurTeam = lazy(() => import("./pages/MeetOurTeam"));
const CoachSignup = lazy(() => import("./pages/CoachSignup"));
const CoachPasswordSetup = lazy(() => import("./pages/CoachPasswordSetup"));
const TestimonialsManagement = lazy(() => import("./pages/TestimonialsManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const TeamNutrition = lazy(() => import("./pages/TeamNutrition"));
const ClientNutrition = lazy(() => import("./pages/ClientNutrition"));
const CoachClientNutrition = lazy(() => import("./pages/CoachClientNutrition"));
const PaymentStatus = lazy(() => import("./pages/PaymentStatus"));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn"));
const BillingPayment = lazy(() => import("./pages/BillingPayment"));
const EducationalVideos = lazy(() => import("./pages/EducationalVideos"));
const PendingClientsPage = lazy(() => import("./pages/coach/PendingClientsPage"));
const ClientDiagnostics = lazy(() => import("./pages/admin/ClientDiagnostics"));
const EmailLog = lazy(() => import("./pages/admin/EmailLog"));
const ClientSessions = lazy(() => import("./pages/ClientSessions"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const CoachDashboard = lazy(() => import("./pages/coach/CoachDashboard"));
const StudioPreview = lazy(() => import("./pages/coach/StudioPreview"));
const LaunchTestChecklist = lazy(() => import("./pages/admin/LaunchTestChecklist"));
const WorkoutBuilderQA = lazy(() => import("./pages/admin/WorkoutBuilderQA"));
const RolesDebug = lazy(() => import("./pages/admin/RolesDebug"));
const SecurityHardeningChecklist = lazy(() => import("./pages/admin/SecurityHardeningChecklist"));
const SiteMapDiagnostics = lazy(() => import("./pages/admin/SiteMapDiagnostics"));
const DiagnosticsIndex = lazy(() => import("./pages/admin/DiagnosticsIndex"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const WorkoutSessionV2 = lazy(() => import("./pages/client/WorkoutSessionV2"));
const WorkoutCalendar = lazy(() => import("./pages/client/WorkoutCalendar"));
const ExerciseHistory = lazy(() => import("./pages/client/ExerciseHistory"));
const AccessDebug = lazy(() => import("./pages/AccessDebug"));
const EmailConfirmed = lazy(() => import("./pages/EmailConfirmed"));
const Waitlist = lazy(() => import("./pages/Waitlist"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
// Onboarding pages
const MedicalReview = lazy(() => import("./pages/onboarding/MedicalReview"));
const AwaitingApproval = lazy(() => import("./pages/onboarding/AwaitingApproval"));
const PaymentOnboarding = lazy(() => import("./pages/onboarding/Payment"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,        // 5 minutes
      gcTime: 1000 * 60 * 30,           // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnReconnect: 'always',
    },
  },
});

/** Global auth token guard - refreshes expired JWTs and intercepts 401s */
function TokenGuard() {
  useTokenGuard();
  return null;
}

/** Mobile bottom nav for client routes — persists across all authenticated client pages */
const ClientMobileNavGlobal = memo(function ClientMobileNavGlobal() {
  const location = useLocation();

  // Show on client routes (dashboard, workout, nutrition, etc.)
  const clientPaths = [
    "/dashboard",
    "/client",
    "/nutrition",
    "/nutrition-client",
    "/nutrition-team",
    "/sessions",
    "/workout-library",
    "/educational-videos",
    "/account",
    "/billing",
  ];
  const isClientRoute = clientPaths.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));

  if (!isClientRoute) return null;

  return <MobileBottomNavClient />;
});

// Lazy-load the actual nav to avoid pulling sidebar code into the initial bundle
const MobileBottomNavClient = lazy(() =>
  Promise.all([
    import("@/components/layouts/MobileBottomNav"),
    import("@/components/client/ClientSidebar"),
  ]).then(([navMod, sidebarMod]) => ({
    default: () => <navMod.MobileBottomNav items={sidebarMod.getClientMobileNavItems()} />,
  }))
);

/** Mobile bottom nav for coach routes — persists across all authenticated coach pages */
const CoachMobileNavGlobal = memo(function CoachMobileNavGlobal() {
  const location = useLocation();
  // Include standalone coach-facing routes that don't live under /coach/*
  // (e.g. the shared /coach-client-nutrition page).
  const coachPrefixes = ["/coach", "/coach-client-nutrition"];
  const isCoachRoute = coachPrefixes.some(
    p => location.pathname === p || location.pathname.startsWith(p + "/")
  );
  if (!isCoachRoute) return null;
  return <MobileBottomNavCoach />;
});

const MobileBottomNavCoach = lazy(() =>
  Promise.all([
    import("@/components/layouts/MobileBottomNav"),
    import("@/components/coach/CoachSidebar"),
  ]).then(([navMod, sidebarMod]) => ({
    default: () => <navMod.MobileBottomNav items={sidebarMod.getCoachMobileNavItems()} />,
  }))
);

/** Mobile bottom nav for admin routes — persists across all authenticated admin pages */
const AdminMobileNavGlobal = memo(function AdminMobileNavGlobal() {
  const location = useLocation();
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  if (!isAdminRoute) return null;
  return <MobileBottomNavAdmin />;
});

const MobileBottomNavAdmin = lazy(() =>
  Promise.all([
    import("@/components/layouts/MobileBottomNav"),
    import("@/components/admin/AdminSidebar"),
  ]).then(([navMod, sidebarMod]) => ({
    default: () => <navMod.MobileBottomNav items={sidebarMod.getAdminMobileNavItems()} />,
  }))
);

const App = () => {
  // Capture UTM parameters on app mount for lead tracking
  useEffect(() => {
    captureUTMParams();
  }, []);
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner position="bottom-center" className="md:!bottom-4 md:!right-4 md:!left-auto" />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TokenGuard />
            <PWAUpdatePrompt />
            <TestEnvironmentBanner />
            {/* Routes Debug Panel - only shows in non-production */}
            {!window.location.hostname.includes('theigu.com') && (
              <Suspense fallback={null}>
                <RoutesDebugPanel show />
              </Suspense>
            )}
            <div className="min-h-screen">
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/waitlist" element={<PublicLayout minimal><Waitlist /></PublicLayout>} />
                  <Route path="/" element={<WaitlistGuard><PublicLayout><Index /></PublicLayout></WaitlistGuard>} />
                  <Route path="/auth" element={<PublicLayout minimal><Auth /></PublicLayout>} />
                  <Route path="/email-confirmed" element={<PublicLayout minimal><EmailConfirmed /></PublicLayout>} />
                  <Route path="/services" element={<WaitlistGuard><PublicLayout><Services /></PublicLayout></WaitlistGuard>} />

                  {/* Role-scoped Admin routes - requires admin role */}
                  <Route path="/admin" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />
                  <Route path="/admin/:section" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />

                  {/* Role-scoped Coach routes - requires coach role ONLY (admins must use separate coach account) */}
                  <Route path="/coach" element={<RoleProtectedRoute requiredRole="coach"><CoachDashboard /></RoleProtectedRoute>} />
                  <Route path="/coach/studio-preview" element={<RoleProtectedRoute requiredRole="coach"><StudioPreview /></RoleProtectedRoute>} />
                  <Route path="/coach/:section" element={<RoleProtectedRoute requiredRole="coach"><CoachDashboard /></RoleProtectedRoute>} />

                  {/* Onboarding routes - allow incomplete onboarding */}
                  <Route path="/onboarding" element={<AuthGuard><OnboardingForm /></AuthGuard>} />
                  <Route path="/onboarding/medical-review" element={<AuthGuard><MedicalReview /></AuthGuard>} />
                  <Route path="/onboarding/awaiting-approval" element={<AuthGuard><AwaitingApproval /></AuthGuard>} />
                  <Route path="/onboarding/payment" element={<AuthGuard><PaymentOnboarding /></AuthGuard>} />

                  {/* Client dashboard - requires complete onboarding */}
                  <Route path="/dashboard" element={<AuthGuard><OnboardingGuard><Dashboard /></OnboardingGuard></AuthGuard>} />

                  {/* Client routes - requires complete onboarding */}
                  <Route path="/client" element={<AuthGuard><OnboardingGuard><Dashboard /></OnboardingGuard></AuthGuard>} />
                  <Route path="/client/dashboard" element={<AuthGuard><OnboardingGuard><Dashboard /></OnboardingGuard></AuthGuard>} />
                  <Route path="/client/workout/session/:moduleId" element={<AuthGuard><OnboardingGuard><WorkoutSessionV2 /></OnboardingGuard></AuthGuard>} />
                  <Route path="/client/workout/calendar" element={<AuthGuard><OnboardingGuard><WorkoutCalendar /></OnboardingGuard></AuthGuard>} />
                  <Route path="/client/workout/history" element={<AuthGuard><OnboardingGuard><ExerciseHistory /></OnboardingGuard></AuthGuard>} />

                  <Route path="/account" element={<AuthGuard><AccountManagement /></AuthGuard>} />
                  <Route path="/reset-password" element={<PublicLayout minimal><ResetPassword /></PublicLayout>} />
                  <Route path="/calorie-calculator" element={<WaitlistGuard><PublicLayout><CalorieCalculator /></PublicLayout></WaitlistGuard>} />
                  <Route path="/workout-library" element={<AuthGuard><OnboardingGuard><WorkoutLibrary /></OnboardingGuard></AuthGuard>} />
                  <Route path="/testimonial" element={<WaitlistGuard><PublicLayout><Testimonial /></PublicLayout></WaitlistGuard>} />
                  <Route path="/client-submission/:userId" element={<AuthGuard><ClientSubmission /></AuthGuard>} />
                  <Route path="/meet-our-team" element={<WaitlistGuard><PublicLayout><MeetOurTeam /></PublicLayout></WaitlistGuard>} />
                  <Route path="/teams" element={<WaitlistGuard><PublicLayout><TeamsPage /></PublicLayout></WaitlistGuard>} />
                  <Route path="/coach-signup" element={<PublicLayout><CoachSignup /></PublicLayout>} />
                  <Route path="/coach-password-setup" element={<CoachPasswordSetup />} />
                  <Route path="/coach-password-set" element={<CoachPasswordSetup />} />
                  <Route path="/testimonials-management" element={<RoleProtectedRoute requiredRole="admin"><TestimonialsManagement /></RoleProtectedRoute>} />
                  <Route path="/nutrition" element={<AuthGuard><OnboardingGuard><Nutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/nutrition-team" element={<AuthGuard><OnboardingGuard><TeamNutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/nutrition-client" element={<AuthGuard><OnboardingGuard><ClientNutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/coach-client-nutrition" element={<AuthGuard><CoachClientNutrition /></AuthGuard>} />
                  <Route path="/payment-status" element={<AuthGuard><PaymentStatus /></AuthGuard>} />
                  <Route path="/payment-return" element={<AuthGuard><PaymentReturn /></AuthGuard>} />
                  <Route path="/billing/pay" element={<AuthGuard><BillingPayment /></AuthGuard>} />
                  <Route path="/educational-videos" element={<AuthGuard><OnboardingGuard><EducationalVideos /></OnboardingGuard></AuthGuard>} />
                  <Route path="/coach/pending-clients" element={<RoleProtectedRoute requiredRole="coach"><PendingClientsPage /></RoleProtectedRoute>} />
                  <Route path="/sessions" element={<AuthGuard><OnboardingGuard><ClientSessions /></OnboardingGuard></AuthGuard>} />
                  <Route path="/admin/client-diagnostics" element={<RoleProtectedRoute requiredRole="admin"><ClientDiagnostics /></RoleProtectedRoute>} />
                  <Route path="/admin/email-log" element={<RoleProtectedRoute requiredRole="admin"><EmailLog /></RoleProtectedRoute>} />
                  <Route path="/admin/workout-qa" element={<RoleProtectedRoute requiredRole="admin"><WorkoutBuilderQA /></RoleProtectedRoute>} />
                  <Route path="/admin/debug/roles" element={<RoleProtectedRoute requiredRole="admin"><RolesDebug /></RoleProtectedRoute>} />
                  <Route path="/admin/security-checklist" element={<RoleProtectedRoute requiredRole="admin"><SecurityHardeningChecklist /></RoleProtectedRoute>} />
                  <Route path="/admin/diagnostics" element={<RoleProtectedRoute requiredRole="admin"><DiagnosticsIndex /></RoleProtectedRoute>} />
                  <Route path="/admin/diagnostics/site-map" element={<RoleProtectedRoute requiredRole="admin"><SiteMapDiagnostics /></RoleProtectedRoute>} />
                  <Route path="/admin/health" element={<RoleProtectedRoute requiredRole="admin"><SystemHealth /></RoleProtectedRoute>} />
                  <Route path="/access-debug" element={<AuthGuard><AccessDebug /></AuthGuard>} />
                  <Route path="/unauthorized" element={<Unauthorized />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                {/* Global mobile bottom nav for all roles */}
                <Suspense fallback={null}>
                  <ClientMobileNavGlobal />
                  <CoachMobileNavGlobal />
                  <AdminMobileNavGlobal />
                </Suspense>
              </Suspense>
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
