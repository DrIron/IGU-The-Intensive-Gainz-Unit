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
    const { email, planType = 'Standard Plan', fullName = 'Test Client' } = await req.json();

    console.log('Fetching Airtable schema');

    const airtableApiKey = Deno.env.get('AIRTABLE_API_KEY');
    const airtableBaseId = Deno.env.get('AIRTABLE_BASE_ID');
    const airtableTableId = Deno.env.get('AIRTABLE_TABLE_ID');

    if (!airtableApiKey || !airtableBaseId || !airtableTableId) {
      throw new Error('Missing Airtable configuration');
    }

    // Fetch the table schema to see all fields
    const schemaUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`;
    const schemaResponse = await fetch(schemaUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${airtableApiKey}`,
      },
    });

    const schemaData = await schemaResponse.json();
    console.log('Airtable schema:', JSON.stringify(schemaData, null, 2));

    // Also fetch existing records to see the data structure
    const recordsUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableId}?maxRecords=3`;
    const recordsResponse = await fetch(recordsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${airtableApiKey}`,
      },
    });

    const recordsData = await recordsResponse.json();
    console.log('Sample records:', JSON.stringify(recordsData, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Airtable schema fetched successfully',
        schema: schemaData,
        sampleRecords: recordsData
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in create-airtable-client:', error);
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
