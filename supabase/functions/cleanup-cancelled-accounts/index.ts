import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const now = new Date();

    // Get all subscriptions marked for cancellation that have passed their end_date
    const { data: expiredSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, user_id, end_date')
      .eq('cancel_at_period_end', true)
      .not('end_date', 'is', null)
      .lte('end_date', now.toISOString());

    if (fetchError) {
      console.error('Error fetching expired subscriptions:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${expiredSubscriptions?.length || 0} accounts to hard delete`);

    const results = {
      accounts_deleted: 0,
      errors: [] as string[],
    };

    for (const subscription of expiredSubscriptions || []) {
      try {
        console.log(`Hard deleting account for user ${subscription.user_id}`);

        // Use delete-account function to handle all cleanup
        const { error } = await supabase.functions.invoke('delete-account', {
          body: { userId: subscription.user_id }
        });

        if (error) {
          console.error(`Failed to delete account ${subscription.user_id}:`, error);
          results.errors.push(subscription.user_id);
        } else {
          console.log(`Successfully deleted account ${subscription.user_id}`);
          results.accounts_deleted++;
        }
      } catch (error: any) {
        console.error(`Error deleting account ${subscription.user_id}:`, error);
        results.errors.push(subscription.user_id);
      }
    }

    console.log('Cleanup completed:', results);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in cleanup-cancelled-accounts:', error);
    return new Response(
      JSON.stringify({ error: 'Account cleanup failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
