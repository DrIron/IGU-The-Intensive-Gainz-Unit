import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { AuthGuard } from "@/components/AuthGuard";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { TestEnvironmentBanner } from "@/components/TestEnvironmentBanner";
import { PublicLayout } from "@/components/layouts/PublicLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import AccountManagement from "./pages/AccountManagement";
import OnboardingForm from "./pages/OnboardingForm";
import ResetPassword from "./pages/ResetPassword";
import CalorieCalculator from "./pages/CalorieCalculator";
import WorkoutLibrary from "./pages/WorkoutLibrary";
import Services from "./pages/Services";
import Testimonial from "./pages/Testimonial";
import ClientSubmission from "./pages/ClientSubmission";
import MeetOurTeam from "./pages/MeetOurTeam";
import CoachSignup from "./pages/CoachSignup";
import CoachPasswordSetup from "./pages/CoachPasswordSetup";
import TestimonialsManagement from "./pages/TestimonialsManagement";
import NotFound from "./pages/NotFound";
import Nutrition from "./pages/Nutrition";
import TeamNutrition from "./pages/TeamNutrition";
import ClientNutrition from "./pages/ClientNutrition";
import CoachClientNutrition from "./pages/CoachClientNutrition";
import PaymentStatus from "./pages/PaymentStatus";
import PaymentReturn from "./pages/PaymentReturn";
import BillingPayment from "./pages/BillingPayment";
import EducationalVideos from "./pages/EducationalVideos";
import PendingClientsPage from "./pages/coach/PendingClientsPage";
import ClientDiagnostics from "./pages/admin/ClientDiagnostics";
import EmailLog from "./pages/admin/EmailLog";
import ClientSessions from "./pages/ClientSessions";
import AdminDashboard from "./pages/admin/AdminDashboard";
import CoachDashboard from "./pages/coach/CoachDashboard";
import LaunchTestChecklist from "./pages/admin/LaunchTestChecklist";
import WorkoutBuilderQA from "./pages/admin/WorkoutBuilderQA";
import RolesDebug from "./pages/admin/RolesDebug";
import SecurityHardeningChecklist from "./pages/admin/SecurityHardeningChecklist";
import SiteMapDiagnostics from "./pages/admin/SiteMapDiagnostics";
import DiagnosticsIndex from "./pages/admin/DiagnosticsIndex";
import SystemHealth from "./pages/admin/SystemHealth";
import Unauthorized from "./pages/Unauthorized";
import { RoutesDebugPanel } from "./components/admin/RoutesDebugPanel";
import WorkoutSession from "./pages/client/WorkoutSession";
import WorkoutCalendar from "./pages/client/WorkoutCalendar";
import ExerciseHistory from "./pages/client/ExerciseHistory";
import AccessDebug from "./pages/AccessDebug";
// Onboarding pages
import MedicalReview from "./pages/onboarding/MedicalReview";
import AwaitingApproval from "./pages/onboarding/AwaitingApproval";
import PaymentOnboarding from "./pages/onboarding/Payment";
import { OnboardingGuard } from "@/components/OnboardingGuard";

const queryClient = new QueryClient();

const App = () => {
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner position="bottom-center" className="md:!bottom-4 md:!right-4 md:!left-auto" />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TestEnvironmentBanner />
            {/* Routes Debug Panel - only shows in non-production */}
            <RoutesDebugPanel show={!window.location.hostname.includes('theigu.com')} />
            <div className="min-h-screen">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<PublicLayout minimal><Auth /></PublicLayout>} />
                <Route path="/services" element={<PublicLayout><Services /></PublicLayout>} />
                
                {/* Role-scoped Admin routes - requires admin role */}
                <Route path="/admin" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />
                <Route path="/admin/:section" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />
                
                {/* Role-scoped Coach routes - requires coach role ONLY (admins must use separate coach account) */}
                <Route path="/coach" element={<RoleProtectedRoute requiredRole="coach"><CoachDashboard /></RoleProtectedRoute>} />
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
                <Route path="/client/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
                <Route path="/client/workout/session/:moduleId" element={<AuthGuard><WorkoutSession /></AuthGuard>} />
                <Route path="/client/workout/calendar" element={<AuthGuard><WorkoutCalendar /></AuthGuard>} />
                <Route path="/client/workout/history" element={<AuthGuard><ExerciseHistory /></AuthGuard>} />
                
                <Route path="/account" element={<AuthGuard><AccountManagement /></AuthGuard>} />
                <Route path="/reset-password" element={<PublicLayout minimal><ResetPassword /></PublicLayout>} />
                <Route path="/calorie-calculator" element={<PublicLayout><CalorieCalculator /></PublicLayout>} />
                <Route path="/workout-library" element={<AuthGuard><WorkoutLibrary /></AuthGuard>} />
                <Route path="/testimonial" element={<PublicLayout><Testimonial /></PublicLayout>} />
                <Route path="/client-submission/:userId" element={<ClientSubmission />} />
                <Route path="/meet-our-team" element={<PublicLayout><MeetOurTeam /></PublicLayout>} />
                <Route path="/coach-signup" element={<PublicLayout><CoachSignup /></PublicLayout>} />
                <Route path="/coach-password-setup" element={<CoachPasswordSetup />} />
                <Route path="/coach-password-set" element={<CoachPasswordSetup />} />
                <Route path="/testimonials-management" element={<RoleProtectedRoute requiredRole="admin"><TestimonialsManagement /></RoleProtectedRoute>} />
                <Route path="/nutrition" element={<AuthGuard><Nutrition /></AuthGuard>} />
                <Route path="/nutrition-team" element={<AuthGuard><TeamNutrition /></AuthGuard>} />
                <Route path="/nutrition-client" element={<AuthGuard><ClientNutrition /></AuthGuard>} />
                <Route path="/coach-client-nutrition" element={<AuthGuard><CoachClientNutrition /></AuthGuard>} />
                <Route path="/payment-status" element={<AuthGuard><PaymentStatus /></AuthGuard>} />
                <Route path="/payment-return" element={<AuthGuard><PaymentReturn /></AuthGuard>} />
                <Route path="/billing/pay" element={<AuthGuard><BillingPayment /></AuthGuard>} />
                <Route path="/educational-videos" element={<AuthGuard><EducationalVideos /></AuthGuard>} />
                <Route path="/coach/pending-clients" element={<RoleProtectedRoute requiredRole="coach"><PendingClientsPage /></RoleProtectedRoute>} />
                <Route path="/sessions" element={<AuthGuard><ClientSessions /></AuthGuard>} />
                <Route path="/admin/client-diagnostics" element={<RoleProtectedRoute requiredRole="admin"><ClientDiagnostics /></RoleProtectedRoute>} />
                <Route path="/admin/email-log" element={<RoleProtectedRoute requiredRole="admin"><EmailLog /></RoleProtectedRoute>} />
                <Route path="/admin/launch-checklist" element={<RoleProtectedRoute requiredRole="admin"><LaunchTestChecklist /></RoleProtectedRoute>} />
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
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
