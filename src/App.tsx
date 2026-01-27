import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary";
import { TestEnvironmentBanner } from "@/components/TestEnvironmentBanner";
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
import Unauthorized from "./pages/Unauthorized";
import WorkoutSession from "./pages/client/WorkoutSession";
import WorkoutCalendar from "./pages/client/WorkoutCalendar";
import ExerciseHistory from "./pages/client/ExerciseHistory";
import AccessDebug from "./pages/AccessDebug";
const queryClient = new QueryClient();

const App = () => {
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <TestEnvironmentBanner />
            <div className="min-h-screen">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/services" element={<Services />} />
                
                {/* Role-scoped Admin routes - requires admin role */}
                <Route path="/admin" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />
                <Route path="/admin/:section" element={<RoleProtectedRoute requiredRole="admin"><AdminDashboard /></RoleProtectedRoute>} />
                
                {/* Role-scoped Coach routes - requires coach role ONLY (admins must use separate coach account) */}
                <Route path="/coach" element={<RoleProtectedRoute requiredRole="coach"><CoachDashboard /></RoleProtectedRoute>} />
                <Route path="/coach/:section" element={<RoleProtectedRoute requiredRole="coach"><CoachDashboard /></RoleProtectedRoute>} />
                
                {/* Legacy dashboard - redirects based on role or serves client dashboard */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                
                {/* Client routes - will be for clients only */}
                <Route path="/client" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/client/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/client/workout/session/:moduleId" element={<ProtectedRoute><WorkoutSession /></ProtectedRoute>} />
                <Route path="/client/workout/calendar" element={<ProtectedRoute><WorkoutCalendar /></ProtectedRoute>} />
                <Route path="/client/workout/history" element={<ProtectedRoute><ExerciseHistory /></ProtectedRoute>} />
                
                <Route path="/account" element={<ProtectedRoute><AccountManagement /></ProtectedRoute>} />
                <Route path="/onboarding" element={<ProtectedRoute><OnboardingForm /></ProtectedRoute>} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/calorie-calculator" element={<CalorieCalculator />} />
                <Route path="/workout-library" element={<ProtectedRoute><WorkoutLibrary /></ProtectedRoute>} />
                <Route path="/testimonial" element={<Testimonial />} />
                <Route path="/client-submission/:userId" element={<ClientSubmission />} />
                <Route path="/meet-our-team" element={<MeetOurTeam />} />
                <Route path="/coach-signup" element={<CoachSignup />} />
                <Route path="/coach-password-setup" element={<CoachPasswordSetup />} />
                <Route path="/coach-password-set" element={<CoachPasswordSetup />} />
                <Route path="/testimonials-management" element={<TestimonialsManagement />} />
                <Route path="/nutrition" element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
                <Route path="/nutrition-team" element={<ProtectedRoute><TeamNutrition /></ProtectedRoute>} />
                <Route path="/nutrition-client" element={<ProtectedRoute><ClientNutrition /></ProtectedRoute>} />
                <Route path="/coach-client-nutrition" element={<ProtectedRoute><CoachClientNutrition /></ProtectedRoute>} />
                <Route path="/payment-status" element={<ProtectedRoute><PaymentStatus /></ProtectedRoute>} />
                <Route path="/payment-return" element={<ProtectedRoute><PaymentReturn /></ProtectedRoute>} />
                <Route path="/billing/pay" element={<ProtectedRoute><BillingPayment /></ProtectedRoute>} />
                <Route path="/educational-videos" element={<ProtectedRoute><EducationalVideos /></ProtectedRoute>} />
                <Route path="/coach/pending-clients" element={<RoleProtectedRoute requiredRole="coach"><PendingClientsPage /></RoleProtectedRoute>} />
                <Route path="/sessions" element={<ProtectedRoute><ClientSessions /></ProtectedRoute>} />
                <Route path="/admin/client-diagnostics" element={<RoleProtectedRoute requiredRole="admin"><ClientDiagnostics /></RoleProtectedRoute>} />
                <Route path="/admin/email-log" element={<RoleProtectedRoute requiredRole="admin"><EmailLog /></RoleProtectedRoute>} />
                <Route path="/admin/launch-checklist" element={<RoleProtectedRoute requiredRole="admin"><LaunchTestChecklist /></RoleProtectedRoute>} />
                <Route path="/admin/workout-qa" element={<RoleProtectedRoute requiredRole="admin"><WorkoutBuilderQA /></RoleProtectedRoute>} />
                <Route path="/admin/debug/roles" element={<RoleProtectedRoute requiredRole="admin"><RolesDebug /></RoleProtectedRoute>} />
                <Route path="/admin/security-checklist" element={<RoleProtectedRoute requiredRole="admin"><SecurityHardeningChecklist /></RoleProtectedRoute>} />
                <Route path="/admin/diagnostics/site-map" element={<RoleProtectedRoute requiredRole="admin"><SiteMapDiagnostics /></RoleProtectedRoute>} />
                <Route path="/access-debug" element={<ProtectedRoute><AccessDebug /></ProtectedRoute>} />
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
