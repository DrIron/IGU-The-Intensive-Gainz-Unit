import { Suspense, useEffect, memo } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate, useSearchParams } from "react-router-dom";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { AuthGuard } from "@/components/AuthGuard";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { TestEnvironmentBanner } from "@/components/TestEnvironmentBanner";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
const RoutesDebugPanel = lazyWithReload(() =>
  import("./components/admin/RoutesDebugPanel").then(m => ({ default: m.RoutesDebugPanel }))
);
import { OnboardingGuard } from "@/components/OnboardingGuard";
import { WaitlistGuard } from "@/components/WaitlistGuard";
import { useTokenGuard } from "@/hooks/useTokenGuard";
import { captureUTMParams } from "@/lib/utm";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";

// Lazy-loaded page components
const Index = lazyWithReload(() => import("./pages/Index"));
const Auth = lazyWithReload(() => import("./pages/Auth"));
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const AccountManagement = lazyWithReload(() => import("./pages/AccountManagement"));
const OnboardingForm = lazyWithReload(() => import("./pages/OnboardingForm"));
const ResetPassword = lazyWithReload(() => import("./pages/ResetPassword"));
const CalorieCalculator = lazyWithReload(() => import("./pages/CalorieCalculator"));
const WorkoutLibrary = lazyWithReload(() => import("./pages/WorkoutLibrary"));
const Services = lazyWithReload(() => import("./pages/Services"));
const Testimonial = lazyWithReload(() => import("./pages/Testimonial"));
const ClientSubmission = lazyWithReload(() => import("./pages/ClientSubmission"));
const MeetOurTeam = lazyWithReload(() => import("./pages/MeetOurTeam"));
const CoachSignup = lazyWithReload(() => import("./pages/CoachSignup"));
const CoachPasswordSetup = lazyWithReload(() => import("./pages/CoachPasswordSetup"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const Nutrition = lazyWithReload(() => import("./pages/Nutrition"));
const TeamNutrition = lazyWithReload(() => import("./pages/TeamNutrition"));
const ClientNutrition = lazyWithReload(() => import("./pages/ClientNutrition"));
const CoachClientOverview = lazyWithReload(() => import("./pages/CoachClientOverview"));
const PaymentStatus = lazyWithReload(() => import("./pages/PaymentStatus"));
const PaymentReturn = lazyWithReload(() => import("./pages/PaymentReturn"));
const BillingPayment = lazyWithReload(() => import("./pages/BillingPayment"));
const EducationalVideos = lazyWithReload(() => import("./pages/EducationalVideos"));
const PendingClientsPage = lazyWithReload(() => import("./pages/coach/PendingClientsPage"));
const ClientDiagnostics = lazyWithReload(() => import("./pages/admin/ClientDiagnostics"));
const EmailLog = lazyWithReload(() => import("./pages/admin/EmailLog"));
const ClientSessions = lazyWithReload(() => import("./pages/ClientSessions"));
const ClientMessages = lazyWithReload(() => import("./pages/ClientMessages"));
const AddonsCatalog = lazyWithReload(() => import("./pages/client/AddonsCatalog"));
const AdminDashboard = lazyWithReload(() => import("./pages/admin/AdminDashboard"));
const CoachDashboard = lazyWithReload(() => import("./pages/coach/CoachDashboard"));
const StudioPreview = lazyWithReload(() => import("./pages/coach/StudioPreview"));
const LaunchTestChecklist = lazyWithReload(() => import("./pages/admin/LaunchTestChecklist"));
const WorkoutBuilderQA = lazyWithReload(() => import("./pages/admin/WorkoutBuilderQA"));
const RolesDebug = lazyWithReload(() => import("./pages/admin/RolesDebug"));
const SecurityHardeningChecklist = lazyWithReload(() => import("./pages/admin/SecurityHardeningChecklist"));
const SiteMapDiagnostics = lazyWithReload(() => import("./pages/admin/SiteMapDiagnostics"));
const DiagnosticsIndex = lazyWithReload(() => import("./pages/admin/DiagnosticsIndex"));
const SystemHealth = lazyWithReload(() => import("./pages/admin/SystemHealth"));
const ContentEngagement = lazyWithReload(() => import("./pages/admin/ContentEngagement"));
const CoachContentAssignments = lazyWithReload(() => import("./pages/coach/CoachContentAssignments"));
const Unauthorized = lazyWithReload(() => import("./pages/Unauthorized"));
const WorkoutSessionV2 = lazyWithReload(() => import("./pages/client/WorkoutSessionV2"));
const WorkoutCalendar = lazyWithReload(() => import("./pages/client/WorkoutCalendar"));
const ExerciseHistory = lazyWithReload(() => import("./pages/client/ExerciseHistory"));
const AccessDebug = lazyWithReload(() => import("./pages/AccessDebug"));
const EmailConfirmed = lazyWithReload(() => import("./pages/EmailConfirmed"));
const Waitlist = lazyWithReload(() => import("./pages/Waitlist"));
const TeamsPage = lazyWithReload(() => import("./pages/TeamsPage"));
// Onboarding pages
const MedicalReview = lazyWithReload(() => import("./pages/onboarding/MedicalReview"));
const AwaitingApproval = lazyWithReload(() => import("./pages/onboarding/AwaitingApproval"));
const PaymentOnboarding = lazyWithReload(() => import("./pages/onboarding/Payment"));

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
    "/messages",
    "/workout-library",
    "/educational-videos",
    "/account",
    "/billing",
    "/payment-status",
    "/payment-return",
    "/services/addons",
  ];
  // Hide on active workout session — distraction-free logging UI
  if (location.pathname.startsWith("/client/workout/session/")) return null;
  const isClientRoute = clientPaths.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));

  if (!isClientRoute) return null;

  return <MobileBottomNavClient />;
});

// Lazy-load the actual nav to avoid pulling sidebar code into the initial bundle
const MobileBottomNavClient = lazyWithReload(() =>
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
  // (e.g. the shared client-submission page).
  const coachPrefixes = ["/coach", "/coach/clients", "/coach/nutrition-clients", "/client-submission"];
  const isCoachRoute = coachPrefixes.some(
    p => location.pathname === p || location.pathname.startsWith(p + "/")
  );
  if (!isCoachRoute) return null;
  return <MobileBottomNavCoach />;
});

/**
 * Redirects the legacy /coach-client-nutrition?client=X (and ?clientId=X)
 * URL to the per-client Client Overview shell with the nutrition tab open.
 * Without a client param, falls back to the coach dashboard's My Clients.
 * Kept only for old bookmarks/external links — no UI surface still links
 * to /coach-client-nutrition. Remove after a release with no 404s.
 */
function CoachClientNutritionRedirect() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("client") || searchParams.get("clientId");
  const target = clientId
    ? `/coach/clients/${clientId}?tab=nutrition`
    : "/coach";
  return <Navigate to={target} replace />;
}

// Pure-dietitian dock swaps Programs -> Nutrition clients. We surface
// `isDietitian` + `isCoach` from useSubrolePermissions inside the component
// so the dock re-renders when the subrole resolves (the hook is async).
const MobileBottomNavCoach = lazyWithReload(() =>
  Promise.all([
    import("@/components/layouts/MobileBottomNav"),
    import("@/components/coach/CoachSidebar"),
    import("@/hooks/useSubrolePermissions"),
  ]).then(([navMod, sidebarMod, subroleMod]) => ({
    default: () => {
      const { isDietitian, approvedSlugs } = subroleMod.useSubrolePermissions();
      const isCoach = approvedSlugs.includes("coach");
      return (
        <navMod.MobileBottomNav
          items={sidebarMod.getCoachMobileNavItems({ isDietitian, isCoach })}
        />
      );
    },
  }))
);

/** Mobile bottom nav for admin routes — persists across all authenticated admin pages */
const AdminMobileNavGlobal = memo(function AdminMobileNavGlobal() {
  const location = useLocation();
  const isAdminRoute =
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/");
  if (!isAdminRoute) return null;
  return <MobileBottomNavAdmin />;
});

const MobileBottomNavAdmin = lazyWithReload(() =>
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
                  <Route path="/coach/clients/:clientUserId" element={<RoleProtectedRoute requiredRole="coach"><CoachClientOverview /></RoleProtectedRoute>} />
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
                  {/* B9-N5: legacy standalone page deleted; redirect old bookmarks to the
                      admin dashboard testimonials tab (modern TestimonialsManager mount). */}
                  <Route path="/testimonials-management" element={<Navigate to="/admin/testimonials" replace />} />
                  <Route path="/nutrition" element={<AuthGuard><OnboardingGuard><Nutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/nutrition-team" element={<AuthGuard><OnboardingGuard><TeamNutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/nutrition-client" element={<AuthGuard><OnboardingGuard><ClientNutrition /></OnboardingGuard></AuthGuard>} />
                  <Route path="/coach-client-nutrition" element={<CoachClientNutritionRedirect />} />
                  <Route path="/payment-status" element={<AuthGuard><PaymentStatus /></AuthGuard>} />
                  <Route path="/payment-return" element={<AuthGuard><PaymentReturn /></AuthGuard>} />
                  <Route path="/billing/pay" element={<AuthGuard><BillingPayment /></AuthGuard>} />
                  <Route path="/educational-videos" element={<AuthGuard><OnboardingGuard><EducationalVideos /></OnboardingGuard></AuthGuard>} />
                  <Route path="/coach/pending-clients" element={<RoleProtectedRoute requiredRole="coach"><PendingClientsPage /></RoleProtectedRoute>} />
                  <Route path="/coach/content-assignments" element={<RoleProtectedRoute requiredRole="coach"><CoachContentAssignments /></RoleProtectedRoute>} />
                  <Route path="/sessions" element={<AuthGuard><OnboardingGuard><ClientSessions /></OnboardingGuard></AuthGuard>} />
                  <Route path="/messages" element={<AuthGuard><OnboardingGuard><ClientMessages /></OnboardingGuard></AuthGuard>} />
                  <Route path="/services/addons" element={<AuthGuard><OnboardingGuard><AddonsCatalog /></OnboardingGuard></AuthGuard>} />
                  <Route path="/admin/client-diagnostics" element={<RoleProtectedRoute requiredRole="admin"><ClientDiagnostics /></RoleProtectedRoute>} />
                  <Route path="/admin/email-log" element={<RoleProtectedRoute requiredRole="admin"><EmailLog /></RoleProtectedRoute>} />
                  <Route path="/admin/workout-qa" element={<RoleProtectedRoute requiredRole="admin"><WorkoutBuilderQA /></RoleProtectedRoute>} />
                  <Route path="/admin/debug/roles" element={<RoleProtectedRoute requiredRole="admin"><RolesDebug /></RoleProtectedRoute>} />
                  <Route path="/admin/security-checklist" element={<RoleProtectedRoute requiredRole="admin"><SecurityHardeningChecklist /></RoleProtectedRoute>} />
                  <Route path="/admin/diagnostics" element={<RoleProtectedRoute requiredRole="admin"><DiagnosticsIndex /></RoleProtectedRoute>} />
                  <Route path="/admin/diagnostics/site-map" element={<RoleProtectedRoute requiredRole="admin"><SiteMapDiagnostics /></RoleProtectedRoute>} />
                  <Route path="/admin/health" element={<RoleProtectedRoute requiredRole="admin"><SystemHealth /></RoleProtectedRoute>} />
                  <Route path="/admin/content-engagement" element={<RoleProtectedRoute requiredRole="admin"><ContentEngagement /></RoleProtectedRoute>} />
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
