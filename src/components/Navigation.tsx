import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
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
  const [currentUser, setCurrentUser] = useState<any>(propUser || null);
  const [detectedRole, setDetectedRole] = useState<string | null>(propUserRole || null);
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { goToAuthOrDashboard } = useAuthNavigation();

  // Fetch current user if not provided as prop
  useEffect(() => {
    const checkUser = async () => {
      if (propUser) {
        setCurrentUser(propUser);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
      } else {
        setCurrentUser(null);
      }
    };

    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [propUser]);

  useEffect(() => {
    if (currentUser && !propUserRole) {
      loadUserRole();
    } else if (propUserRole) {
      setDetectedRole(propUserRole);
    }
  }, [currentUser, propUserRole]);

  // Fetch profile and subscription for member status badge
  useEffect(() => {
    if (currentUser) {
      loadMemberStatus();
    }
  }, [currentUser]);

  const loadMemberStatus = async () => {
    if (!currentUser) return;

    // Fetch profile - use profiles_public for navigation (client's own data, RLS protected)
    const { data: profileData } = await supabase
      .from("profiles_public")
      .select("*")
      .eq("id", currentUser.id)
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
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription(subData);
  };

  const loadUserRole = async () => {
    if (!currentUser) return;
    
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id);

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
  };

  const activeRole = detectedRole;
  const user = currentUser;

  const handleSignOut = () => {
    // Clear local state FIRST before any network calls
    // This ensures the user is logged out even if the network fails

    // Clear all Supabase-related localStorage keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });

    // Clear sessionStorage
    sessionStorage.clear();

    // Attempt server signOut but don't block on it
    // Using scope: 'local' avoids the network call that can fail
    supabase.auth.signOut({ scope: 'local' }).catch(err => {
      console.warn('SignOut API call failed (user still logged out locally):', err);
    });

    // Redirect to auth page
    window.location.href = "/auth";
  };

  // Public links for header navigation
  const publicLinks = user 
    ? [
        { label: "Home", path: "/" },
        { label: "Services", path: "/services" },
        { label: "Nutrition", path: "/nutrition" },
        { label: "Our Team", path: "/meet-our-team" },
      ]
    : [
        { label: "Home", path: "/" },
        { label: "Services", path: "/services" },
        { label: "Calculator", path: "/calorie-calculator" },
        { label: "Our Team", path: "/meet-our-team" },
      ];

  // Mobile menu items by role
  const getMobileMenuItems = () => {
    if (!user) {
      // Logged out
      return [
        { label: "Home", path: "/", icon: Home },
        { label: "Services", path: "/services", icon: FileText },
        { label: "Calculator", path: "/calorie-calculator", icon: Calculator },
        { label: "Our Team", path: "/meet-our-team", icon: Users },
      ];
    }

    if (activeRole === 'admin') {
      // Admin menu - admin pages only, no coach pages in admin nav
      return {
        admin: [
          { label: "Overview", path: "/admin/dashboard", icon: LayoutDashboard },
          { label: "Client Directory", path: "/admin/clients", icon: Users },
          { label: "Coaches", path: "/admin/coaches", icon: UserCog },
          { label: "Testimonials", path: "/admin/testimonials", icon: MessageSquare },
          { label: "Content Library", path: "/admin/exercises", icon: Library },
          { label: "Discounts", path: "/admin/discount-codes", icon: DollarSign },
          { label: "Discord & Legal", path: "/admin/discord-legal", icon: Shield },
        ],
      };
    }

    if (activeRole === 'coach') {
      // Coach menu - coach pages only, NO admin pages
      return {
        coach: [
          { label: "Dashboard", path: "/coach/dashboard", icon: LayoutDashboard },
          { label: "My Clients", path: "/coach/clients", icon: Users },
          { label: "Pending Approvals", path: "/coach/clients?filter=pending", icon: UserCheck },
          { label: "Programs", path: "/coach/programs", icon: Shield },
          { label: "My Profile", path: "/coach/profile", icon: UserCog },
        ],
      };
    }

    // Client - use direct paths to avoid double navigation
    return {
      client: [
        { label: "Dashboard", path: "/dashboard", section: "overview", icon: LayoutDashboard },
        { label: "My Subscription", path: "/dashboard", section: "subscription", icon: CreditCard },
        { label: "Nutrition", path: "/nutrition", icon: Apple },
        { label: "Exercise Library", path: "/workout-library", icon: Library },
        { label: "Videos", path: "/educational-videos", icon: Video },
        { label: "Profile", path: "/dashboard", section: "profile", icon: User },
      ],
    };
  };

  const getDashboardSections = () => {
    if (!activeRole) return { admin: [], coach: [], client: [] };

    if (activeRole === 'admin') {
      // Admin sections - admin pages only
      return {
        admin: [
          { label: "Overview", path: "/admin/dashboard" },
          { label: "Client Directory", path: "/admin/clients" },
          { label: "Coaches", path: "/admin/coaches" },
          { label: "Pricing & Payouts", path: "/admin/pricing-payouts" },
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
          { label: "Overview", path: "/coach/dashboard" },
          { label: "My Clients", path: "/coach/clients" },
          { label: "Sessions", path: "/coach/sessions" },
          { label: "My Profile", path: "/coach/profile" },
        ],
        client: []
      };
    }

    // Client sections
    return {
      admin: [],
      coach: [],
      client: [
        { label: "Overview", section: "overview" },
        { label: "Nutrition", section: "nutrition" },
      ]
    };
  };

  const userLinks = [
    { label: "Workout Library", path: "/workout-library" },
    { label: "Account", path: "/account" }
  ];

  const mobileMenuItems = getMobileMenuItems();
  const dashboardSections = getDashboardSections();

  // Derive member status badge and tone
  const getMemberStatus = () => {
    if (!profile) return null;

    const profileStatus = profile?.status;
    const subStatus = subscription?.status;
    const serviceName = subscription?.services?.name;
    const serviceType = subscription?.services?.type;
    const hasSubscription = !!subscription;

    let label = "Status: Unknown";
    let tone: "pending" | "active" | "danger" | "info" = "info";

    if (profileStatus === "pending" && !hasSubscription) {
      label = "Pending Onboarding";
      tone = "pending";
    } else if (profileStatus === "needs_medical_review") {
      label = "Medical Review";
      tone = "pending";
    } else if (profileStatus === "pending_coach_approval") {
      label = "Pending Coach Approval";
      tone = "pending";
    } else if (profileStatus === "pending_payment") {
      label = "Pending Payment";
      tone = "pending";
    } else if (profileStatus === "active" && subStatus === "active") {
      label = serviceName ? `Active: ${serviceName}` : "Active";
      tone = "active";
    } else if (profileStatus === "inactive" || subStatus === "inactive") {
      label = "Inactive";
      tone = "danger";
    } else if (profileStatus === "cancelled" || profileStatus === "expired") {
      label = "Ended";
      tone = "danger";
    } else if (profileStatus === "suspended") {
      label = "Suspended";
      tone = "danger";
    }

    return { label, tone, serviceName, serviceType };
  };

  const memberStatus = getMemberStatus();

  // Get user roles for display
  const getRoleLabel = () => {
    if (!detectedRole) return null;
    
    const roles = [];
    if (activeRole === 'admin') roles.push('Admin');
    if (activeRole === 'coach') roles.push('Coach');
    if (roles.length === 0) roles.push('Member');
    
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
            <Link to="/" className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-gradient-to-r from-primary to-accent">
                <Dumbbell className="h-6 w-6 text-white" />
              </div>
              <span className="font-bold text-xl">Dr Iron</span>
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
                        Menu
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 bg-background z-50">
                      {roleLabel && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs">
                            Role: <span className="font-semibold text-foreground">{roleLabel}</span>
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {dashboardSections.admin.length > 0 && (
                        <>
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">Admin Pages</DropdownMenuLabel>
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
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">Coach Pages</DropdownMenuLabel>
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
                          <DropdownMenuLabel className="text-muted-foreground text-xs uppercase tracking-wider">Dashboard</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link to="/dashboard" className="cursor-pointer">
                              Dashboard
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
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button onClick={() => goToAuthOrDashboard(user)} variant="default">
                  Sign In
                </Button>
              )}
            </div>

            {/* Mobile Menu Button - Only visible on mobile */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
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
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-gradient-to-r from-primary to-accent">
                  <Dumbbell className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold">Dr Iron</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label="Close menu"
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
                      Home
                    </Link>
                    <Link
                      to="/services"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      Services
                    </Link>
                    <Link
                      to="/calorie-calculator"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Calculator className="h-5 w-5 text-muted-foreground" />
                      Calorie Calculator
                    </Link>
                    <Link
                      to="/meet-our-team"
                      className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3.5 text-base font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Users className="h-5 w-5 text-muted-foreground" />
                      Our Team
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
                          Admin
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
                          Coach
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
                          Dashboard
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
                        Workout Library
                      </Link>
                      <Link
                        to="/account"
                        className="flex items-center gap-3 text-foreground hover:bg-muted transition-colors px-5 py-3 text-sm"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Account
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
                    Go to Dashboard
                  </Button>
                  <Button onClick={handleSignOut} variant="outline" className="w-full">
                    Sign Out
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
                    Log In / Client Dashboard
                  </Button>
                  <button
                    onClick={() => {
                      navigate("/services");
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-2"
                  >
                    Become a Client
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
