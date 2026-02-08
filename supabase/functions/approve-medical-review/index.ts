import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { EMAIL_FROM } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, approved, rejectionReason } = await req.json();

    if (!userId || approved === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (approved) {
      // Get subscription to check service type
      const { data: subscription } = await supabaseServiceRole
        .from('subscriptions')
        .select('service_id, services!inner(type, name)')
        .eq('user_id', userId)
        .maybeSingle();

      // Determine status based on service type
      const serviceType = (subscription?.services as any)?.type || '';
      const serviceName = (subscription?.services as any)?.name || 'your program';
      const isOneToOne = serviceType.includes('one_to_one');
      const newStatus = isOneToOne ? 'pending_coach_approval' : 'pending_payment';

      // Approve - set status based on service type (write to profiles_public)
      await supabaseServiceRole
        .from('profiles_public')
        .update({ status: newStatus })
        .eq('id', userId);

      // Get user info for notification (read from profiles view or profiles_private)
      const { data: profile } = await supabaseServiceRole
        .from('profiles_private')
        .select('email')
        .eq('profile_id', userId)
        .single();
      
      // Get first_name from profiles_public
      const { data: publicProfile } = await supabaseServiceRole
        .from('profiles_public')
        .select('first_name')
        .eq('id', userId)
        .single();

      // FLOW 3: Medical review approved - send email
      if (profile?.email) {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          try {
            const subject = isOneToOne
              ? '[IGU] Medical review cleared – next step: coach approval'
              : '[IGU] Medical review cleared – next step: complete payment';
            
            const nextStepHtml = isOneToOne
              ? `
                <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                  <strong>Next step:</strong> Your coach will review your application. You'll receive another email once they accept you, then you can proceed to payment.
                </p>
              `
              : `
                <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                  <strong>Next step:</strong> You can now proceed to complete your payment. You'll see the payment screen when you log in.
                </p>
              `;

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: EMAIL_FROM,
                to: [profile.email],
                subject,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">✅ Medical Review Cleared!</h1>

                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Hi ${publicProfile?.first_name || 'there'},
                    </p>

                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Great news! Your medical review for <strong>${serviceName}</strong> has been cleared. You're all set to continue with your application.
                    </p>

                    ${nextStepHtml}

                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Log in at <a href="https://theigu.com" style="color: #667eea;">https://theigu.com</a> to check your status and proceed.
                    </p>

                    <p style="color: #666; font-size: 16px; line-height: 1.5;">
                      Best regards,<br>
                      <strong>The IGU Team</strong>
                    </p>
                  </div>
                `,
              }),
            });

            // Log email
            await supabaseServiceRole
              .from('email_notifications')
              .insert({
                user_id: userId,
                notification_type: 'medical_review_approved',
                status: 'sent',
                sent_at: new Date().toISOString()
              });
          } catch (emailError) {
            console.error('Error sending medical review approved email:', emailError);
            // Don't fail - log as failed
            await supabaseServiceRole
              .from('email_notifications')
              .insert({
                user_id: userId,
                notification_type: 'medical_review_approved',
                status: 'failed',
                sent_at: new Date().toISOString()
              });
          }
        }
      }

      console.log(`Medical review approved for user ${userId}`);
    } else {
      // Reject - set status to rejected (write to profiles_public)
      await supabaseServiceRole
        .from('profiles_public')
        .update({ status: 'rejected' })
        .eq('id', userId);

      // Remove subscription assignment
      await supabaseServiceRole
        .from('subscriptions')
        .delete()
        .eq('user_id', userId);

      // Get user info for rejection email
      const { data: rejectPrivate } = await supabaseServiceRole
        .from('profiles_private')
        .select('email')
        .eq('profile_id', userId)
        .single();
      
      const { data: rejectPublic } = await supabaseServiceRole
        .from('profiles_public')
        .select('first_name')
        .eq('id', userId)
        .single();

      if (rejectPrivate?.email) {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [rejectPrivate.email],
              subject: 'Application Update Required',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Application Status Update</h1>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Hi ${rejectPublic?.first_name || 'there'},
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Thank you for your interest in IGU. After reviewing your medical information, we need to discuss some important details before proceeding.
                  </p>
                  
                  ${rejectionReason ? `
                  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 30px 0;">
                    <p style="color: #666; font-size: 14px; margin: 0;"><strong>Reason:</strong> ${rejectionReason}</p>
                  </div>
                  ` : ''}
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Please reach out to us directly so we can discuss the next steps and ensure your safety and success with our program.
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5;">
                    Best regards,<br>
                    <strong>The IGU Team</strong>
                  </p>
                </div>
              `,
            }),
          });
        }
      }

      console.log(`Medical review rejected for user ${userId}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in approve-medical-review:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
