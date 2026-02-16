import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { APP_BASE_URL, EMAIL_FROM } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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
        try {
          const subject = isOneToOne
            ? '[IGU] Medical review cleared -- next step: coach approval'
            : '[IGU] Medical review cleared -- next step: complete payment';

          const nextStepText = isOneToOne
            ? '<strong>Next step:</strong> Your coach will review your application. You\'ll receive another email once they accept you, then you can proceed to payment.'
            : '<strong>Next step:</strong> You can now proceed to complete your payment. You\'ll see the payment screen when you log in.';

          const content = [
            greeting(publicProfile?.first_name || 'there'),
            paragraph(`Great news! Your medical review for <strong>${serviceName}</strong> has been cleared. You're all set to continue with your application.`),
            paragraph(nextStepText),
            ctaButton('Log In to Continue', APP_BASE_URL),
            signOff(),
          ].join('');

          const html = wrapInLayout({
            content,
            preheader: `Your medical review for ${serviceName} has been cleared.`,
          });

          const result = await sendEmail({
            from: EMAIL_FROM,
            to: profile.email,
            subject,
            html,
          });

          // Log email
          await supabaseServiceRole
            .from('email_notifications')
            .insert({
              user_id: userId,
              notification_type: 'medical_review_approved',
              status: result.success ? 'sent' : 'failed',
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
        try {
          const content = [
            greeting(rejectPublic?.first_name || 'there'),
            paragraph('Thank you for your interest in IGU. After reviewing your medical information, we need to discuss some important details before proceeding.'),
            ...(rejectionReason ? [alertBox(`<strong>Reason:</strong> ${rejectionReason}`, 'warning')] : []),
            paragraph('Please reach out to us directly so we can discuss the next steps and ensure your safety and success with our program.'),
            signOff(),
          ].join('');

          const html = wrapInLayout({
            content,
            preheader: 'We need to discuss some details about your application.',
          });

          await sendEmail({
            from: EMAIL_FROM,
            to: rejectPrivate.email,
            subject: 'Application Update Required',
            html,
          });
        } catch (emailError) {
          console.error('Error sending rejection email:', emailError);
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
