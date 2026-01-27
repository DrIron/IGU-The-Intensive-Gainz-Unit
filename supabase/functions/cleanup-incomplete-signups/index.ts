import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find accounts that are:
    // 1. Status = 'pending'
    // 2. Created more than 48 hours ago
    // 3. No onboarding completion
    // 4. No subscription
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: incompleteAccounts, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('id, email, created_at')
      .eq('status', 'pending')
      .is('onboarding_completed_at', null)
      .lt('created_at', cutoffDate);

    if (fetchError) {
      console.error('Error fetching incomplete accounts:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${incompleteAccounts?.length || 0} incomplete signups to clean up`);

    const results = {
      accounts_deleted: 0,
      errors: [] as string[],
      deleted_accounts: [] as { id: string; email: string; created_at: string }[],
    };

    for (const account of incompleteAccounts || []) {
      try {
        // Verify they have no subscription
        const { data: subs } = await supabaseClient
          .from('subscriptions')
          .select('id')
          .eq('user_id', account.id);

        // Skip if they have a subscription (might have started paying)
        if (subs && subs.length > 0) {
          console.log(`Skipping ${account.email} - has subscription`);
          continue;
        }

        console.log(`Deleting incomplete signup: ${account.email} (created: ${account.created_at})`);

        // Use the delete-account function to handle all cleanup
        const { error: deleteError } = await supabaseClient.functions.invoke('delete-account', {
          body: { userId: account.id }
        });

        if (deleteError) {
          console.error(`Failed to delete ${account.email}:`, deleteError);
          results.errors.push(account.email);
        } else {
          console.log(`Successfully deleted ${account.email}`);
          results.accounts_deleted++;
          results.deleted_accounts.push({
            id: account.id,
            email: account.email,
            created_at: account.created_at,
          });
        }
      } catch (error: any) {
        console.error(`Error deleting ${account.email}:`, error);
        results.errors.push(account.email);
      }
    }

    console.log('Cleanup completed:', results);

    return new Response(
      JSON.stringify(results),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error('Error in cleanup-incomplete-signups:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Incomplete signup cleanup failed',
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
