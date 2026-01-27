import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { payment_month } = await req.json();

    if (!payment_month) {
      throw new Error('payment_month is required');
    }

    console.log('Sending payment notifications for month:', payment_month);

    // Get all payments for this month with coach basic info
    const { data: payments, error: paymentsError } = await supabase
      .from('monthly_coach_payments')
      .select('*, coaches(id, first_name, last_name, user_id)')
      .eq('payment_month', payment_month);

    if (paymentsError) throw paymentsError;

    if (!payments || payments.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No payments found for this month' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResults = [];

    for (const payment of payments) {
      const coach = payment.coaches;
      const breakdown = payment.client_breakdown;
      
      // Fetch coach email from coaches_private table (server-side access)
      const { data: contactInfo, error: contactError } = await supabase
        .from('coaches_private')
        .select('email')
        .eq('coach_public_id', coach.id)
        .maybeSingle();

      if (contactError || !contactInfo?.email) {
        console.error(`No email found for coach ${coach.id}:`, contactError);
        emailResults.push({ coach_id: coach.id, coach_name: `${coach.first_name} ${coach.last_name}`, success: false, error: 'No email found' });
        continue;
      }

      const coachEmail = contactInfo.email;
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Monthly Payment Summary</h1>
          <p>Hello ${coach.first_name},</p>
          
          <p>Your payment breakdown for <strong>${new Date(payment_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f4f4f4;">
                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Service Type</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Clients</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Rate (KWD)</th>
                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Amount (KWD)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">Team Plans</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${breakdown.team || 0}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${payment.payment_rates.team.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${((breakdown.team || 0) * payment.payment_rates.team).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">1:1 In-Person</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${breakdown.onetoone_inperson || 0}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${payment.payment_rates.onetoone_inperson.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${((breakdown.onetoone_inperson || 0) * payment.payment_rates.onetoone_inperson).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">1:1 Hybrid</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${breakdown.onetoone_hybrid || 0}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${payment.payment_rates.onetoone_hybrid.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${((breakdown.onetoone_hybrid || 0) * payment.payment_rates.onetoone_hybrid).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">1:1 Online</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${breakdown.onetoone_online || 0}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${payment.payment_rates.onetoone_online.toFixed(2)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${((breakdown.onetoone_online || 0) * payment.payment_rates.onetoone_online).toFixed(2)}</td>
              </tr>
              <tr style="background-color: #f9f9f9; font-weight: bold;">
                <td style="padding: 12px; border: 1px solid #ddd;">Total</td>
                <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${payment.total_clients}</td>
                <td style="padding: 12px; border: 1px solid #ddd;"></td>
                <td style="padding: 12px; text-align: right; border: 1px solid #ddd;">${payment.total_payment.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <p style="margin-top: 30px;">
            <strong>Total Payment: ${payment.total_payment.toFixed(2)} KWD</strong>
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Payment will be processed according to the payment schedule. If you have any questions, please contact the admin team.
          </p>
          
          <p style="color: #666; font-size: 12px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px;">
            This is an automated email. Please do not reply directly to this message.
          </p>
        </div>
      `;

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Dr Iron <noreply@mail.theigu.com>',
            to: [coachEmail],
            subject: `Monthly Payment Summary - ${new Date(payment_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const error = await emailResponse.text();
          console.error(`Failed to send email to coach ${coach.id}:`, error);
          emailResults.push({ coach_id: coach.id, coach_name: `${coach.first_name} ${coach.last_name}`, success: false, error });
        } else {
          console.log(`Email sent successfully to coach ${coach.id}`);
          emailResults.push({ coach_id: coach.id, coach_name: `${coach.first_name} ${coach.last_name}`, success: true });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error sending email to coach ${coach.id}:`, error);
        emailResults.push({ coach_id: coach.id, coach_name: `${coach.first_name} ${coach.last_name}`, success: false, error: errorMessage });
      }
    }

    const successCount = emailResults.filter(r => r.success).length;
    const failCount = emailResults.filter(r => !r.success).length;

    // Return success but do NOT include email addresses in response
    return new Response(
      JSON.stringify({
        success: true,
        total_emails: emailResults.length,
        successful: successCount,
        failed: failCount,
        results: emailResults, // Only includes coach_id, coach_name, success, error - no email
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending payment notifications:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
