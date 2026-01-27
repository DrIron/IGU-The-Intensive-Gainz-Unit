import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[process-care-team-discharges] Starting daily discharge processing');

    // Use service role for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Call the database function to process discharges
    const { data, error } = await supabase.rpc('process_care_team_discharges');

    if (error) {
      console.error('[process-care-team-discharges] Error:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const processedCount = data || 0;
    console.log(`[process-care-team-discharges] Processed ${processedCount} scheduled discharges`);

    // Log summary to admin_audit_log for visibility
    if (processedCount > 0) {
      await supabase.from('admin_audit_log').insert({
        admin_user_id: '00000000-0000-0000-0000-000000000000', // System user
        action_type: 'care_team_discharge_batch',
        target_type: 'care_team_assignment',
        target_id: null,
        details: {
          processed_count: processedCount,
          processed_at: new Date().toISOString(),
          triggered_by: 'cron_job'
        }
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed_count: processedCount,
        message: `Processed ${processedCount} scheduled care team discharges`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (err) {
    console.error('[process-care-team-discharges] Unexpected error:', err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
