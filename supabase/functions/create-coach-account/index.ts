import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const urlSchema = z.string().url().max(500).optional().or(z.literal(''));

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  first_name: z.string().min(1).max(50).trim(),
  last_name: z.string().min(1).max(50).trim(),
  date_of_birth: z.string().nullable().optional(),
  location: z.string().max(100).trim().optional(),
  nickname: z.string().max(50).trim().optional(),
  instagram_url: urlSchema,
  tiktok_url: urlSchema,
  snapchat_url: urlSchema,
  youtube_url: urlSchema,
  // Additional fields for coach applications
  applicationId: z.string().uuid().optional(),
  certifications: z.array(z.string().min(1).max(200)).max(20).optional(), // Max 20 certs, 200 chars each
  specializations: z.array(z.string().min(1).max(100)).max(15).optional(), // Max 15 specs, 100 chars each
  phoneNumber: z.string().max(20).trim().nullable().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const body = await req.json();
    const validated = requestSchema.parse(body);
    const { 
      email, first_name, last_name, date_of_birth, location, nickname, 
      instagram_url, tiktok_url, snapchat_url, youtube_url,
      applicationId, certifications, specializations, phoneNumber 
    } = validated;

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      
      // SECURITY: Check if user already has admin role - preserve it!
      const { data: existingRoles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      const hasAdminRole = existingRoles?.some(r => r.role === 'admin');
      
      if (hasAdminRole) {
        console.log('User has admin role - preserving it');
        // Don't delete roles, just add coach role via upsert
      } else {
        // Safe to manage roles for non-admin users
        // Use upsert instead of delete to avoid race conditions
      }
      
    } else {
      // Create new auth user without password - they'll set it via recovery link
      const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          first_name,
          last_name,
        }
      });

      if (authError) throw authError;
      if (!newUser.user) throw new Error('Failed to create user');
      
      userId = newUser.user.id;
      isNewUser = true;
    }

    // Add coach role (using upsert to avoid conflicts)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: 'coach',
      }, {
        onConflict: 'user_id,role'
      });

    if (roleError) throw roleError;

    // Create profiles_legacy row first to satisfy FK constraint on coaches table
    const { error: profilesLegacyError } = await supabaseAdmin
      .from('profiles_legacy')
      .upsert({
        id: userId,
        email,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        date_of_birth: date_of_birth ?? null,
        status: 'active',
      }, {
        onConflict: 'id',
      });

    if (profilesLegacyError) {
      console.error('Error upserting profiles_legacy:', profilesLegacyError);
      throw profilesLegacyError;
    }

    // Check if coach profile already exists
    const { data: existingCoach } = await supabaseAdmin
      .from('coaches')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    let coachData;

    if (existingCoach) {
      // Update existing coach profile - public fields only
      const updateData: any = {
        first_name,
        last_name,
        location,
        status: applicationId ? 'active' : 'pending',
        nickname,
      };

      // Add optional fields if provided
      if (certifications) updateData.qualifications = certifications;
      if (specializations) updateData.specializations = specializations;

      const { data, error: updateError } = await supabaseAdmin
        .from('coaches')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) throw updateError;
      coachData = data;
    } else {
      // Create new coach profile - public fields only
      const insertData: any = {
        user_id: userId,
        first_name,
        last_name,
        location,
        status: applicationId ? 'active' : 'pending',
        nickname,
      };

      // Add optional fields if provided
      if (certifications) insertData.qualifications = certifications;
      if (specializations) insertData.specializations = specializations;

      const { data, error: insertError } = await supabaseAdmin
        .from('coaches')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;
      coachData = data;
    }

    // Create or update coaches_private record with all sensitive/private data
    const contactData: any = {
      coach_public_id: coachData.id,
      user_id: userId,
      email: email,
      date_of_birth: date_of_birth ?? null,
      instagram_url: instagram_url ?? null,
      tiktok_url: tiktok_url ?? null,
      snapchat_url: snapchat_url ?? null,
      youtube_url: youtube_url ?? null,
    };
    if (phoneNumber) contactData.whatsapp_number = phoneNumber;

    const { error: contactError } = await supabaseAdmin
      .from('coaches_private')
      .upsert(contactData, {
        onConflict: 'coach_public_id',
      });

    if (contactError) {
      console.error('Error upserting coaches_private:', contactError);
      // Don't fail the whole operation - contacts table might not be ready
    }

    let passwordResetLink = null;
    try {
      const redirectTo = `https://theigu.com/coach-password-setup?coach_id=${coachData.id}`;
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkError) throw linkError;
      passwordResetLink = linkData?.properties?.action_link || null;
      console.log('Generated password reset link with redirect to:', redirectTo);
    } catch (linkError) {
      console.error('Error generating password reset link:', linkError);
    }

    // Send invitation email
    try {
      const { data: emailData, error: emailError } = await supabaseAdmin.functions.invoke('send-coach-invitation', {
        body: {
          coachId: coachData.id,
          coachEmail: email,
          coachName: `${first_name} ${last_name}`,
          isNewUser: isNewUser,
          coachStatus: coachData.status,
          passwordResetLink: passwordResetLink,
        },
      });
      if (emailError) {
        console.error('Error from send-coach-invitation:', emailError);
      } else {
        console.log('Invitation email sent successfully:', JSON.stringify(emailData));
      }
    } catch (emailError) {
      console.error('Exception sending invitation email:', emailError);
      // Don't fail the whole operation if email fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        coach: coachData,
        message: existingUser ? 'Coach account updated successfully' : 'Coach account created successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error creating coach:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Failed to create coach account" }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});