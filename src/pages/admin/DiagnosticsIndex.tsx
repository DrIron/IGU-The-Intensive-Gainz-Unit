import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { 
  Stethoscope, 
  Map, 
  Users, 
  Mail, 
  Shield, 
  Bug, 
  Rocket,
  Dumbbell,
  ArrowRight
} from "lucide-react";

interface DiagnosticLink {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
}

const diagnosticsLinks: DiagnosticLink[] = [
  {
    title: "Site Map & Navigation Audit",
    description: "View all routes, verify navigation visibility, and audit access control",
    path: "/admin/diagnostics/site-map",
    icon: <Map className="h-5 w-5" />,
  },
  {
    title: "Client Diagnostics",
    description: "Debug client data, subscriptions, and profile issues",
    path: "/admin/client-diagnostics",
    icon: <Users className="h-5 w-5" />,
  },
  {
    title: "Email Log",
    description: "View sent emails and debug email delivery issues",
    path: "/admin/email-log",
    icon: <Mail className="h-5 w-5" />,
  },
  {
    title: "Roles Debug",
    description: "Inspect user roles, permissions, and access control",
    path: "/admin/debug/roles",
    icon: <Bug className="h-5 w-5" />,
  },
  {
    title: "Security Hardening Checklist",
    description: "Review security configuration and hardening status",
    path: "/admin/security-checklist",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    title: "Launch Test Checklist",
    description: "Pre-launch verification and testing checklist",
    path: "/admin/launch-checklist",
    icon: <Rocket className="h-5 w-5" />,
  },
  {
    title: "Workout Builder QA",
    description: "Test and debug the workout builder functionality",
    path: "/admin/workout-qa",
    icon: <Dumbbell className="h-5 w-5" />,
  },
];

export default function DiagnosticsIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="h-6 w-6" />
          Diagnostics Center
        </h1>
        <p className="text-muted-foreground">
          Debug tools, audits, and system diagnostics for administrators
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {diagnosticsLinks.map((link) => (
          <Card key={link.path} className="hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {link.icon}
                {link.title}
              </CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to={link.path}>
                  Open
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
