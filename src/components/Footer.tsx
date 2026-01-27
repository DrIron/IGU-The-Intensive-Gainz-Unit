import { useState } from "react";
import { Link } from "react-router-dom";
import { Instagram, Youtube, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachApplicationForm } from "@/components/CoachApplicationForm";

export function Footer() {
  const [showCoachApplication, setShowCoachApplication] = useState(false);

  return (
    <>
      <footer className="bg-card border-t mt-20 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* About Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">About IGU</h3>
              <p className="text-sm text-muted-foreground">
                Intensive Gainz Unit (IGU) is a multidisciplinary coaching and education brand under Dr. Iron International Sports Consultancy. Led by Dr. Hasan Dashti, we integrate medicine, science, and performance to deliver evidence-based training and nutrition systems.
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/services" className="text-muted-foreground hover:text-foreground transition-colors">
                    Our Programs
                  </Link>
                </li>
                <li>
                  <Link to="/team" className="text-muted-foreground hover:text-foreground transition-colors">
                    Meet Our Team
                  </Link>
                </li>
                <li>
                  <Link to="/calculator" className="text-muted-foreground hover:text-foreground transition-colors">
                    Calorie Calculator
                  </Link>
                </li>
                <li>
                  <Link to="/testimonials" className="text-muted-foreground hover:text-foreground transition-colors">
                    Client Success Stories
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact & Social */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Connect With Us</h3>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <strong>Email:</strong>{" "}
                  <a 
                    href="mailto:Dr.Ironofficial@gmail.com" 
                    className="hover:text-foreground transition-colors"
                  >
                    Dr.Ironofficial@gmail.com
                  </a>
                </p>
                
                <div className="flex gap-4 pt-2">
                  <a
                    href="https://www.instagram.com/dr.irontraining/?hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-6 w-6" />
                  </a>
                  <a
                    href="https://www.tiktok.com/@dr.irontraining?lang=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="TikTok"
                  >
                    <Music2 className="h-6 w-6" />
                  </a>
                  <a
                    href="https://www.youtube.com/@dr.irontraining"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                    aria-label="YouTube"
                  >
                    <Youtube className="h-6 w-6" />
                  </a>
                </div>
              </div>
            </div>

            {/* Join Our Team */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Join Our Team</h3>
              <p className="text-sm text-muted-foreground">
                Are you a passionate fitness professional? Apply to become an IGU coach and help elevate coaching standards.
              </p>
              <Button 
                onClick={() => setShowCoachApplication(true)}
                className="w-full"
              >
                Apply as Coach
              </Button>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Newsletter coming soon! Stay tuned for updates.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} Dr. Iron International Sports Consultancy (شركة دكتور آيرون العالمية للاستشارات الرياضية). All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <CoachApplicationForm 
        open={showCoachApplication}
        onOpenChange={setShowCoachApplication}
      />
    </>
  );
}
