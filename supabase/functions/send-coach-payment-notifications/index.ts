import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { EMAIL_FROM } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { EMAIL_BRAND } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, sectionHeading, signOff, divider } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function paymentTable(breakdown: any, rates: any, totalClients: number, totalPayment: number): string {
  const rows = [
    { label: 'Team Plans', count: breakdown.team || 0, rate: rates.team },
    { label: '1:1 In-Person', count: breakdown.onetoone_inperson || 0, rate: rates.onetoone_inperson },
    { label: '1:1 Hybrid', count: breakdown.onetoone_hybrid || 0, rate: rates.onetoone_hybrid },
    { label: '1:1 Online', count: breakdown.onetoone_online || 0, rate: rates.onetoone_online },
  ];

  const bodyRows = rows.map(r => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; color: ${EMAIL_BRAND.body}; font-size: 14px;">${r.label}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; text-align: right; color: ${EMAIL_BRAND.body}; font-size: 14px;">${r.count}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; text-align: right; color: ${EMAIL_BRAND.body}; font-size: 14px;">${r.rate.toFixed(2)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; text-align: right; color: ${EMAIL_BRAND.body}; font-size: 14px;">${(r.count * r.rate).toFixed(2)}</td>
    </tr>`).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid ${EMAIL_BRAND.gray200}; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: ${EMAIL_BRAND.gray100};">
          <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Service</th>
          <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Clients</th>
          <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Rate (KWD)</th>
          <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Amount (KWD)</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr style="background-color: ${EMAIL_BRAND.gray100};">
          <td style="padding: 12px; font-weight: bold; color: ${EMAIL_BRAND.heading}; font-size: 14px;">Total</td>
          <td style="padding: 12px; text-align: right; font-weight: bold; color: ${EMAIL_BRAND.heading}; font-size: 14px;">${totalClients}</td>
          <td style="padding: 12px;"></td>
          <td style="padding: 12px; text-align: right; font-weight: bold; color: ${EMAIL_BRAND.red}; font-size: 16px;">${totalPayment.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { payment_month } = await req.json();

    if (!payment_month) {
      throw new Error('payment_month is required');
    }

    console.log('Sending payment notifications for month:', payment_month);

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

    const monthName = new Date(payment_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const emailResults = [];

    for (const payment of payments) {
      const coach = payment.coaches;
      const breakdown = payment.client_breakdown;

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

      const content = [
        greeting(coach.first_name),
        paragraph(`Here's your payment breakdown for <strong>${monthName}</strong>:`),
        paymentTable(breakdown, payment.payment_rates, payment.total_clients, payment.total_payment),
        sectionHeading('Total Payment'),
        paragraph(`<strong style="font-size: 20px; color: ${EMAIL_BRAND.red};">${payment.total_payment.toFixed(2)} KWD</strong>`),
        divider(),
        paragraph('Payment will be processed according to the payment schedule. If you have any questions, please contact the admin team.'),
        signOff(),
      ].join('');

      const html = wrapInLayout({
        content,
        preheader: `Your ${monthName} payment summary: ${payment.total_payment.toFixed(2)} KWD`,
      });

      try {
        const result = await sendEmail({
          from: EMAIL_FROM,
          to: contactInfo.email,
          subject: `Monthly Payment Summary -- ${monthName}`,
          html,
        });

        if (!result.success) {
          console.error(`Failed to send email to coach ${coach.id}:`, result.error);
          emailResults.push({ coach_id: coach.id, coach_name: `${coach.first_name} ${coach.last_name}`, success: false, error: result.error });
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

    return new Response(
      JSON.stringify({
        success: true,
        total_emails: emailResults.length,
        successful: successCount,
        failed: failCount,
        results: emailResults,
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
