import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { IguLogo } from "@/components/IguLogo";
import { WhatsAppButton } from "@/components/marketing/WhatsAppButton";
import { Footer } from "@/components/Footer";

interface PublicLayoutProps {
  children: ReactNode;
  /** If true, shows a simplified header (e.g., for auth pages) */
  minimal?: boolean;
}

const publicNavItems = [
  { path: "/", label: "Home" },
  { path: "/services", label: "Services" },
  { path: "/meet-our-team", label: "Our Team" },
  { path: "/testimonial", label: "Testimonials" },
  { path: "/calorie-calculator", label: "Calculator" },
];

/**
 * Layout for public (non-authenticated) pages.
 * Features:
 * - Centered content with max-width
 * - Top navigation bar
 * - Mobile hamburger menu
 */
export function PublicLayout({ children, minimal = false }: PublicLayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  if (minimal) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 bg-background/70 backdrop-blur-xl">
          <div className="container flex h-14 items-center justify-center">
            <Link to="/" className="hover:opacity-80 transition-opacity">
              <IguLogo height={24} variant="light" />
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <IguLogo height={28} variant="light" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {publicNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  isActive(item.path)
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Auth Buttons - Desktop */}
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth?mode=signup">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu Trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-4 mt-8">
                {publicNavItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-lg font-medium transition-colors hover:text-primary py-2 ${
                      isActive(item.path)
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
                <hr className="my-4" />
                <Button variant="outline" asChild className="w-full">
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link to="/auth?mode=signup" onClick={() => setMobileMenuOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* WhatsApp Floating Button */}
      <WhatsAppButton />

      {/* Footer */}
      <Footer />
    </div>
  );
}
