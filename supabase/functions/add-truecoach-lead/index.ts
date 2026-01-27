import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrueCoachRequest {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  planName?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const truecoachApiKey = Deno.env.get('TRUECOACH_API_KEY');
    
    if (!truecoachApiKey) {
      console.error('TRUECOACH_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'TrueCoach API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, email, firstName, lastName, phone, planName }: TrueCoachRequest = await req.json();

    console.log('Adding client to TrueCoach:', { email, firstName, lastName, planName });

    // TrueCoach API endpoint - verify this with your TrueCoach account documentation
    // Common patterns are:
    // - https://api.truecoach.co/api/v1/clients
    // - https://app.truecoach.co/api/v1/clients
    const truecoachApiUrl = 'https://api.truecoach.co/api/v1/clients';

    const clientData = {
      email: email,
      first_name: firstName,
      last_name: lastName,
      phone: phone || '',
      // Add any other fields TrueCoach requires
      // tags: [planName],
      // status: 'lead',
    };

    console.log('Sending request to TrueCoach API:', truecoachApiUrl);

    const truecoachResponse = await fetch(truecoachApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${truecoachApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(clientData),
    });

    const responseText = await truecoachResponse.text();
    console.log('TrueCoach API response status:', truecoachResponse.status);
    console.log('TrueCoach API response body:', responseText);

    if (!truecoachResponse.ok) {
      throw new Error(`TrueCoach API error (${truecoachResponse.status}): ${responseText}`);
    }

    let truecoachData;
    try {
      truecoachData = JSON.parse(responseText);
    } catch (e) {
      truecoachData = { raw: responseText };
    }

    // Update the subscription record to mark client as added to TrueCoach
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ added_to_truecoach_team: true })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating subscription:', updateError);
    }

    console.log('Successfully added client to TrueCoach:', truecoachData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        truecoach_response: truecoachData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error adding client to TrueCoach:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to add client to TrueCoach. Please check the API key and endpoint configuration.'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
