import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { EMAIL_FROM_COACHING } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, sectionHeading, orderedList, alertBox, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  email: string;
  name: string;
  planName: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, planName }: NotificationRequest = await req.json();

    const subject = `Welcome to ${planName} -- True Coach Setup Instructions`;
    const preheader = `Your payment has been processed. Here is how to get started with True Coach.`;

    const content = [
      greeting(name),
      paragraph('Congratulations! Your payment has been successfully processed and your account is now active.'),
      sectionHeading('Next Steps'),
      paragraph('You will be added to True Coach within the next 48 hours. Please follow these steps:'),
      orderedList([
        'Download the <strong>True Coach app</strong> from the App Store or Google Play Store',
        'Watch for an invitation email from True Coach',
        'Set up your True Coach account using the invitation',
        'Start your fitness journey!',
      ]),
      alertBox('If you have not been added to True Coach within 48 hours, please contact IGU directly.', 'warning'),
      paragraph("We're excited to have you as part of our community!"),
      signOff(),
    ].join('');

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: email,
      subject,
      html,
    });

    console.log('True Coach notification sent:', result);

    return new Response(
      JSON.stringify({ success: result.success }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending True Coach notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
