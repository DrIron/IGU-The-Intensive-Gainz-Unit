/**
 * Shared Resend API wrapper for all IGU edge functions.
 *
 * Replaces the duplicated fetch('https://api.resend.com/emails', ...) pattern.
 */

interface SendEmailParams {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail({ from, to, subject, html, replyTo }: SendEmailParams): Promise<SendEmailResult> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Resend API error (${response.status}):`, errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('sendEmail error:', message);
    return { success: false, error: message };
  }
}
