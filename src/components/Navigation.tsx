import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Menu, X, Dumbbell, User, ChevronDown,
  LayoutDashboard, CreditCard, Apple, Users,
  UserCog, Shield, Video, Library, MessageSquare,
  Calculator, Home, FileText, Settings, DollarSign,
  UserCheck, UsersRound
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IguLogo } from "@/components/IguLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
import { useAuthCleanup } from "@/hooks/useAuthCleanup";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useRoleCache } from "@/hooks/useRoleCache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface NavigationProps {
  user?: any;
  userRole?: string;
  onSectionChange?: (section: string) => void;
  activeSection?: string;
}

export function Navigation({ user: propUser, userRole: propUserRole, onSectionChange, activeSection }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [detectedRole, setDetectedRole] = useState<string | null>(propUserRole || null);
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goToAuthOrDashboard } = useAuthNavigation();
  const { signOutWithCleanup } = useAuthCleanup();
  const { t } = useTranslation('nav');

  // Use the same auth hooks as RoleProtectedRoute for consistency
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const { cachedRoles, cachedUserId } = useRoleCache();

  // User is considered authenticated if we have a session user OR valid cached roles
  // This ensures Navigation stays in sync with RoleProtectedRoute's cache-first approach
  const currentUser = useMemo(() =>
    propUser || sessionUser || (cachedRoles && cachedRoles.length > 0 && cachedUserId ? { id: cachedUserId } : null),
    [propUser, sessionUser, cachedRoles, cachedUserId]
  );

  // Effective user ID for database queries (prefer session user, fall back to cached)
  const effectiveUserId = sessionUser?.id || cachedUserId;

  const loadMemberStatus = useCallback(async () => {
    if (!effectiveUserId) return;

    // Fetch profile - use profiles_public for navigation (client's own data, RLS protected)
    const { data: profileData } = await supabase
      .from("profiles_public")
      .select("*")
      .eq("id", effectiveUserId)
      .single();

    setProfile(profileData);

    // Fetch subscription with service details
    const { data: subData } = await supabase
      .from("subscriptions")
      .select(`
        *,
        services (
          id,
          name,
          type
        )
      `)
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription(subData);
  }, [effectiveUserId]);

  const loadUserRole = useCallback(async () => {
    // First, check if we have cached roles - use them directly (cache-first approach)
    if (cachedRoles && cachedRoles.length > 0) {
      if (cachedRoles.includes('admin')) {
        setDetectedRole('admin');
      } else if (cachedRoles.includes('coach')) {
        setDetectedRole('coach');
      } else {
        setDetectedRole('client');
      }
      return;
    }

    // Otherwise, query the database if we have a valid user ID
    if (!effectiveUserId) return;

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", effectiveUserId);

    if (rolesData && rolesData.length > 0) {
      const roles = rolesData.map(r => r.role);
      if (roles.includes('admin')) {
        setDetectedRole('admin');
      } else if (roles.includes('coach')) {
        setDetectedRole('coach');
      } else {
        setDetectedRole('client');
      }
    }
  }, [cachedRoles, effectiveUserId]);

  useEffect(() => {
    if ((currentUser || cachedRoles) && !propUserRole) {
      loadUserRole();
    } else if (propUserRole) {
      setDetectedRole(propUserRole);
    }
  }, [currentUser, propUserRole, cachedRoles, loadUserRole]);

  // Fetch profile and subscription for member status badge
  useEffect(() => {
    if (effectiveUserId) {
      loadMemberStatus();
    }
  }, [effectiveUserId, loadMemberStatus]);

  const activeRole = detectedRole;
  const user = currentUser;

  const handleSignOut = async () => {
    try {
      // Use signOutWithCleanup to clear role cache and sign out
      await signOutWithCleanup();
    } catch (error) {
      console.error('[Navigation] Sign out failed:', error);
    } finally {
      // Clear all auth-related localStorage keys (belt + suspenders)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.startsWith('igu_') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });

      // Clear sessionStorage
      sessionStorage.clear();

      // Hard redirect to auth page (full page reload clears in-memory state)
      window.location.replace("/auth");
    }
  };

  // Public links for header navigation
  // Hide public links for admin/coach dashboards - they use sidebar navigation
  const isAdminOrCoachDashboard = activeRole === 'admin' || activeRole === 'coach';

  const publicLinks = isAdminOrCoachDashboard
    ? [] // Admin and coach use sidebar navigation, not top nav
    : user
    ? [
        { label: t('home'), path: "/" },
        { label: t('services'), path: "/services" },
        { label: t('nutrition'), path: "/nutrition" },
        { label: t('ourTeam'), path: "/meet-our-team" },
      ]
    : [
        { label: t('home'), path: "/" },
        { label: t('services'), path: "/services" },
        { label: t('calculator'), path: "/calorie-calculator" },
        { label: t('ourTeam'), path: "/meet-our-team" },
      ];

  // Mobile menu items by role
  const getMobileMenuItems = () => {
    if (!user) {
      // Logged out
      return [
        { label: t('home'), path: "/", icon: Home },
        { label: t('services'), path: "/services", icon: FileText },
        { label: t('calorieCalculator'), path: "/calorie-calculator", icon: Calculator },
        { label: t('ourTeam'), path: "/meet-our-team", icon: Users },
      ];
    }

    if (activeRole === 'admin') {
      // Admin menu - admin pages only, no coach pages in admin nav
      return {
        admin: [
          { label: t('overview'), path: "/admin/dashboard", icon: LayoutDashboard },
          { label: t('clientDirectory'), path: "/admin/clients", icon: Users },
          { label: t('coaches'), path: "/admin/coaches", icon: UserCog },
          { label: t('testimonials'), path: "/admin/testimonials", icon: MessageSquare },
          { label: t('contentLibrary'), path: "/admin/exercises", icon: Library },
          { label: t('discounts'), path: "/admin/discount-codes", icon: DollarSign },
          { label: t('discordLegal'), path: "/admin/discord-legal", icon: Shield },
        ],
      };
    }

    if (activeRole === 'coach') {
      // Coach menu - coach pages only, NO admin pages
      return {
        coach: [
          { label: t('dashboard'), path: "/coach/dashboard", icon: LayoutDashboard },
          { label: t('myClients'), path: "/coach/clients", icon: Users },
          { label: t('pendingApprovals'), path: "/coach/clients?filter=pending", icon: UserCheck },
          { label: t('programs'), path: "/coach/programs", icon: Shield },
          { label: t('myProfile'), path: "/coach/profile", icon: UserCog },
        ],
      };
    }

    // Client - use direct paths to avoid double navigation
    return {
      client: [
        { label: t('dashboard'), path: "/dashboard", section: "overview", icon: LayoutDashboard },
        { label: t('mySubscription'), path: "/dashboard", section: "subscription", icon: CreditCard },
        { label: t('nutrition'), path: "/nutrition", icon: Apple },
        { label: t('exerciseLibrary'), path: "/workout-library", icon: Library },
        { label: t('videos'), path: "/educational-videos", icon: Video },
        { label: t('profile'), path: "/dashboard", section: "profile", icon: User },
      ],
    };
  };

  const getDashboardSections = () => {
    if (!activeRole) return { admin: [], coach: [], client: [] };

    if (activeRole === 'admin') {
      // Admin sections - admin pages only
      return {
        admin: [
          { label: t('overview'), path: "/admin/dashboard" },
          { label: t('clientDirectory'), path: "/admin/clients" },
          { label: t('coaches'), path: "/admin/coaches" },
          { label: t('pricingPayouts'), path: "/admin/pricing-payouts" },
        ],
        coach: [], // STRICT: Admins must use separate coach account to access coach routes
        client: []
      };
    }

    if (activeRole === 'coach') {
      // Coach sections - coach pages only, NO admin access
      return {
        admin: [], // Coach cannot see admin pages
        coach: [
          { label: t('overview'), path: "/coach/dashboard" },
          { label: t('myClients'), path: "/coach/clients" },
          { label: t('sessions'), path: "/coach/sessions" },
          { label: t('myProfile'), path: "/coach/profile" },
        ],
        client: []
      };
    }

    // Client sections
    return {
      admin: [],
      coach: [],
      client: [
        { label: t('overview'), section: "overview" },
        { label: t('nutrition'), section: "nutrition" },
      ]
    };
  };

  const userLinks = [
    { label: t('workoutLibrary'), path: "/workout-library" },
    { label: t('account'), path: "/account" }
  ];

  const mobileMenuItems = getMobileMenuItems();
  const dashboardSections = getDashboardSections();

  // Derive member status badge and tone
  const getMemberStatus = () => {
    if (!profile) return null;

    // Admin and coach roles don't have client subscriptions - no status badge needed
    if (activeRole === 'admin' || activeRole === 'coach') return null;

    const profileStatus = profile?.status;
    const subStatus = subscription?.status;
    const serviceName = subscription?.services?.name;
    const serviceType = subscription?.services?.type;
    const hasSubscription = !!subscription;

    let label = t('statusUnknown');
    let tone: "pending" | "active" | "danger" | "info" = "info";

    if (profileStatus === "pending" && !hasSubscription) {
      label = t('statusPendingOnboarding');
      tone = "pending";
    } else if (profileStatus === "needs_medical_review") {
      label = t('statusMedicalReview');
      tone = "pending";
    } else if (profileStatus === "pending_coach_approval") {
      label = t('statusPendingCoachApproval');
      tone = "pending";
    } else if (profileStatus === "pending_payment") {
      label = t('statusPendingPayment');
      tone = "pending";
    } else if (profileStatus === "active" && subStatus === "active") {
      label = serviceName ? t('statusActiveWith', { serviceName }) : t('statusActive');
      tone = "active";
    } else if (profileStatus === "inactive" || subStatus === "inactive") {
      label = t('statusInactive');
      tone = "danger";
    } else if (profileStatus === "cancelled" || profileStatus === "expired") {
      label = t('statusEnded');
      tone = "danger";
    } else if (profileStatus === "suspended") {
      label = t('statusSuspended');
      tone = "danger";
    }

    return { label, tone, serviceName, serviceType };
  };

  const memberStatus = getMemberStatus();

  // Get user roles for display
  const getRoleLabel = () => {
    if (!detectedRole) return null;

    const roles = [];
    if (activeRole === 'admin') roles.push(t('admin'));
    if (activeRole === 'coach') roles.push(t('coach'));
    if (roles.length === 0) roles.push(t('member'));

    return roles.join(' & ');
  };

  const roleLabel = getRoleLabel();

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <nav className="sticky top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <IguLogo height={28} variant="light" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              {publicLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="text-foreground/80 hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <LanguageSwitcher />
              {user ? (
                <>
                  {memberStatus && (
                    <Badge
                      variant={
                        memberStatus.tone === "active" ? "default" :
                        memberStatus.tone === "pending" ? "outline" :
                        memberStatus.tone === "danger" ? "destructive" :
                        "secondary"
                      }
                      className="text-xs px-2 py-1"
                    >
                      {memberStatus.label}
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-1">
                        <User className="h-4 w-4" />
                        {t('common:menu')}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-background z-50">
                      {roleLabel && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs">
                            {t('role')}: <span className="font-semibold text-foreground">{roleLabel}</span>
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {dashboardSections.admin.length > 0 && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">{t('adminPages')}</DropdownMenuLabel>
                          {dashboardSections.admin.map((item: any) => (
                            <DropdownMenuItem
                              key={item.path}
                              onClick={() => navigate(item.path)}
                              className="cursor-pointer"
                            >
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {dashboardSections.coach.length > 0 && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">{t('coachPages')}</DropdownMenuLabel>
                          {dashboardSections.coach.map((item: any) => (
                            <DropdownMenuItem
                              key={item.path}
                              onClick={() => navigate(item.path)}
                              className="cursor-pointer"
                            >
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {dashboardSections.client.length > 0 && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">{t('dashboard')}</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link to="/dashboard" className="cursor-pointer">
                              {t('dashboard')}
                            </Link>
                          </DropdownMenuItem>
                          {dashboardSections.client.map((item) => (
                            <DropdownMenuItem
                              key={item.section}
                              onClick={() => {
                                if (onSectionChange) {
                                  navigate("/dashboard");
                                  setTimeout(() => onSectionChange(item.section), 100);
                                } else {
                                  navigate("/dashboard");
                                }
                              }}
                              className={`cursor-pointer ${
                                activeSection === item.section
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : ''
                              }`}
                            >
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {userLinks.map((link) => (
                        <DropdownMenuItem key={link.path} asChild>
                          <Link to={link.path} className="cursor-pointer">
                            {link.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                        {t('common:signOut')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button onClick={() => goToAuthOrDashboard(user)} variant="default">
                  {t('common:signIn')}
                </Button>
              )}
            </div>

            {/* Mobile Menu Button - Only visible on mobile */}
            <div className="flex items-center gap-2 md:hidden">
              <LanguageSwitcher />
              <button
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t('openMenu')}
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Full screen overlay with proper z-index */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[9999] md:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop - click to close */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-in panel from right */}
          <div
            className="absolute top-0 right-0 h-full w-[85vw] max-w-[320px] bg-background shadow-2xl flex flex-col animate-slide-in-right"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Header with logo and close button */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-background shrink-0">
              <div className="flex items-center">
                <IguLogo height={22} variant="light" />
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label={t('closeMenu')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Navigation Links */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col py-2">
                {/* Logged out menu - simplified public links */}
                {!user && (
                  <>
                    <Link
                      to="/"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Home className="h-5 w-5 text-muted-foreground" />
                      {t('home')}
                    </Link>
                    <Link
                      to="/services"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      {t('services')}
                    </Link>
                    <Link
                      to="/calorie-calculator"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Calculator className="h-5 w-5 text-muted-foreground" />
                      {t('calorieCalculator')}
                    </Link>
                    <Link
                      to="/meet-our-team"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Users className="h-5 w-5 text-muted-foreground" />
                      {t('ourTeam')}
                    </Link>
                  </>
                )}

                {/* Logged in menu */}
                {user && (
                  <>
                    {/* Status badge */}
                    {memberStatus && (
                      <div className="px-5 py-3 border-b border-border">
                        <Badge
                          variant={
                            memberStatus.tone === "active" ? "default" :
                            memberStatus.tone === "pending" ? "outline" :
                            memberStatus.tone === "danger" ? "destructive" :
                            "secondary"
                          }
                          className="text-xs px-2 py-1"
                        >
                          {memberStatus.label}
                        </Badge>
                        {roleLabel && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {roleLabel}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Admin menu items */}
                    {!Array.isArray(mobileMenuItems) && mobileMenuItems.admin && (
                      <>
                        <div className="px-5 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/30">
                          {t('admin')}
                        </div>
                        {mobileMenuItems.admin.map((item: any) => {
                          const Icon = item.icon;
                          // All admin items have explicit paths - single navigation
                          return (
                            <Link
                              key={item.label}
                              to={item.path}
                              className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm"
                              onClick={() => {
                                if (process.env.NODE_ENV === 'development') {
                                  console.log('[MobileNav] Single navigation:', item.path);
                                }
                                setMobileMenuOpen(false);
                              }}
                            >
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              {item.label}
                            </Link>
                          );
                        })}
                      </>
                    )}

                    {/* Coach menu items */}
                    {!Array.isArray(mobileMenuItems) && mobileMenuItems.coach && (
                      <>
                        <div className="px-5 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/30 mt-1">
                          {t('coach')}
                        </div>
                        {mobileMenuItems.coach.map((item: any) => {
                          const Icon = item.icon;
                          // All coach items have explicit paths - single navigation
                          return (
                            <Link
                              key={item.label}
                              to={item.path}
                              className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm"
                              onClick={() => {
                                if (process.env.NODE_ENV === 'development') {
                                  console.log('[MobileNav] Single navigation:', item.path);
                                }
                                setMobileMenuOpen(false);
                              }}
                            >
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              {item.label}
                            </Link>
                          );
                        })}
                      </>
                    )}

                    {/* Client menu items */}
                    {!Array.isArray(mobileMenuItems) && mobileMenuItems.client && (
                      <>
                        <div className="px-5 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-muted/30">
                          {t('dashboard')}
                        </div>
                        {mobileMenuItems.client.map((item: any) => {
                          const Icon = item.icon;
                          // Build the final URL - single navigation target
                          const targetUrl = item.section
                            ? `${item.path}?section=${item.section}`
                            : item.path;

                          return (
                            <Link
                              key={item.label}
                              to={targetUrl}
                              className={cn(
                                "flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm",
                                activeSection === item.section && "bg-primary/10 text-primary font-medium"
                              )}
                              onClick={(e) => {
                                // DEV: Log single navigation trigger
                                if (process.env.NODE_ENV === 'development') {
                                  console.log('[MobileNav] Single navigation:', targetUrl);
                                }
                                // Close drawer AFTER Link handles navigation
                                setMobileMenuOpen(false);
                              }}
                            >
                              <Icon className={cn("h-4 w-4", activeSection === item.section ? "text-primary" : "text-muted-foreground")} />
                              {item.label}
                            </Link>
                          );
                        })}
                      </>
                    )}

                    {/* Settings links */}
                    <div className="border-t border-border mt-2 pt-2">
                      <Link
                        to="/workout-library"
                        className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Dumbbell className="h-4 w-4 text-muted-foreground" />
                        {t('workoutLibrary')}
                      </Link>
                      <Link
                        to="/account"
                        className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        {t('account')}
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Fixed bottom section with auth CTA */}
            <div className="shrink-0 px-5 py-4 border-t border-border bg-background">
              {user ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      navigate("/dashboard");
                      setMobileMenuOpen(false);
                    }}
                    variant="default"
                    className="w-full"
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    {t('goToDashboard')}
                  </Button>
                  <Button onClick={handleSignOut} variant="outline" className="w-full">
                    {t('common:signOut')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    onClick={() => {
                      goToAuthOrDashboard(user);
                      setMobileMenuOpen(false);
                    }}
                    variant="default"
                    className="w-full"
                  >
                    {t('logInDashboard')}
                  </Button>
                  <button
                    onClick={() => {
                      navigate("/services");
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-2"
                  >
                    {t('becomeClient')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
