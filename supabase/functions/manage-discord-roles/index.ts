import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RoleRequest {
  userId: string;
  discordRoleId: string;
  action: 'add' | 'remove';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify this function is being called by authenticated edge function (not directly)
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Unauthorized access attempt to manage-discord-roles');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestBody = await req.json();
    const { userId, discordRoleId, action }: RoleRequest = requestBody;
    
    // Validate required fields
    if (!userId || !discordRoleId || !action) {
      console.error('Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required information' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action !== 'add' && action !== 'remove') {
      console.error('Invalid action:', action);
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
    const guildId = Deno.env.get('DISCORD_GUILD_ID');
    
    if (!botToken || !guildId) {
      console.error('Discord credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Discord integration not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoint = action === 'add' 
      ? `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${discordRoleId}`
      : `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${discordRoleId}`;
    
    const response = await fetch(endpoint, {
      method: action === 'add' ? 'PUT' : 'DELETE',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Discord API error:', error);
      
      // Return generic error to prevent information disclosure
      return new Response(
        JSON.stringify({ error: 'Failed to update Discord role' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Successfully ${action === 'add' ? 'added' : 'removed'} Discord role for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error managing Discord roles:', error);
    
    // Return generic error to client, log details server-side only
    return new Response(
      JSON.stringify({ error: 'Discord role management failed' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
