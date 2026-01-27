import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkQueueAlert {
  type: 'pending_approval' | 'payment_failure' | 'legal_issue' | 'upcoming_renewal';
  clientName: string;
  clientEmail: string;
  additionalData?: any;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking work queue alerts...");

    const alerts: WorkQueueAlert[] = [];

    // Check pending approvals
    const { data: pendingProfiles } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pendingProfiles && pendingProfiles.length > 0) {
      pendingProfiles.forEach(profile => {
        alerts.push({
          type: 'pending_approval',
          clientName: `${profile.first_name} ${profile.last_name}`,
          clientEmail: profile.email,
          additionalData: {
            signupDate: new Date(profile.created_at).toLocaleDateString(),
          }
        });
      });
    }

    // Check payment failures
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: failedPayments } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        user_id,
        payment_failed_at,
        profiles!inner(first_name, last_name, email),
        services!inner(name)
      `)
      .not("payment_failed_at", "is", null)
      .gte("payment_failed_at", thirtyDaysAgo.toISOString());

    if (failedPayments && failedPayments.length > 0) {
      failedPayments.forEach((sub: any) => {
        alerts.push({
          type: 'payment_failure',
          clientName: `${sub.profiles.first_name} ${sub.profiles.last_name}`,
          clientEmail: sub.profiles.email,
          additionalData: {
            failureDate: new Date(sub.payment_failed_at).toLocaleDateString(),
            serviceName: sub.services.name,
          }
        });
      });
    }

    // Check legal issues
    const { data: legalIssues } = await supabaseAdmin
      .from("form_submissions")
      .select(`
        user_id,
        agreed_terms,
        agreed_privacy,
        agreed_refund_policy,
        agreed_intellectual_property,
        agreed_medical_disclaimer,
        profiles!inner(first_name, last_name, email)
      `)
      .or("agreed_terms.eq.false,agreed_privacy.eq.false,agreed_refund_policy.eq.false,agreed_intellectual_property.eq.false,agreed_medical_disclaimer.eq.false");

    if (legalIssues && legalIssues.length > 0) {
      legalIssues.forEach((issue: any) => {
        const missingDocs = [];
        if (!issue.agreed_terms) missingDocs.push('Terms & Conditions');
        if (!issue.agreed_privacy) missingDocs.push('Privacy Policy');
        if (!issue.agreed_refund_policy) missingDocs.push('Refund Policy');
        if (!issue.agreed_intellectual_property) missingDocs.push('Intellectual Property');
        if (!issue.agreed_medical_disclaimer) missingDocs.push('Medical Disclaimer');

        alerts.push({
          type: 'legal_issue',
          clientName: `${issue.profiles.first_name} ${issue.profiles.last_name}`,
          clientEmail: issue.profiles.email,
          additionalData: {
            missingDocuments: missingDocs,
          }
        });
      });
    }

    // Check upcoming renewals (next 7 days)
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const { data: upcomingRenewals } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        user_id,
        next_billing_date,
        profiles!inner(first_name, last_name, email),
        services!inner(name, price_kwd)
      `)
      .eq("status", "active")
      .gte("next_billing_date", today.toISOString())
      .lte("next_billing_date", sevenDaysFromNow.toISOString());

    if (upcomingRenewals && upcomingRenewals.length > 0) {
      upcomingRenewals.forEach((renewal: any) => {
        alerts.push({
          type: 'upcoming_renewal',
          clientName: `${renewal.profiles.first_name} ${renewal.profiles.last_name}`,
          clientEmail: renewal.profiles.email,
          additionalData: {
            renewalDate: new Date(renewal.next_billing_date).toLocaleDateString(),
            serviceName: renewal.services.name,
            priceKwd: renewal.services.price_kwd.toString(),
          }
        });
      });
    }

    console.log(`Found ${alerts.length} work queue alerts`);

    // Get admin emails
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found");
      return new Response(
        JSON.stringify({ message: "No alerts sent - no admin users configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const adminUserIds = adminRoles.map(r => r.user_id);
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .in("id", adminUserIds);

    const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || [];

    if (adminEmails.length === 0) {
      console.log("No admin email addresses found");
      return new Response(
        JSON.stringify({ message: "No alerts sent - no admin email addresses found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send notifications for each alert
    let sentCount = 0;
    for (const alert of alerts) {
      for (const adminEmail of adminEmails) {
        try {
          await supabaseAdmin.functions.invoke('send-admin-notifications', {
            body: {
              type: alert.type,
              adminEmail,
              data: {
                clientName: alert.clientName,
                clientEmail: alert.clientEmail,
                ...alert.additionalData,
              }
            }
          });
          sentCount++;
        } catch (error) {
          console.error(`Error sending notification to ${adminEmail}:`, error);
        }
      }
    }

    console.log(`Sent ${sentCount} notifications to ${adminEmails.length} admin(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        alertsFound: alerts.length,
        notificationsSent: sentCount,
        adminsNotified: adminEmails.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in check-work-queue-alerts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
