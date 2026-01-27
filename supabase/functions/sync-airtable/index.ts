import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId, status, email } = await req.json();
    
    // Map internal status to Airtable status
    let airtableStatus = status;
    if (status === 'pending') airtableStatus = 'New Lead';
    else if (status === 'needs_medical_review') airtableStatus = 'Medical Review Required';
    else if (status === 'pending_coach_approval') airtableStatus = 'Pending Coach Approval';
    else if (status === 'approved' || status === 'pending_payment') airtableStatus = 'Pending Payment';
    else if (status === 'active') airtableStatus = 'Active';
    else if (status === 'inactive') airtableStatus = 'Inactive';
    else if (status === 'cancelled') airtableStatus = 'Cancelled';
    else if (status === 'expired') airtableStatus = 'Expired';

    console.log('Syncing with Airtable:', { userId, status, email });

    const airtableApiKey = Deno.env.get('AIRTABLE_API_KEY');
    const airtableBaseId = Deno.env.get('AIRTABLE_BASE_ID');
    const airtableTableId = Deno.env.get('AIRTABLE_TABLE_ID');

    if (!airtableApiKey || !airtableBaseId || !airtableTableId) {
      console.error('Missing Airtable configuration');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing Airtable configuration' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Search for the record in Airtable by email
    const searchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableId}?filterByFormula={Email}='${email}'`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${airtableApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const searchData = await searchResponse.json();
    console.log('Airtable search response:', searchData);

    if (searchData.records && searchData.records.length > 0) {
      // Update the first matching record
      const recordId = searchData.records[0].id;
      const updateUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableId}/${recordId}`;
      
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${airtableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Status': airtableStatus,
          },
        }),
      });

      const updateData = await updateResponse.json();
      console.log('Airtable update response:', updateData);

      if (!updateResponse.ok) {
        throw new Error(`Airtable update failed: ${JSON.stringify(updateData)}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Airtable updated successfully',
          airtableRecord: updateData
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      console.log('No matching record found in Airtable for email:', email);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No matching record found in Airtable' 
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Error in sync-airtable:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
