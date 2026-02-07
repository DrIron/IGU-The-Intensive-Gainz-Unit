export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addon_catalog: {
        Row: {
          created_at: string
          default_name: string
          default_payout_kwd: number
          default_price_kwd: number
          id: string
          is_active: boolean
          specialty: Database["public"]["Enums"]["staff_specialty"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_name: string
          default_payout_kwd?: number
          default_price_kwd?: number
          id?: string
          is_active?: boolean
          specialty: Database["public"]["Enums"]["staff_specialty"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_name?: string
          default_payout_kwd?: number
          default_price_kwd?: number
          id?: string
          is_active?: boolean
          specialty?: Database["public"]["Enums"]["staff_specialty"]
          updated_at?: string
        }
        Relationships: []
      }
      addon_payout_rules: {
        Row: {
          addon_id: string
          id: string
          payout_recipient_role: Database["public"]["Enums"]["payout_recipient"]
          payout_type: Database["public"]["Enums"]["payout_type"]
          payout_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          addon_id: string
          id?: string
          payout_recipient_role?: Database["public"]["Enums"]["payout_recipient"]
          payout_type?: Database["public"]["Enums"]["payout_type"]
          payout_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          addon_id?: string
          id?: string
          payout_recipient_role?: Database["public"]["Enums"]["payout_recipient"]
          payout_type?: Database["public"]["Enums"]["payout_type"]
          payout_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_payout_rules_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: true
            referencedRelation: "addon_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_pricing: {
        Row: {
          allowed_plan_types: string[] | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_billable: boolean
          name: string
          price_kwd: number
          updated_at: string
        }
        Insert: {
          allowed_plan_types?: string[] | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_billable?: boolean
          name: string
          price_kwd?: number
          updated_at?: string
        }
        Update: {
          allowed_plan_types?: string[] | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_billable?: boolean
          name?: string
          price_kwd?: number
          updated_at?: string
        }
        Relationships: []
      }
      adherence_logs: {
        Row: {
          created_at: string
          followed_calories: boolean
          id: string
          phase_id: string
          tracked_accurately: boolean
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          followed_calories: boolean
          id?: string
          phase_id: string
          tracked_accurately: boolean
          user_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          followed_calories?: boolean
          id?: string
          phase_id?: string
          tracked_accurately?: boolean
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "adherence_logs_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          admin_user_id: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      approval_audit_log: {
        Row: {
          action_type: string
          actor_role: string
          actor_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_status: string | null
          previous_status: string | null
          reason: string | null
          target_subscription_id: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_role: string
          actor_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          target_subscription_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_role?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          target_subscription_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      body_fat_logs: {
        Row: {
          body_fat_percentage: number
          created_at: string
          fat_free_mass_kg: number | null
          id: string
          log_date: string
          method: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_fat_percentage: number
          created_at?: string
          fat_free_mass_kg?: number | null
          id?: string
          log_date: string
          method: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_fat_percentage?: number
          created_at?: string
          fat_free_mass_kg?: number | null
          id?: string
          log_date?: string
          method?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      care_team_assignments: {
        Row: {
          active_from: string
          active_until: string | null
          added_at: string
          added_by: string | null
          addon_id: string | null
          client_id: string
          created_at: string
          end_notes: string | null
          end_reason_code:
            | Database["public"]["Enums"]["care_team_end_reason"]
            | null
          ended_by: string | null
          id: string
          is_billable: boolean
          lifecycle_status: Database["public"]["Enums"]["care_team_status"]
          notes: string | null
          removed_at: string | null
          scope: string
          specialty: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          active_from?: string
          active_until?: string | null
          added_at?: string
          added_by?: string | null
          addon_id?: string | null
          client_id: string
          created_at?: string
          end_notes?: string | null
          end_reason_code?:
            | Database["public"]["Enums"]["care_team_end_reason"]
            | null
          ended_by?: string | null
          id?: string
          is_billable?: boolean
          lifecycle_status?: Database["public"]["Enums"]["care_team_status"]
          notes?: string | null
          removed_at?: string | null
          scope?: string
          specialty: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          active_from?: string
          active_until?: string | null
          added_at?: string
          added_by?: string | null
          addon_id?: string | null
          client_id?: string
          created_at?: string
          end_notes?: string | null
          end_reason_code?:
            | Database["public"]["Enums"]["care_team_end_reason"]
            | null
          ended_by?: string | null
          id?: string
          is_billable?: boolean
          lifecycle_status?: Database["public"]["Enums"]["care_team_status"]
          notes?: string | null
          removed_at?: string | null
          scope?: string
          specialty?: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_team_assignments_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "subscription_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_client_profiles_public_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_client_profiles_public_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_staff_profiles_public_fk"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_staff_profiles_public_fk"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_team_assignments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_team_messages: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_resolved: boolean
          mentions: string[] | null
          message: string
          message_type: string
          priority: string
          read_by: string[] | null
          related_phase_id: string | null
          related_program_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          mentions?: string[] | null
          message: string
          message_type?: string
          priority?: string
          read_by?: string[] | null
          related_phase_id?: string | null
          related_program_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          mentions?: string[] | null
          message?: string
          message_type?: string
          priority?: string
          read_by?: string[] | null
          related_phase_id?: string | null
          related_program_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_team_messages_related_phase_id_fkey"
            columns: ["related_phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      circumference_logs: {
        Row: {
          chest_cm: number | null
          created_at: string
          hips_cm: number | null
          id: string
          log_date: string
          phase_id: string
          thighs_cm: number | null
          user_id: string
          waist_cm: number | null
          week_number: number
        }
        Insert: {
          chest_cm?: number | null
          created_at?: string
          hips_cm?: number | null
          id?: string
          log_date: string
          phase_id: string
          thighs_cm?: number | null
          user_id: string
          waist_cm?: number | null
          week_number: number
        }
        Update: {
          chest_cm?: number | null
          created_at?: string
          hips_cm?: number | null
          id?: string
          log_date?: string
          phase_id?: string
          thighs_cm?: number | null
          user_id?: string
          waist_cm?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "circumference_logs_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      client_care_team: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          notes: string | null
          staff_role: Database["public"]["Enums"]["care_team_role"]
          staff_user_id: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          staff_role?: Database["public"]["Enums"]["care_team_role"]
          staff_user_id: string
          subscription_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          staff_role?: Database["public"]["Enums"]["care_team_role"]
          staff_user_id?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_care_team_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_care_team_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_care_team_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_care_team_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      client_coach_notes: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string | null
          flags: Json | null
          id: string
          injury_summary: string | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string | null
          flags?: Json | null
          id?: string
          injury_summary?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string | null
          flags?: Json | null
          id?: string
          injury_summary?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_coach_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_coach_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      client_day_modules: {
        Row: {
          client_program_day_id: string
          completed_at: string | null
          created_at: string
          id: string
          module_owner_coach_id: string
          module_type: string
          session_timing: string | null
          session_type: string | null
          sort_order: number
          source_day_module_id: string | null
          status: Database["public"]["Enums"]["client_module_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_program_day_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_owner_coach_id: string
          module_type: string
          session_timing?: string | null
          session_type?: string | null
          sort_order?: number
          source_day_module_id?: string | null
          status?: Database["public"]["Enums"]["client_module_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_program_day_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_owner_coach_id?: string
          module_type?: string
          session_timing?: string | null
          session_type?: string | null
          sort_order?: number
          source_day_module_id?: string | null
          status?: Database["public"]["Enums"]["client_module_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_day_modules_client_program_day_id_fkey"
            columns: ["client_program_day_id"]
            isOneToOne: false
            referencedRelation: "client_program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_day_modules_module_owner_coach_id_fkey"
            columns: ["module_owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_day_modules_module_owner_coach_id_fkey"
            columns: ["module_owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_day_modules_source_day_module_id_fkey"
            columns: ["source_day_module_id"]
            isOneToOne: false
            referencedRelation: "day_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      client_module_exercises: {
        Row: {
          client_day_module_id: string
          created_at: string
          exercise_id: string
          id: string
          instructions: string | null
          prescription_snapshot_json: Json
          section: Database["public"]["Enums"]["exercise_section"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          client_day_module_id: string
          created_at?: string
          exercise_id: string
          id?: string
          instructions?: string | null
          prescription_snapshot_json?: Json
          section?: Database["public"]["Enums"]["exercise_section"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          client_day_module_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          instructions?: string | null
          prescription_snapshot_json?: Json
          section?: Database["public"]["Enums"]["exercise_section"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_module_exercises_client_day_module_id_fkey"
            columns: ["client_day_module_id"]
            isOneToOne: false
            referencedRelation: "client_day_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_module_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      client_program_days: {
        Row: {
          client_program_id: string
          created_at: string
          date: string
          day_index: number
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_program_id: string
          created_at?: string
          date: string
          day_index: number
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_program_id?: string
          created_at?: string
          date?: string
          day_index?: number
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_program_days_client_program_id_fkey"
            columns: ["client_program_id"]
            isOneToOne: false
            referencedRelation: "client_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_programs: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          primary_coach_id: string
          source_template_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["client_program_status"]
          subscription_id: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          primary_coach_id: string
          source_template_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["client_program_status"]
          subscription_id: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          primary_coach_id?: string
          source_template_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["client_program_status"]
          subscription_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_programs_primary_coach_id_fkey"
            columns: ["primary_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_programs_primary_coach_id_fkey"
            columns: ["primary_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "client_programs_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "program_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_programs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_programs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_programs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_applications: {
        Row: {
          certifications: string[] | null
          created_at: string
          date_of_birth: string
          email: string
          first_name: string
          gender: string | null
          id: string
          last_name: string
          motivation: string | null
          notes: string | null
          phone_number: string | null
          resume_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          specializations: string[] | null
          status: string
          years_of_experience: number | null
        }
        Insert: {
          certifications?: string[] | null
          created_at?: string
          date_of_birth: string
          email: string
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          motivation?: string | null
          notes?: string | null
          phone_number?: string | null
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specializations?: string[] | null
          status?: string
          years_of_experience?: number | null
        }
        Update: {
          certifications?: string[] | null
          created_at?: string
          date_of_birth?: string
          email?: string
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          motivation?: string | null
          notes?: string | null
          phone_number?: string | null
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          specializations?: string[] | null
          status?: string
          years_of_experience?: number | null
        }
        Relationships: []
      }
      coach_change_requests: {
        Row: {
          created_at: string
          current_coach_id: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          requested_coach_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_coach_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_coach_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_coach_id?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_coach_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_change_requests_current_coach_id_fkey"
            columns: ["current_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_current_coach_id_fkey"
            columns: ["current_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_requested_coach_id_fkey"
            columns: ["requested_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_requested_coach_id_fkey"
            columns: ["requested_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_change_requests_user_id_profiles_public_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_change_requests_user_id_profiles_public_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_client_relationships: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          ended_at: string | null
          id: string
          role: string
          started_at: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          role: string
          started_at?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          role?: string
          started_at?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_client_relationships_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_client_relationships_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_client_relationships_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_client_profiles_public"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_client_profiles_public"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_column_presets: {
        Row: {
          coach_id: string
          column_config: Json
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          column_config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          column_config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_column_presets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coach_column_presets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
        ]
      }
      coach_nutrition_notes: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          is_reminder: boolean
          note_text: string
          phase_id: string
          reminder_date: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          is_reminder?: boolean
          note_text: string
          phase_id: string
          reminder_date?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          is_reminder?: boolean
          note_text?: string
          phase_id?: string
          reminder_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_nutrition_notes_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_payment_history: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_data: Json
          total_clients: number
          total_coaches: number
          total_payment: number
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_data: Json
          total_clients: number
          total_coaches: number
          total_payment: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_data?: Json
          total_clients?: number
          total_coaches?: number
          total_payment?: number
          updated_at?: string
        }
        Relationships: []
      }
      coach_payment_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          onetoone_hybrid_rate: number
          onetoone_inperson_rate: number
          onetoone_online_rate: number
          team_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          onetoone_hybrid_rate?: number
          onetoone_inperson_rate?: number
          onetoone_online_rate?: number
          team_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          onetoone_hybrid_rate?: number
          onetoone_inperson_rate?: number
          onetoone_online_rate?: number
          team_rate?: number
        }
        Relationships: []
      }
      coach_service_limits: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          max_clients: number
          service_id: string
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          max_clients?: number
          service_id: string
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          max_clients?: number
          service_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_service_limits_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_service_limits_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_service_limits_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_time_slots: {
        Row: {
          coach_id: string
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          notes: string | null
          slot_end: string
          slot_start: string
          slot_type: string
          status: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          slot_end: string
          slot_start: string
          slot_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          slot_end?: string
          slot_start?: string
          slot_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_time_slots_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_time_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          age: number | null
          bio: string | null
          created_at: string | null
          first_name: string
          gender: string | null
          id: string
          last_assigned_at: string | null
          last_name: string | null
          location: string | null
          max_onetoone_clients: number | null
          max_team_clients: number | null
          nickname: string | null
          profile_picture_url: string | null
          qualifications: string[] | null
          short_bio: string | null
          specializations: string[] | null
          specialties: Database["public"]["Enums"]["staff_specialty"][] | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          bio?: string | null
          created_at?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_assigned_at?: string | null
          last_name?: string | null
          location?: string | null
          max_onetoone_clients?: number | null
          max_team_clients?: number | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          bio?: string | null
          created_at?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_assigned_at?: string | null
          last_name?: string | null
          location?: string | null
          max_onetoone_clients?: number | null
          max_team_clients?: number | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches_private: {
        Row: {
          coach_public_id: string
          created_at: string | null
          date_of_birth: string | null
          email: string
          gender: string | null
          id: string
          instagram_url: string | null
          phone: string | null
          snapchat_url: string | null
          tiktok_url: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
          youtube_url: string | null
        }
        Insert: {
          coach_public_id: string
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          gender?: string | null
          id?: string
          instagram_url?: string | null
          phone?: string | null
          snapchat_url?: string | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
          youtube_url?: string | null
        }
        Update: {
          coach_public_id?: string
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          gender?: string | null
          id?: string
          instagram_url?: string | null
          phone?: string | null
          snapchat_url?: string | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_contacts_coach_id_fkey"
            columns: ["coach_public_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_contacts_coach_id_fkey"
            columns: ["coach_public_id"]
            isOneToOne: true
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches_public: {
        Row: {
          bio: string | null
          created_at: string | null
          display_name: string | null
          first_name: string
          id: string
          instagram_url: string | null
          last_assigned_at: string | null
          last_name: string | null
          location: string | null
          max_onetoone_clients: number | null
          max_team_clients: number | null
          nickname: string | null
          profile_picture_url: string | null
          qualifications: string[] | null
          short_bio: string | null
          specializations: string[] | null
          specialties: Database["public"]["Enums"]["staff_specialty"][] | null
          status: string
          tiktok_url: string | null
          updated_at: string | null
          user_id: string
          youtube_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name: string
          id: string
          instagram_url?: string | null
          last_assigned_at?: string | null
          last_name?: string | null
          location?: string | null
          max_onetoone_clients?: number | null
          max_team_clients?: number | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string | null
          user_id: string
          youtube_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string
          id?: string
          instagram_url?: string | null
          last_assigned_at?: string | null
          last_name?: string | null
          location?: string | null
          max_onetoone_clients?: number | null
          max_team_clients?: number | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      day_modules: {
        Row: {
          created_at: string
          id: string
          module_owner_coach_id: string
          module_type: string
          program_template_day_id: string
          session_timing: string | null
          session_type: string | null
          sort_order: number
          status: Database["public"]["Enums"]["module_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_owner_coach_id: string
          module_type: string
          program_template_day_id: string
          session_timing?: string | null
          session_type?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["module_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module_owner_coach_id?: string
          module_type?: string
          program_template_day_id?: string
          session_timing?: string | null
          session_type?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["module_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_modules_module_owner_coach_id_fkey"
            columns: ["module_owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "day_modules_module_owner_coach_id_fkey"
            columns: ["module_owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "day_modules_program_template_day_id_fkey"
            columns: ["program_template_day_id"]
            isOneToOne: false
            referencedRelation: "program_template_days"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_breaks: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          approved_at: string | null
          approved_by: string | null
          client_feedback: string | null
          coach_notes: string | null
          created_at: string
          id: string
          initiated_by: string | null
          maintenance_calories: number | null
          maintenance_carb_g: number | null
          maintenance_fat_g: number | null
          maintenance_protein_g: number | null
          phase_id: string
          post_break_weight_kg: number | null
          pre_break_avg_intake: number | null
          pre_break_weight_change_rate: number | null
          pre_break_weight_kg: number | null
          reason: string | null
          scheduled_end_date: string
          scheduled_start_date: string
          status: string
          updated_at: string
          weight_change_during_break_kg: number | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_feedback?: string | null
          coach_notes?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          maintenance_calories?: number | null
          maintenance_carb_g?: number | null
          maintenance_fat_g?: number | null
          maintenance_protein_g?: number | null
          phase_id: string
          post_break_weight_kg?: number | null
          pre_break_avg_intake?: number | null
          pre_break_weight_change_rate?: number | null
          pre_break_weight_kg?: number | null
          reason?: string | null
          scheduled_end_date: string
          scheduled_start_date: string
          status?: string
          updated_at?: string
          weight_change_during_break_kg?: number | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_feedback?: string | null
          coach_notes?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          maintenance_calories?: number | null
          maintenance_carb_g?: number | null
          maintenance_fat_g?: number | null
          maintenance_protein_g?: number | null
          phase_id?: string
          post_break_weight_kg?: number | null
          pre_break_avg_intake?: number | null
          pre_break_weight_change_rate?: number | null
          pre_break_weight_kg?: number | null
          reason?: string | null
          scheduled_end_date?: string
          scheduled_start_date?: string
          status?: string
          updated_at?: string
          weight_change_during_break_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diet_breaks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      dietitians: {
        Row: {
          accepting_clients: boolean
          bio: string | null
          certifications: string[] | null
          created_at: string
          id: string
          license_expiry: string | null
          license_number: string | null
          license_state: string | null
          max_clients: number | null
          nutrition_specialties: string[] | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          accepting_clients?: boolean
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          license_state?: string | null
          max_clients?: number | null
          nutrition_specialties?: string[] | null
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          accepting_clients?: boolean
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          license_state?: string | null
          max_clients?: number | null
          nutrition_specialties?: string[] | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      direct_calendar_sessions: {
        Row: {
          client_user_id: string
          coach_user_id: string
          created_at: string
          id: string
          notes: string | null
          session_date: string
          session_timing: string
          session_type: string
          status: string
          subscription_id: string
          title: string
          updated_at: string
        }
        Insert: {
          client_user_id: string
          coach_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          session_date: string
          session_timing?: string
          session_type?: string
          status?: string
          subscription_id: string
          title: string
          updated_at?: string
        }
        Update: {
          client_user_id?: string
          coach_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          session_date?: string
          session_timing?: string
          session_type?: string
          status?: string
          subscription_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_calendar_sessions_coach_user_id_fkey"
            columns: ["coach_user_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "direct_calendar_sessions_coach_user_id_fkey"
            columns: ["coach_user_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "direct_calendar_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_session_exercises: {
        Row: {
          column_config: Json
          created_at: string
          direct_session_id: string
          exercise_id: string
          id: string
          instructions: string | null
          prescription_json: Json
          section: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          column_config?: Json
          created_at?: string
          direct_session_id: string
          exercise_id: string
          id?: string
          instructions?: string | null
          prescription_json?: Json
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          column_config?: Json
          created_at?: string
          direct_session_id?: string
          exercise_id?: string
          id?: string
          instructions?: string | null
          prescription_json?: Json
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_session_exercises_direct_session_id_fkey"
            columns: ["direct_session_id"]
            isOneToOne: false
            referencedRelation: "direct_calendar_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_code_grants: {
        Row: {
          allowed_uses: number
          code_id: string
          created_at: string
          email: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          user_id: string | null
          uses_count: number
        }
        Insert: {
          allowed_uses?: number
          code_id: string
          created_at?: string
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string | null
          uses_count?: number
        }
        Update: {
          allowed_uses?: number
          code_id?: string
          created_at?: string
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_code_grants_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          applies_to: Database["public"]["Enums"]["discount_applies_to"]
          code: string
          code_hash: string
          code_prefix: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          duration_cycles: number | null
          duration_type: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_cycles: number | null
          max_redemptions: number | null
          min_price_kwd: number | null
          per_user_limit: number | null
          service_id: string | null
          starts_at: string | null
          updated_at: string | null
        }
        Insert: {
          applies_to: Database["public"]["Enums"]["discount_applies_to"]
          code: string
          code_hash: string
          code_prefix?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          duration_cycles?: number | null
          duration_type?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_cycles?: number | null
          max_redemptions?: number | null
          min_price_kwd?: number | null
          per_user_limit?: number | null
          service_id?: string | null
          starts_at?: string | null
          updated_at?: string | null
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["discount_applies_to"]
          code?: string
          code_hash?: string
          code_prefix?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          duration_cycles?: number | null
          duration_type?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_cycles?: number | null
          max_redemptions?: number | null
          min_price_kwd?: number | null
          per_user_limit?: number | null
          service_id?: string | null
          starts_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_redemptions: {
        Row: {
          amount_after_kwd: number
          amount_before_kwd: number
          created_at: string
          cycle_number: number
          cycles_applied: number
          cycles_remaining: number | null
          discount_code_id: string
          first_applied_at: string | null
          id: string
          last_applied_at: string | null
          status: string
          subscription_id: string
          total_saved_kwd: number
          user_id: string
        }
        Insert: {
          amount_after_kwd: number
          amount_before_kwd: number
          created_at?: string
          cycle_number: number
          cycles_applied?: number
          cycles_remaining?: number | null
          discount_code_id: string
          first_applied_at?: string | null
          id?: string
          last_applied_at?: string | null
          status?: string
          subscription_id: string
          total_saved_kwd?: number
          user_id: string
        }
        Update: {
          amount_after_kwd?: number
          amount_before_kwd?: number
          created_at?: string
          cycle_number?: number
          cycles_applied?: number
          cycles_remaining?: number | null
          discount_code_id?: string
          first_applied_at?: string | null
          id?: string
          last_applied_at?: string | null
          status?: string
          subscription_id?: string
          total_saved_kwd?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_validation_log: {
        Row: {
          attempted_at: string
          code_hash_attempted: string
          code_id: string | null
          denial_reason: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
          was_valid: boolean
        }
        Insert: {
          attempted_at?: string
          code_hash_attempted: string
          code_id?: string | null
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
          was_valid: boolean
        }
        Update: {
          attempted_at?: string
          code_hash_attempted?: string
          code_id?: string | null
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
          was_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "discount_validation_log_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      educational_videos: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_free_preview: boolean | null
          is_pinned: boolean
          module: string | null
          order_index: number | null
          prerequisite_video_id: string | null
          requires_completion: boolean | null
          storage_bucket: string | null
          storage_path: string | null
          title: string
          updated_at: string | null
          video_type: string
          video_url: string
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_free_preview?: boolean | null
          is_pinned?: boolean
          module?: string | null
          order_index?: number | null
          prerequisite_video_id?: string | null
          requires_completion?: boolean | null
          storage_bucket?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string | null
          video_type: string
          video_url: string
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_free_preview?: boolean | null
          is_pinned?: boolean
          module?: string | null
          order_index?: number | null
          prerequisite_video_id?: string | null
          requires_completion?: boolean | null
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string | null
          video_type?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "educational_videos_prerequisite_video_id_fkey"
            columns: ["prerequisite_video_id"]
            isOneToOne: false
            referencedRelation: "educational_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notifications: {
        Row: {
          id: string
          notification_type: string
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          id?: string
          notification_type: string
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          notification_type?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exercise_library: {
        Row: {
          anatomical_name: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at: string
          created_by_coach_id: string | null
          default_video_url: string | null
          description: string | null
          equipment: string | null
          id: string
          is_active: boolean
          is_global: boolean
          name: string
          primary_muscle: string
          secondary_muscles: string[] | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          anatomical_name?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          created_by_coach_id?: string | null
          default_video_url?: string | null
          description?: string | null
          equipment?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name: string
          primary_muscle: string
          secondary_muscles?: string[] | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          anatomical_name?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          created_by_coach_id?: string | null
          default_video_url?: string | null
          description?: string | null
          equipment?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          name?: string
          primary_muscle?: string
          secondary_muscles?: string[] | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_library_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "exercise_library_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
        ]
      }
      exercise_media: {
        Row: {
          client_module_exercise_id: string
          created_at: string
          id: string
          media_type: Database["public"]["Enums"]["exercise_media_type"]
          storage_path: string
          uploader_user_id: string
        }
        Insert: {
          client_module_exercise_id: string
          created_at?: string
          id?: string
          media_type: Database["public"]["Enums"]["exercise_media_type"]
          storage_path: string
          uploader_user_id: string
        }
        Update: {
          client_module_exercise_id?: string
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["exercise_media_type"]
          storage_path?: string
          uploader_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_media_client_module_exercise_id_fkey"
            columns: ["client_module_exercise_id"]
            isOneToOne: false
            referencedRelation: "client_module_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_media_uploader_user_id_fkey"
            columns: ["uploader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_media_uploader_user_id_fkey"
            columns: ["uploader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_prescriptions: {
        Row: {
          allow_client_extra_sets: boolean
          column_config: Json | null
          created_at: string
          custom_fields_json: Json | null
          id: string
          intensity_type: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value: number | null
          module_exercise_id: string
          progression_notes: string | null
          rep_range_max: number | null
          rep_range_min: number | null
          rest_seconds: number | null
          set_count: number
          sets_json: Json | null
          tempo: string | null
          updated_at: string
          warmup_sets_json: Json | null
        }
        Insert: {
          allow_client_extra_sets?: boolean
          column_config?: Json | null
          created_at?: string
          custom_fields_json?: Json | null
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          module_exercise_id: string
          progression_notes?: string | null
          rep_range_max?: number | null
          rep_range_min?: number | null
          rest_seconds?: number | null
          set_count?: number
          sets_json?: Json | null
          tempo?: string | null
          updated_at?: string
          warmup_sets_json?: Json | null
        }
        Update: {
          allow_client_extra_sets?: boolean
          column_config?: Json | null
          created_at?: string
          custom_fields_json?: Json | null
          id?: string
          intensity_type?: Database["public"]["Enums"]["intensity_type"] | null
          intensity_value?: number | null
          module_exercise_id?: string
          progression_notes?: string | null
          rep_range_max?: number | null
          rep_range_min?: number | null
          rest_seconds?: number | null
          set_count?: number
          sets_json?: Json | null
          tempo?: string | null
          updated_at?: string
          warmup_sets_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_prescriptions_module_exercise_id_fkey"
            columns: ["module_exercise_id"]
            isOneToOne: false
            referencedRelation: "module_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_set_logs: {
        Row: {
          client_module_exercise_id: string
          created_at: string
          created_by_user_id: string
          id: string
          notes: string | null
          performed_load: number | null
          performed_reps: number | null
          performed_rir: number | null
          performed_rpe: number | null
          prescribed: Json
          set_index: number
        }
        Insert: {
          client_module_exercise_id: string
          created_at?: string
          created_by_user_id: string
          id?: string
          notes?: string | null
          performed_load?: number | null
          performed_reps?: number | null
          performed_rir?: number | null
          performed_rpe?: number | null
          prescribed?: Json
          set_index: number
        }
        Update: {
          client_module_exercise_id?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          notes?: string | null
          performed_load?: number | null
          performed_reps?: number | null
          performed_rir?: number | null
          performed_rpe?: number | null
          prescribed?: Json
          set_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercise_set_logs_client_module_exercise_id_fkey"
            columns: ["client_module_exercise_id"]
            isOneToOne: false
            referencedRelation: "client_module_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_set_logs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_set_logs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          created_at: string | null
          created_by: string | null
          difficulty: string
          execution_instructions: string[] | null
          id: string
          muscle_groups: string[]
          muscle_subdivisions: Json | null
          name: string
          pitfalls: string[] | null
          setup_instructions: string[] | null
          updated_at: string | null
          youtube_url: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          difficulty: string
          execution_instructions?: string[] | null
          id?: string
          muscle_groups: string[]
          muscle_subdivisions?: Json | null
          name: string
          pitfalls?: string[] | null
          setup_instructions?: string[] | null
          updated_at?: string | null
          youtube_url?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          difficulty?: string
          execution_instructions?: string[] | null
          id?: string
          muscle_groups?: string[]
          muscle_subdivisions?: Json | null
          name?: string
          pitfalls?: string[] | null
          setup_instructions?: string[] | null
          updated_at?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          accepts_lower_body_only: boolean | null
          accepts_team_program: boolean | null
          agreed_intellectual_property: boolean
          agreed_intellectual_property_at: string | null
          agreed_medical_disclaimer: boolean
          agreed_medical_disclaimer_at: string | null
          agreed_privacy: boolean
          agreed_privacy_at: string | null
          agreed_refund_policy: boolean
          agreed_refund_policy_at: string | null
          agreed_terms: boolean
          agreed_terms_at: string | null
          airtable_record_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          client_signed_agreement_url: string | null
          client_signed_liability_url: string | null
          coach_preference_type: string | null
          coach_uploaded_agreement_url: string | null
          coach_uploaded_liability_url: string | null
          created_at: string | null
          date_of_birth: string | null
          date_of_birth_encrypted: string | null
          discord_username: string | null
          documents_approved_at: string | null
          documents_approved_by_coach: boolean | null
          documents_verified: boolean | null
          email: string | null
          email_encrypted: string | null
          first_name: string
          focus_areas: string[] | null
          form_type: Database["public"]["Enums"]["form_type"]
          gym_access_type: string | null
          heard_about_us: Database["public"]["Enums"]["referral_source"]
          heard_about_us_other: string | null
          home_gym_equipment: string | null
          id: string
          last_name: string
          liability_release_url: string | null
          master_agreement_url: string | null
          needs_medical_review: boolean
          nutrition_approach:
            | Database["public"]["Enums"]["nutrition_approach"]
            | null
          parq_additional_details: string | null
          parq_additional_details_encrypted: string | null
          parq_balance_dizziness: boolean | null
          parq_balance_dizziness_encrypted: string | null
          parq_bone_joint_problem: boolean | null
          parq_bone_joint_problem_encrypted: string | null
          parq_chest_pain_active: boolean | null
          parq_chest_pain_active_encrypted: string | null
          parq_chest_pain_inactive: boolean | null
          parq_chest_pain_inactive_encrypted: string | null
          parq_heart_condition: boolean | null
          parq_heart_condition_encrypted: string | null
          parq_injuries_conditions: string | null
          parq_injuries_conditions_encrypted: string | null
          parq_medication: boolean | null
          parq_medication_encrypted: string | null
          parq_other_reason: boolean | null
          parq_other_reason_encrypted: string | null
          payment_enabled: boolean | null
          phone_number: string | null
          phone_number_encrypted: string | null
          plan_name: string | null
          preferred_coach_id: string | null
          preferred_gym_location: string | null
          preferred_training_times: string[] | null
          requested_coach_id: string | null
          submission_status: string | null
          training_days_per_week: string | null
          training_experience: Database["public"]["Enums"]["training_experience"]
          training_goals: string
          understands_no_nutrition: boolean | null
          updated_at: string | null
          user_id: string | null
          verified_at: string | null
          verified_by_coach_id: string | null
        }
        Insert: {
          accepts_lower_body_only?: boolean | null
          accepts_team_program?: boolean | null
          agreed_intellectual_property?: boolean
          agreed_intellectual_property_at?: string | null
          agreed_medical_disclaimer?: boolean
          agreed_medical_disclaimer_at?: string | null
          agreed_privacy?: boolean
          agreed_privacy_at?: string | null
          agreed_refund_policy?: boolean
          agreed_refund_policy_at?: string | null
          agreed_terms?: boolean
          agreed_terms_at?: string | null
          airtable_record_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_signed_agreement_url?: string | null
          client_signed_liability_url?: string | null
          coach_preference_type?: string | null
          coach_uploaded_agreement_url?: string | null
          coach_uploaded_liability_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          date_of_birth_encrypted?: string | null
          discord_username?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: boolean | null
          documents_verified?: boolean | null
          email?: string | null
          email_encrypted?: string | null
          first_name: string
          focus_areas?: string[] | null
          form_type: Database["public"]["Enums"]["form_type"]
          gym_access_type?: string | null
          heard_about_us: Database["public"]["Enums"]["referral_source"]
          heard_about_us_other?: string | null
          home_gym_equipment?: string | null
          id?: string
          last_name: string
          liability_release_url?: string | null
          master_agreement_url?: string | null
          needs_medical_review?: boolean
          nutrition_approach?:
            | Database["public"]["Enums"]["nutrition_approach"]
            | null
          parq_additional_details?: string | null
          parq_additional_details_encrypted?: string | null
          parq_balance_dizziness?: boolean | null
          parq_balance_dizziness_encrypted?: string | null
          parq_bone_joint_problem?: boolean | null
          parq_bone_joint_problem_encrypted?: string | null
          parq_chest_pain_active?: boolean | null
          parq_chest_pain_active_encrypted?: string | null
          parq_chest_pain_inactive?: boolean | null
          parq_chest_pain_inactive_encrypted?: string | null
          parq_heart_condition?: boolean | null
          parq_heart_condition_encrypted?: string | null
          parq_injuries_conditions?: string | null
          parq_injuries_conditions_encrypted?: string | null
          parq_medication?: boolean | null
          parq_medication_encrypted?: string | null
          parq_other_reason?: boolean | null
          parq_other_reason_encrypted?: string | null
          payment_enabled?: boolean | null
          phone_number?: string | null
          phone_number_encrypted?: string | null
          plan_name?: string | null
          preferred_coach_id?: string | null
          preferred_gym_location?: string | null
          preferred_training_times?: string[] | null
          requested_coach_id?: string | null
          submission_status?: string | null
          training_days_per_week?: string | null
          training_experience: Database["public"]["Enums"]["training_experience"]
          training_goals: string
          understands_no_nutrition?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
          verified_by_coach_id?: string | null
        }
        Update: {
          accepts_lower_body_only?: boolean | null
          accepts_team_program?: boolean | null
          agreed_intellectual_property?: boolean
          agreed_intellectual_property_at?: string | null
          agreed_medical_disclaimer?: boolean
          agreed_medical_disclaimer_at?: string | null
          agreed_privacy?: boolean
          agreed_privacy_at?: string | null
          agreed_refund_policy?: boolean
          agreed_refund_policy_at?: string | null
          agreed_terms?: boolean
          agreed_terms_at?: string | null
          airtable_record_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_signed_agreement_url?: string | null
          client_signed_liability_url?: string | null
          coach_preference_type?: string | null
          coach_uploaded_agreement_url?: string | null
          coach_uploaded_liability_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          date_of_birth_encrypted?: string | null
          discord_username?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: boolean | null
          documents_verified?: boolean | null
          email?: string | null
          email_encrypted?: string | null
          first_name?: string
          focus_areas?: string[] | null
          form_type?: Database["public"]["Enums"]["form_type"]
          gym_access_type?: string | null
          heard_about_us?: Database["public"]["Enums"]["referral_source"]
          heard_about_us_other?: string | null
          home_gym_equipment?: string | null
          id?: string
          last_name?: string
          liability_release_url?: string | null
          master_agreement_url?: string | null
          needs_medical_review?: boolean
          nutrition_approach?:
            | Database["public"]["Enums"]["nutrition_approach"]
            | null
          parq_additional_details?: string | null
          parq_additional_details_encrypted?: string | null
          parq_balance_dizziness?: boolean | null
          parq_balance_dizziness_encrypted?: string | null
          parq_bone_joint_problem?: boolean | null
          parq_bone_joint_problem_encrypted?: string | null
          parq_chest_pain_active?: boolean | null
          parq_chest_pain_active_encrypted?: string | null
          parq_chest_pain_inactive?: boolean | null
          parq_chest_pain_inactive_encrypted?: string | null
          parq_heart_condition?: boolean | null
          parq_heart_condition_encrypted?: string | null
          parq_injuries_conditions?: string | null
          parq_injuries_conditions_encrypted?: string | null
          parq_medication?: boolean | null
          parq_medication_encrypted?: string | null
          parq_other_reason?: boolean | null
          parq_other_reason_encrypted?: string | null
          payment_enabled?: boolean | null
          phone_number?: string | null
          phone_number_encrypted?: string | null
          plan_name?: string | null
          preferred_coach_id?: string | null
          preferred_gym_location?: string | null
          preferred_training_times?: string[] | null
          requested_coach_id?: string | null
          submission_status?: string | null
          training_days_per_week?: string | null
          training_experience?: Database["public"]["Enums"]["training_experience"]
          training_goals?: string
          understands_no_nutrition?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          verified_at?: string | null
          verified_by_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_requested_coach_id_fkey"
            columns: ["requested_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_requested_coach_id_fkey"
            columns: ["requested_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_verified_by_coach_id_fkey"
            columns: ["verified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_verified_by_coach_id_fkey"
            columns: ["verified_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions_medical_private: {
        Row: {
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          encrypted_payload: string | null
          id: string
          parq_additional_details: string | null
          parq_balance_dizziness: boolean | null
          parq_bone_joint_problem: boolean | null
          parq_chest_pain_active: boolean | null
          parq_chest_pain_inactive: boolean | null
          parq_heart_condition: boolean | null
          parq_injuries_conditions: string | null
          parq_medication: boolean | null
          parq_other_reason: boolean | null
          submission_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          encrypted_payload?: string | null
          id?: string
          parq_additional_details?: string | null
          parq_balance_dizziness?: boolean | null
          parq_bone_joint_problem?: boolean | null
          parq_chest_pain_active?: boolean | null
          parq_chest_pain_inactive?: boolean | null
          parq_heart_condition?: boolean | null
          parq_injuries_conditions?: string | null
          parq_medication?: boolean | null
          parq_other_reason?: boolean | null
          submission_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          encrypted_payload?: string | null
          id?: string
          parq_additional_details?: string | null
          parq_balance_dizziness?: boolean | null
          parq_bone_joint_problem?: boolean | null
          parq_chest_pain_active?: boolean | null
          parq_chest_pain_inactive?: boolean | null
          parq_heart_condition?: boolean | null
          parq_injuries_conditions?: string | null
          parq_medication?: boolean | null
          parq_other_reason?: boolean | null
          submission_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_medical_private_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "form_submissions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions_public: {
        Row: {
          agreed_intellectual_property: boolean | null
          agreed_intellectual_property_at: string | null
          agreed_medical_disclaimer: boolean | null
          agreed_medical_disclaimer_at: string | null
          agreed_privacy: boolean | null
          agreed_privacy_at: string | null
          agreed_refund_policy: boolean | null
          agreed_refund_policy_at: string | null
          agreed_terms: boolean | null
          agreed_terms_at: string | null
          coach_preference_type: string | null
          created_at: string
          discord_username: string | null
          documents_approved_at: string | null
          documents_approved_by_coach: string | null
          documents_verified: boolean | null
          focus_areas: string[] | null
          gym_access_type: string | null
          heard_about_us: string | null
          id: string
          injury_flag: boolean | null
          medical_review_required: boolean | null
          nutrition_approach: string | null
          preferred_coach_id: string | null
          preferred_gym_location: string | null
          preferred_training_times: string[] | null
          service_id: string | null
          status: string | null
          training_days_per_week: number | null
          training_experience: string | null
          training_goals: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agreed_intellectual_property?: boolean | null
          agreed_intellectual_property_at?: string | null
          agreed_medical_disclaimer?: boolean | null
          agreed_medical_disclaimer_at?: string | null
          agreed_privacy?: boolean | null
          agreed_privacy_at?: string | null
          agreed_refund_policy?: boolean | null
          agreed_refund_policy_at?: string | null
          agreed_terms?: boolean | null
          agreed_terms_at?: string | null
          coach_preference_type?: string | null
          created_at?: string
          discord_username?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: string | null
          documents_verified?: boolean | null
          focus_areas?: string[] | null
          gym_access_type?: string | null
          heard_about_us?: string | null
          id?: string
          injury_flag?: boolean | null
          medical_review_required?: boolean | null
          nutrition_approach?: string | null
          preferred_coach_id?: string | null
          preferred_gym_location?: string | null
          preferred_training_times?: string[] | null
          service_id?: string | null
          status?: string | null
          training_days_per_week?: number | null
          training_experience?: string | null
          training_goals?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agreed_intellectual_property?: boolean | null
          agreed_intellectual_property_at?: string | null
          agreed_medical_disclaimer?: boolean | null
          agreed_medical_disclaimer_at?: string | null
          agreed_privacy?: boolean | null
          agreed_privacy_at?: string | null
          agreed_refund_policy?: boolean | null
          agreed_refund_policy_at?: string | null
          agreed_terms?: boolean | null
          agreed_terms_at?: string | null
          coach_preference_type?: string | null
          created_at?: string
          discord_username?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: string | null
          documents_verified?: boolean | null
          focus_areas?: string[] | null
          gym_access_type?: string | null
          heard_about_us?: string | null
          id?: string
          injury_flag?: boolean | null
          medical_review_required?: boolean | null
          nutrition_approach?: string | null
          preferred_coach_id?: string | null
          preferred_gym_location?: string | null
          preferred_training_times?: string[] | null
          service_id?: string | null
          status?: string | null
          training_days_per_week?: number | null
          training_experience?: string | null
          training_goals?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_public_documents_approved_by_coach_fkey"
            columns: ["documents_approved_by_coach"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_public_documents_approved_by_coach_fkey"
            columns: ["documents_approved_by_coach"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_public_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_public_preferred_coach_id_fkey"
            columns: ["preferred_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "form_submissions_public_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions_safe: {
        Row: {
          admin_medical_summary: string | null
          coach_id: string | null
          coach_preference_type: string | null
          created_at: string | null
          documents_approved_at: string | null
          documents_approved_by_coach: boolean | null
          documents_verified: boolean | null
          id: string
          medical_cleared: boolean | null
          medical_cleared_at: string | null
          medical_cleared_by: string | null
          needs_medical_review: boolean | null
          notes_summary: string | null
          red_flags_count: number | null
          requested_coach_id: string | null
          service_id: string | null
          submission_status: string | null
          updated_at: string | null
          user_id: string
          verified_at: string | null
          verified_by_coach_id: string | null
        }
        Insert: {
          admin_medical_summary?: string | null
          coach_id?: string | null
          coach_preference_type?: string | null
          created_at?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: boolean | null
          documents_verified?: boolean | null
          id: string
          medical_cleared?: boolean | null
          medical_cleared_at?: string | null
          medical_cleared_by?: string | null
          needs_medical_review?: boolean | null
          notes_summary?: string | null
          red_flags_count?: number | null
          requested_coach_id?: string | null
          service_id?: string | null
          submission_status?: string | null
          updated_at?: string | null
          user_id: string
          verified_at?: string | null
          verified_by_coach_id?: string | null
        }
        Update: {
          admin_medical_summary?: string | null
          coach_id?: string | null
          coach_preference_type?: string | null
          created_at?: string | null
          documents_approved_at?: string | null
          documents_approved_by_coach?: boolean | null
          documents_verified?: boolean | null
          id?: string
          medical_cleared?: boolean | null
          medical_cleared_at?: string | null
          medical_cleared_by?: string | null
          needs_medical_review?: boolean | null
          notes_summary?: string | null
          red_flags_count?: number | null
          requested_coach_id?: string | null
          service_id?: string | null
          submission_status?: string | null
          updated_at?: string | null
          user_id?: string
          verified_at?: string | null
          verified_by_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_safe_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          created_at: string
          document_type: string
          document_url: string
          id: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          document_type: string
          document_url: string
          id?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          document_url?: string
          id?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
      }
      module_exercises: {
        Row: {
          created_at: string
          day_module_id: string
          exercise_id: string
          id: string
          instructions: string | null
          section: Database["public"]["Enums"]["exercise_section"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_module_id: string
          exercise_id: string
          id?: string
          instructions?: string | null
          section?: Database["public"]["Enums"]["exercise_section"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_module_id?: string
          exercise_id?: string
          id?: string
          instructions?: string | null
          section?: Database["public"]["Enums"]["exercise_section"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_exercises_day_module_id_fkey"
            columns: ["day_module_id"]
            isOneToOne: false
            referencedRelation: "day_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      module_thread_messages: {
        Row: {
          author_role: Database["public"]["Enums"]["thread_author_role"]
          author_user_id: string
          created_at: string
          id: string
          message: string
          thread_id: string
        }
        Insert: {
          author_role: Database["public"]["Enums"]["thread_author_role"]
          author_user_id: string
          created_at?: string
          id?: string
          message: string
          thread_id: string
        }
        Update: {
          author_role?: Database["public"]["Enums"]["thread_author_role"]
          author_user_id?: string
          created_at?: string
          id?: string
          message?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_thread_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_thread_messages_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "module_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      module_threads: {
        Row: {
          client_day_module_id: string
          created_at: string
          id: string
        }
        Insert: {
          client_day_module_id: string
          created_at?: string
          id?: string
        }
        Update: {
          client_day_module_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_threads_client_day_module_id_fkey"
            columns: ["client_day_module_id"]
            isOneToOne: true
            referencedRelation: "client_day_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_coach_payments: {
        Row: {
          client_breakdown: Json
          coach_id: string
          created_at: string
          discounts_applied_kwd: number | null
          gross_revenue_kwd: number | null
          id: string
          is_paid: boolean
          net_collected_kwd: number | null
          notes: string | null
          paid_at: string | null
          payment_month: string
          payment_rates: Json
          total_clients: number
          total_payment: number
          updated_at: string
        }
        Insert: {
          client_breakdown: Json
          coach_id: string
          created_at?: string
          discounts_applied_kwd?: number | null
          gross_revenue_kwd?: number | null
          id?: string
          is_paid?: boolean
          net_collected_kwd?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_month: string
          payment_rates: Json
          total_clients: number
          total_payment: number
          updated_at?: string
        }
        Update: {
          client_breakdown?: Json
          coach_id?: string
          created_at?: string
          discounts_applied_kwd?: number | null
          gross_revenue_kwd?: number | null
          id?: string
          is_paid?: boolean
          net_collected_kwd?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_month?: string
          payment_rates?: Json
          total_clients?: number
          total_payment?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_coach_payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_coach_payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_adjustments: {
        Row: {
          actual_weight_change_percentage: number | null
          approved_at: string | null
          approved_by: string | null
          approved_calorie_adjustment: number | null
          coach_notes: string | null
          created_at: string
          delayed_reason: string | null
          deviation_percentage: number | null
          expected_weight_change_percentage: number | null
          flag_reason: string | null
          id: string
          is_delayed: boolean | null
          is_diet_break_week: boolean
          is_flagged: boolean | null
          new_carb_grams: number | null
          new_daily_calories: number | null
          new_fat_grams: number | null
          new_protein_grams: number | null
          phase_id: string
          reviewed_by_dietitian_id: string | null
          status: string
          suggested_calorie_adjustment: number | null
          week_number: number
        }
        Insert: {
          actual_weight_change_percentage?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_calorie_adjustment?: number | null
          coach_notes?: string | null
          created_at?: string
          delayed_reason?: string | null
          deviation_percentage?: number | null
          expected_weight_change_percentage?: number | null
          flag_reason?: string | null
          id?: string
          is_delayed?: boolean | null
          is_diet_break_week?: boolean
          is_flagged?: boolean | null
          new_carb_grams?: number | null
          new_daily_calories?: number | null
          new_fat_grams?: number | null
          new_protein_grams?: number | null
          phase_id: string
          reviewed_by_dietitian_id?: string | null
          status?: string
          suggested_calorie_adjustment?: number | null
          week_number: number
        }
        Update: {
          actual_weight_change_percentage?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_calorie_adjustment?: number | null
          coach_notes?: string | null
          created_at?: string
          delayed_reason?: string | null
          deviation_percentage?: number | null
          expected_weight_change_percentage?: number | null
          flag_reason?: string | null
          id?: string
          is_delayed?: boolean | null
          is_diet_break_week?: boolean
          is_flagged?: boolean | null
          new_carb_grams?: number | null
          new_daily_calories?: number | null
          new_fat_grams?: number | null
          new_protein_grams?: number | null
          phase_id?: string
          reviewed_by_dietitian_id?: string | null
          status?: string
          suggested_calorie_adjustment?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_adjustments_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goals: {
        Row: {
          activity_level: string
          age: number
          body_fat_percentage: number | null
          carb_grams: number
          coach_id_at_creation: string | null
          created_at: string
          daily_calories: number
          date_of_birth: string | null
          diet_break_duration_weeks: number | null
          diet_break_frequency_weeks: number | null
          diet_breaks_enabled: boolean
          end_date: string | null
          estimated_duration_weeks: number | null
          estimated_end_date: string | null
          fat_grams: number
          fat_intake_percentage: number
          fiber_grams: number | null
          goal_type: string
          height_cm: number
          id: string
          is_active: boolean
          phase_name: string
          protein_based_on_ffm: boolean | null
          protein_grams: number
          protein_intake_g_per_kg: number
          sex: string
          start_date: string
          starting_weight_kg: number
          steps_goal: number | null
          target_body_fat: number | null
          target_type: string | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          weekly_rate_percentage: number
        }
        Insert: {
          activity_level: string
          age: number
          body_fat_percentage?: number | null
          carb_grams: number
          coach_id_at_creation?: string | null
          created_at?: string
          daily_calories: number
          date_of_birth?: string | null
          diet_break_duration_weeks?: number | null
          diet_break_frequency_weeks?: number | null
          diet_breaks_enabled?: boolean
          end_date?: string | null
          estimated_duration_weeks?: number | null
          estimated_end_date?: string | null
          fat_grams: number
          fat_intake_percentage: number
          fiber_grams?: number | null
          goal_type: string
          height_cm: number
          id?: string
          is_active?: boolean
          phase_name: string
          protein_based_on_ffm?: boolean | null
          protein_grams: number
          protein_intake_g_per_kg: number
          sex: string
          start_date?: string
          starting_weight_kg: number
          steps_goal?: number | null
          target_body_fat?: number | null
          target_type?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          weekly_rate_percentage: number
        }
        Update: {
          activity_level?: string
          age?: number
          body_fat_percentage?: number | null
          carb_grams?: number
          coach_id_at_creation?: string | null
          created_at?: string
          daily_calories?: number
          date_of_birth?: string | null
          diet_break_duration_weeks?: number | null
          diet_break_frequency_weeks?: number | null
          diet_breaks_enabled?: boolean
          end_date?: string | null
          estimated_duration_weeks?: number | null
          estimated_end_date?: string | null
          fat_grams?: number
          fat_intake_percentage?: number
          fiber_grams?: number | null
          goal_type?: string
          height_cm?: number
          id?: string
          is_active?: boolean
          phase_name?: string
          protein_based_on_ffm?: boolean | null
          protein_grams?: number
          protein_intake_g_per_kg?: number
          sex?: string
          start_date?: string
          starting_weight_kg?: number
          steps_goal?: number | null
          target_body_fat?: number | null
          target_type?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weekly_rate_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_goals_coach_id_at_creation_fkey"
            columns: ["coach_id_at_creation"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "nutrition_goals_coach_id_at_creation_fkey"
            columns: ["coach_id_at_creation"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
        ]
      }
      nutrition_phases: {
        Row: {
          carb_grams: number
          coach_id: string | null
          coach_notes: string | null
          completed_at: string | null
          created_at: string
          daily_calories: number
          diet_break_duration_weeks: number | null
          diet_break_enabled: boolean
          diet_break_frequency_weeks: number | null
          end_date: string | null
          estimated_end_date: string | null
          fat_grams: number
          fat_intake_percentage: number
          fiber_grams: number | null
          goal_type: string
          id: string
          is_active: boolean
          is_archived: boolean | null
          phase_name: string
          phase_summary: Json | null
          protein_based_on_ffm: boolean
          protein_grams: number
          protein_intake_g_per_kg: number
          reverse_tdee_actual: number | null
          reverse_tdee_deviation: number | null
          start_date: string
          starting_weight_kg: number
          steps_goal: number | null
          steps_target: number | null
          target_body_fat_percentage: number | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          weekly_rate_percentage: number
        }
        Insert: {
          carb_grams: number
          coach_id?: string | null
          coach_notes?: string | null
          completed_at?: string | null
          created_at?: string
          daily_calories: number
          diet_break_duration_weeks?: number | null
          diet_break_enabled?: boolean
          diet_break_frequency_weeks?: number | null
          end_date?: string | null
          estimated_end_date?: string | null
          fat_grams: number
          fat_intake_percentage: number
          fiber_grams?: number | null
          goal_type: string
          id?: string
          is_active?: boolean
          is_archived?: boolean | null
          phase_name: string
          phase_summary?: Json | null
          protein_based_on_ffm?: boolean
          protein_grams: number
          protein_intake_g_per_kg: number
          reverse_tdee_actual?: number | null
          reverse_tdee_deviation?: number | null
          start_date?: string
          starting_weight_kg: number
          steps_goal?: number | null
          steps_target?: number | null
          target_body_fat_percentage?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          weekly_rate_percentage: number
        }
        Update: {
          carb_grams?: number
          coach_id?: string | null
          coach_notes?: string | null
          completed_at?: string | null
          created_at?: string
          daily_calories?: number
          diet_break_duration_weeks?: number | null
          diet_break_enabled?: boolean
          diet_break_frequency_weeks?: number | null
          end_date?: string | null
          estimated_end_date?: string | null
          fat_grams?: number
          fat_intake_percentage?: number
          fiber_grams?: number | null
          goal_type?: string
          id?: string
          is_active?: boolean
          is_archived?: boolean | null
          phase_name?: string
          phase_summary?: Json | null
          protein_based_on_ffm?: boolean
          protein_grams?: number
          protein_intake_g_per_kg?: number
          reverse_tdee_actual?: number | null
          reverse_tdee_deviation?: number | null
          start_date?: string
          starting_weight_kg?: number
          steps_goal?: number | null
          steps_target?: number | null
          target_body_fat_percentage?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weekly_rate_percentage?: number
        }
        Relationships: []
      }
      onboarding_drafts: {
        Row: {
          created_at: string | null
          current_step: number
          form_data: Json
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_step?: number
          form_data?: Json
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_step?: number
          form_data?: Json
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          charge_id: string
          created_at: string
          currency: string | null
          error_details: string | null
          id: string
          occurred_at: string
          payload_json: Json | null
          processed_at: string | null
          processing_result: string | null
          provider: string
          provider_event_id: string | null
          source: string
          status: string
          subscription_id: string | null
          user_id: string | null
          verified_json: Json | null
        }
        Insert: {
          amount?: number | null
          charge_id: string
          created_at?: string
          currency?: string | null
          error_details?: string | null
          id?: string
          occurred_at?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          source?: string
          status: string
          subscription_id?: string | null
          user_id?: string | null
          verified_json?: Json | null
        }
        Update: {
          amount?: number | null
          charge_id?: string
          created_at?: string
          currency?: string | null
          error_details?: string | null
          id?: string
          occurred_at?: string
          payload_json?: Json | null
          processed_at?: string | null
          processing_result?: string | null
          provider?: string
          provider_event_id?: string | null
          source?: string
          status?: string
          subscription_id?: string | null
          user_id?: string | null
          verified_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          actual_amount: number | null
          actual_currency: string | null
          created_at: string
          error_details: string | null
          expected_amount_kwd: number | null
          id: string
          ip_address: string | null
          processing_result: string | null
          raw_payload: Json
          received_at: string
          request_id: string | null
          source: string
          subscription_id: string | null
          tap_charge_id: string | null
          tap_status: string | null
          user_id: string | null
          verification_result: string
          verified_with_tap: boolean
        }
        Insert: {
          actual_amount?: number | null
          actual_currency?: string | null
          created_at?: string
          error_details?: string | null
          expected_amount_kwd?: number | null
          id?: string
          ip_address?: string | null
          processing_result?: string | null
          raw_payload: Json
          received_at?: string
          request_id?: string | null
          source?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          tap_status?: string | null
          user_id?: string | null
          verification_result: string
          verified_with_tap?: boolean
        }
        Update: {
          actual_amount?: number | null
          actual_currency?: string | null
          created_at?: string
          error_details?: string | null
          expected_amount_kwd?: number | null
          id?: string
          ip_address?: string | null
          processing_result?: string | null
          raw_payload?: Json
          received_at?: string
          request_id?: string | null
          source?: string
          subscription_id?: string | null
          tap_charge_id?: string | null
          tap_status?: string | null
          user_id?: string | null
          verification_result?: string
          verified_with_tap?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_rules: {
        Row: {
          id: string
          platform_fee_type: Database["public"]["Enums"]["fee_type"]
          platform_fee_value: number
          primary_payout_type: Database["public"]["Enums"]["payout_type"]
          primary_payout_value: number
          service_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          platform_fee_type?: Database["public"]["Enums"]["fee_type"]
          platform_fee_value?: number
          primary_payout_type?: Database["public"]["Enums"]["payout_type"]
          primary_payout_value?: number
          service_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          platform_fee_type?: Database["public"]["Enums"]["fee_type"]
          platform_fee_value?: number
          primary_payout_type?: Database["public"]["Enums"]["payout_type"]
          primary_payout_value?: number
          service_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_discount_applications: {
        Row: {
          code_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          service_id: string
          tap_charge_id: string | null
          user_id: string
        }
        Insert: {
          code_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          service_id: string
          tap_charge_id?: string | null
          user_id: string
        }
        Update: {
          code_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          service_id?: string
          tap_charge_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_discount_applications_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_discount_applications_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      phi_access_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          fields_accessed: string[] | null
          id: string
          ip_address: string | null
          metadata: Json | null
          occurred_at: string
          request_id: string | null
          resource_id: string | null
          resource_type: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          occurred_at?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      phi_access_log: {
        Row: {
          action_type: string
          created_at: string
          id: string
          ip_address: string | null
          target_table: string | null
          target_user_id: string | null
          user_agent: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_table?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id: string
          user_role: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_table?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      phi_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      phi_compliance_scans: {
        Row: {
          critical_violations: number
          id: string
          notes: string | null
          scan_results: Json
          scanned_at: string
          scanned_by: string | null
          total_violations: number
          warning_violations: number
        }
        Insert: {
          critical_violations?: number
          id?: string
          notes?: string | null
          scan_results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total_violations?: number
          warning_violations?: number
        }
        Update: {
          critical_violations?: number
          id?: string
          notes?: string | null
          scan_results?: Json
          scanned_at?: string
          scanned_by?: string | null
          total_violations?: number
          warning_violations?: number
        }
        Relationships: []
      }
      playlist_videos: {
        Row: {
          created_at: string
          id: string
          order_number: number
          playlist_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_number: number
          playlist_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_number?: number
          playlist_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_videos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "video_playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "educational_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_legacy: {
        Row: {
          activation_completed_at: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          onboarding_completed_at: string | null
          payment_deadline: string | null
          payment_exempt: boolean
          phone: string | null
          signup_completed_at: string | null
          status: Database["public"]["Enums"]["account_status"] | null
          updated_at: string | null
        }
        Insert: {
          activation_completed_at?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          payment_deadline?: string | null
          payment_exempt?: boolean
          phone?: string | null
          signup_completed_at?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
        }
        Update: {
          activation_completed_at?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          payment_deadline?: string | null
          payment_exempt?: boolean
          phone?: string | null
          signup_completed_at?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          email: string
          full_name: string | null
          gender: string | null
          last_name: string | null
          phone: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          full_name?: string | null
          gender?: string | null
          last_name?: string | null
          phone?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          full_name?: string | null
          gender?: string | null
          last_name?: string | null
          phone?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_private_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          activation_completed_at: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string
          onboarding_completed_at: string | null
          payment_deadline: string | null
          payment_exempt: boolean
          signup_completed_at: string | null
          status: Database["public"]["Enums"]["account_status"] | null
          updated_at: string | null
        }
        Insert: {
          activation_completed_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          payment_deadline?: string | null
          payment_exempt?: boolean
          signup_completed_at?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
        }
        Update: {
          activation_completed_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          payment_deadline?: string | null
          payment_exempt?: boolean
          signup_completed_at?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      program_template_days: {
        Row: {
          created_at: string
          day_index: number
          day_title: string
          id: string
          notes: string | null
          program_template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_index: number
          day_title: string
          id?: string
          notes?: string | null
          program_template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_index?: number
          day_title?: string
          id?: string
          notes?: string | null
          program_template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_template_days_program_template_id_fkey"
            columns: ["program_template_id"]
            isOneToOne: false
            referencedRelation: "program_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      program_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          level: Database["public"]["Enums"]["program_level"] | null
          owner_coach_id: string
          tags: string[] | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["program_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          level?: Database["public"]["Enums"]["program_level"] | null
          owner_coach_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["program_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          level?: Database["public"]["Enums"]["program_level"] | null
          owner_coach_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["program_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "program_templates_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "program_templates_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
        ]
      }
      refeed_days: {
        Row: {
          actual_calories: number | null
          actual_carb_g: number | null
          actual_fat_g: number | null
          actual_protein_g: number | null
          client_notes: string | null
          coach_notes: string | null
          created_at: string
          id: string
          phase_id: string
          post_refeed_weight_kg: number | null
          pre_refeed_weight_kg: number | null
          refeed_type: string
          scheduled_date: string
          status: string
          target_calories: number | null
          target_carb_g: number | null
          target_fat_g: number | null
          target_protein_g: number | null
          training_notes: string | null
          updated_at: string
        }
        Insert: {
          actual_calories?: number | null
          actual_carb_g?: number | null
          actual_fat_g?: number | null
          actual_protein_g?: number | null
          client_notes?: string | null
          coach_notes?: string | null
          created_at?: string
          id?: string
          phase_id: string
          post_refeed_weight_kg?: number | null
          pre_refeed_weight_kg?: number | null
          refeed_type: string
          scheduled_date: string
          status?: string
          target_calories?: number | null
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          training_notes?: string | null
          updated_at?: string
        }
        Update: {
          actual_calories?: number | null
          actual_carb_g?: number | null
          actual_fat_g?: number | null
          actual_protein_g?: number | null
          client_notes?: string | null
          coach_notes?: string | null
          created_at?: string
          id?: string
          phase_id?: string
          post_refeed_weight_kg?: number | null
          pre_refeed_weight_kg?: number | null
          refeed_type?: string
          scheduled_date?: string
          status?: string
          target_calories?: number | null
          target_carb_g?: number | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          training_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refeed_days_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      service_billing_components: {
        Row: {
          amount_kwd: number
          component_type: string
          created_at: string | null
          id: string
          label: string
          module_key: string | null
          service_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          amount_kwd: number
          component_type: string
          created_at?: string | null
          id?: string
          label: string
          module_key?: string | null
          service_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_kwd?: number
          component_type?: string
          created_at?: string | null
          id?: string
          label?: string
          module_key?: string | null
          service_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_billing_components_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_pricing: {
        Row: {
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          id: string
          is_active: boolean
          price_kwd: number
          service_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          id?: string
          is_active?: boolean
          price_kwd?: number
          service_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          id?: string
          is_active?: boolean
          price_kwd?: number
          service_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_pricing_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string | null
          default_session_duration_minutes: number | null
          default_weekly_session_limit: number | null
          description: string | null
          discord_role_id: string | null
          enable_session_booking: boolean
          features: string[] | null
          id: string
          includes_nutrition_support: boolean | null
          includes_physio_support: boolean | null
          includes_primary_coaching: boolean | null
          includes_specialty_support: boolean | null
          is_active: boolean | null
          name: string
          price_kwd: number
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_session_duration_minutes?: number | null
          default_weekly_session_limit?: number | null
          description?: string | null
          discord_role_id?: string | null
          enable_session_booking?: boolean
          features?: string[] | null
          id?: string
          includes_nutrition_support?: boolean | null
          includes_physio_support?: boolean | null
          includes_primary_coaching?: boolean | null
          includes_specialty_support?: boolean | null
          is_active?: boolean | null
          name: string
          price_kwd: number
          type: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_session_duration_minutes?: number | null
          default_weekly_session_limit?: number | null
          description?: string | null
          discord_role_id?: string | null
          enable_session_booking?: boolean
          features?: string[] | null
          id?: string
          includes_nutrition_support?: boolean | null
          includes_physio_support?: boolean | null
          includes_primary_coaching?: boolean | null
          includes_specialty_support?: boolean | null
          is_active?: boolean | null
          name?: string
          price_kwd?: number
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      session_bookings: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          session_end: string
          session_start: string
          session_type: string
          slot_id: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          session_end: string
          session_start: string
          session_type?: string
          slot_id: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          session_end?: string
          session_start?: string
          session_type?: string
          slot_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "coach_time_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          page: string
          section: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          value: string
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          page?: string
          section: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value?: string
          value_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          page?: string
          section?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value?: string
          value_type?: string
        }
        Relationships: []
      }
      specialization_tags: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      step_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          notes: string | null
          source: string | null
          steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date: string
          notes?: string | null
          source?: string | null
          steps: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          notes?: string | null
          source?: string | null
          steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      step_recommendations: {
        Row: {
          context: string | null
          created_at: string
          effective_date: string
          end_date: string | null
          id: string
          is_active: boolean
          max_steps: number | null
          min_steps: number | null
          reason: string | null
          recommended_by: string
          target_steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          effective_date?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_steps?: number | null
          min_steps?: number | null
          reason?: string | null
          recommended_by: string
          target_steps: number
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          effective_date?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          max_steps?: number | null
          min_steps?: number | null
          reason?: string | null
          recommended_by?: string
          target_steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_addons: {
        Row: {
          billing_type: string
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          payout_kwd: number
          payout_percentage: number | null
          price_kwd: number
          specialty: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id: string | null
          start_date: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          billing_type?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          payout_kwd?: number
          payout_percentage?: number | null
          price_kwd?: number
          specialty: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id?: string | null
          start_date?: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          billing_type?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          payout_kwd?: number
          payout_percentage?: number | null
          price_kwd?: number
          specialty?: Database["public"]["Enums"]["staff_specialty"]
          staff_user_id?: string | null
          start_date?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addons_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount_kwd: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          is_renewal: boolean
          metadata: Json | null
          paid_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string
          tap_charge_id: string
          user_id: string
        }
        Insert: {
          amount_kwd: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          is_renewal?: boolean
          metadata?: Json | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id: string
          tap_charge_id: string
          user_id: string
        }
        Update: {
          amount_kwd?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          is_renewal?: boolean
          metadata?: Json | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string
          tap_charge_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activation_override_by: string | null
          activation_override_reason: string | null
          added_to_truecoach_team: boolean | null
          addons_total_kwd: number | null
          base_price_kwd: number | null
          billing_amount_kwd: number | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          coach_assignment_method: string | null
          coach_id: string | null
          created_at: string | null
          discount_code_id: string | null
          discount_cycles_used: number
          end_date: string | null
          grace_period_days: number
          id: string
          last_payment_status: string | null
          last_payment_verified_at: string | null
          last_verified_charge_id: string | null
          needs_coach_assignment: boolean | null
          next_billing_date: string | null
          past_due_since: string | null
          payment_failed_at: string | null
          service_id: string
          session_booking_enabled: boolean
          session_duration_minutes: number | null
          start_date: string | null
          status: string | null
          tap_amount_kwd: number | null
          tap_card_id: string | null
          tap_charge_id: string | null
          tap_customer_id: string | null
          tap_payment_agreement_id: string | null
          tap_subscription_id: string | null
          tap_subscription_status: string | null
          total_price_kwd: number | null
          updated_at: string | null
          user_id: string
          weekly_session_limit: number | null
        }
        Insert: {
          activation_override_by?: string | null
          activation_override_reason?: string | null
          added_to_truecoach_team?: boolean | null
          addons_total_kwd?: number | null
          base_price_kwd?: number | null
          billing_amount_kwd?: number | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          coach_assignment_method?: string | null
          coach_id?: string | null
          created_at?: string | null
          discount_code_id?: string | null
          discount_cycles_used?: number
          end_date?: string | null
          grace_period_days?: number
          id?: string
          last_payment_status?: string | null
          last_payment_verified_at?: string | null
          last_verified_charge_id?: string | null
          needs_coach_assignment?: boolean | null
          next_billing_date?: string | null
          past_due_since?: string | null
          payment_failed_at?: string | null
          service_id: string
          session_booking_enabled?: boolean
          session_duration_minutes?: number | null
          start_date?: string | null
          status?: string | null
          tap_amount_kwd?: number | null
          tap_card_id?: string | null
          tap_charge_id?: string | null
          tap_customer_id?: string | null
          tap_payment_agreement_id?: string | null
          tap_subscription_id?: string | null
          tap_subscription_status?: string | null
          total_price_kwd?: number | null
          updated_at?: string | null
          user_id: string
          weekly_session_limit?: number | null
        }
        Update: {
          activation_override_by?: string | null
          activation_override_reason?: string | null
          added_to_truecoach_team?: boolean | null
          addons_total_kwd?: number | null
          base_price_kwd?: number | null
          billing_amount_kwd?: number | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          coach_assignment_method?: string | null
          coach_id?: string | null
          created_at?: string | null
          discount_code_id?: string | null
          discount_cycles_used?: number
          end_date?: string | null
          grace_period_days?: number
          id?: string
          last_payment_status?: string | null
          last_payment_verified_at?: string | null
          last_verified_charge_id?: string | null
          needs_coach_assignment?: boolean | null
          next_billing_date?: string | null
          past_due_since?: string | null
          payment_failed_at?: string | null
          service_id?: string
          session_booking_enabled?: boolean
          session_duration_minutes?: number | null
          start_date?: string | null
          status?: string | null
          tap_amount_kwd?: number | null
          tap_card_id?: string | null
          tap_charge_id?: string | null
          tap_customer_id?: string | null
          tap_payment_agreement_id?: string | null
          tap_subscription_id?: string | null
          tap_subscription_status?: string | null
          total_price_kwd?: number | null
          updated_at?: string | null
          user_id?: string
          weekly_session_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches_client_safe"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_profiles_public_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_profiles_public_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_plan_settings: {
        Row: {
          announcement_text: string | null
          id: string
          is_registration_open: boolean
          next_program_start_date: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          announcement_text?: string | null
          id?: string
          is_registration_open?: boolean
          next_program_start_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          announcement_text?: string | null
          id?: string
          is_registration_open?: boolean
          next_program_start_date?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          coach_id: string | null
          created_at: string | null
          feedback: string
          id: string
          is_approved: boolean | null
          is_archived: boolean
          rating: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          feedback: string
          id?: string
          is_approved?: boolean | null
          is_archived?: boolean
          rating: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          feedback?: string
          id?: string
          is_approved?: boolean | null
          is_archived?: boolean
          rating?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_access_log: {
        Row: {
          access_granted: boolean
          created_at: string
          denial_reason: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          access_granted: boolean
          created_at?: string
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          access_granted?: boolean
          created_at?: string
          denial_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_access_log_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "educational_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_entitlements: {
        Row: {
          created_at: string
          id: string
          service_id: string
          tier: string | null
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
          tier?: string | null
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
          tier?: string | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_entitlements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_entitlements_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "educational_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_playlists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      video_progress: {
        Row: {
          completed_at: string | null
          last_watched_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          completed_at?: string | null
          last_watched_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          completed_at?: string | null
          last_watched_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "educational_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_progress: {
        Row: {
          arms_cm: number | null
          average_weight_kg: number | null
          body_fat_percentage: number | null
          calfs_cm: number | null
          calorie_adjustment: number | null
          chest_cm: number | null
          created_at: string
          daily_steps_avg: number | null
          expected_change_kg: number | null
          followed_calories: boolean | null
          glutes_cm: number | null
          goal_id: string
          hips_cm: number | null
          id: string
          is_diet_break_week: boolean | null
          new_daily_calories: number | null
          notes: string | null
          thigh_cm: number | null
          tracked_accurately: boolean | null
          updated_at: string
          user_id: string
          waist_cm: number | null
          week_number: number
          week_start_date: string
          weight_change_kg: number | null
          weight_change_percentage: number | null
          weight_logs: Json
        }
        Insert: {
          arms_cm?: number | null
          average_weight_kg?: number | null
          body_fat_percentage?: number | null
          calfs_cm?: number | null
          calorie_adjustment?: number | null
          chest_cm?: number | null
          created_at?: string
          daily_steps_avg?: number | null
          expected_change_kg?: number | null
          followed_calories?: boolean | null
          glutes_cm?: number | null
          goal_id: string
          hips_cm?: number | null
          id?: string
          is_diet_break_week?: boolean | null
          new_daily_calories?: number | null
          notes?: string | null
          thigh_cm?: number | null
          tracked_accurately?: boolean | null
          updated_at?: string
          user_id: string
          waist_cm?: number | null
          week_number: number
          week_start_date: string
          weight_change_kg?: number | null
          weight_change_percentage?: number | null
          weight_logs?: Json
        }
        Update: {
          arms_cm?: number | null
          average_weight_kg?: number | null
          body_fat_percentage?: number | null
          calfs_cm?: number | null
          calorie_adjustment?: number | null
          chest_cm?: number | null
          created_at?: string
          daily_steps_avg?: number | null
          expected_change_kg?: number | null
          followed_calories?: boolean | null
          glutes_cm?: number | null
          goal_id?: string
          hips_cm?: number | null
          id?: string
          is_diet_break_week?: boolean | null
          new_daily_calories?: number | null
          notes?: string | null
          thigh_cm?: number | null
          tracked_accurately?: boolean | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          week_number?: number
          week_start_date?: string
          weight_change_kg?: number | null
          weight_change_percentage?: number | null
          weight_logs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "weekly_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          phase_id: string
          user_id: string
          week_number: number
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          log_date: string
          phase_id: string
          user_id: string
          week_number: number
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          phase_id?: string
          user_id?: string
          week_number?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "nutrition_phases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      coaches_client_safe: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
          profile_picture_url: string | null
          short_bio: string | null
          specializations: string[] | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          profile_picture_url?: string | null
          short_bio?: string | null
          specializations?: string[] | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          profile_picture_url?: string | null
          short_bio?: string | null
          specializations?: string[] | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches_directory: {
        Row: {
          bio: string | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          location: string | null
          nickname: string | null
          profile_picture_url: string | null
          qualifications: string[] | null
          short_bio: string | null
          specializations: string[] | null
          specialties: Database["public"]["Enums"]["staff_specialty"][] | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          location?: string | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          location?: string | null
          nickname?: string | null
          profile_picture_url?: string | null
          qualifications?: string[] | null
          short_bio?: string | null
          specializations?: string[] | null
          specialties?: Database["public"]["Enums"]["staff_specialty"][] | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coaches_directory_admin: {
        Row: {
          bio: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          instagram_url: string | null
          last_assigned_at: string | null
          last_name: string | null
          location: string | null
          max_onetoone_clients: number | null
          max_team_clients: number | null
          nickname: string | null
          phone: string | null
          profile_picture_url: string | null
          qualifications: string[] | null
          short_bio: string | null
          snapchat_url: string | null
          specializations: string[] | null
          specialties: Database["public"]["Enums"]["staff_specialty"][] | null
          status: string | null
          tiktok_url: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
          youtube_url: string | null
        }
        Relationships: []
      }
      coaches_full: {
        Row: {
          bio: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          instagram_url: string | null
          last_assigned_at: string | null
          last_name: string | null
          location: string | null
          max_onetoone_clients: number | null
          max_team_clients: number | null
          nickname: string | null
          phone: string | null
          profile_picture_url: string | null
          qualifications: string[] | null
          short_bio: string | null
          snapchat_url: string | null
          specializations: string[] | null
          specialties: Database["public"]["Enums"]["staff_specialty"][] | null
          status: string | null
          tiktok_url: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
          youtube_url: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activation_completed_at: string | null
          avatar_url: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          last_name: string | null
          onboarding_completed_at: string | null
          payment_deadline: string | null
          payment_exempt: boolean | null
          phone: string | null
          signup_completed_at: string | null
          status: Database["public"]["Enums"]["account_status"] | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_get_coaches_directory: {
        Args: never
        Returns: {
          bio: string
          created_at: string
          date_of_birth: string
          display_name: string
          email: string
          first_name: string
          gender: string
          id: string
          instagram_url: string
          last_assigned_at: string
          last_name: string
          location: string
          max_onetoone_clients: number
          max_team_clients: number
          nickname: string
          phone: string
          profile_picture_url: string
          qualifications: string[]
          short_bio: string
          snapchat_url: string
          specializations: string[]
          specialties: Database["public"]["Enums"]["staff_specialty"][]
          status: string
          tiktok_url: string
          updated_at: string
          user_id: string
          whatsapp_number: string
          youtube_url: string
        }[]
      }
      admin_get_coaches_full: {
        Args: never
        Returns: {
          bio: string
          created_at: string
          date_of_birth: string
          display_name: string
          email: string
          first_name: string
          gender: string
          id: string
          instagram_url: string
          last_assigned_at: string
          last_name: string
          location: string
          max_onetoone_clients: number
          max_team_clients: number
          nickname: string
          phone: string
          profile_picture_url: string
          qualifications: string[]
          short_bio: string
          snapchat_url: string
          specializations: string[]
          specialties: Database["public"]["Enums"]["staff_specialty"][]
          status: string
          tiktok_url: string
          updated_at: string
          user_id: string
          whatsapp_number: string
          youtube_url: string
        }[]
      }
      admin_get_profile_private: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          date_of_birth: string
          email: string
          full_name: string
          gender: string
          id: string
          last_name: string
          phone: string
          updated_at: string
        }[]
      }
      bootstrap_admin: { Args: { admin_email: string }; Returns: string }
      calculate_age: { Args: { birth_date: string }; Returns: number }
      can_access_video: { Args: { p_video_id: string }; Returns: boolean }
      can_edit_nutrition: {
        Args: { p_actor_uid: string; p_client_uid: string }
        Returns: boolean
      }
      can_manage_care_team: {
        Args: { p_subscription_id: string; p_user_id: string }
        Returns: boolean
      }
      check_failed_payments: { Args: never; Returns: undefined }
      check_legacy_table_security: {
        Args: never
        Returns: {
          allows_non_admin: boolean
          issue_description: string
          policy_name: string
          table_name: string
        }[]
      }
      cleanup_expired_discount_applications: { Args: never; Returns: number }
      client_has_dietitian: { Args: { p_client_uid: string }; Returns: boolean }
      decrypt_phi_boolean: {
        Args: { encrypted_text: string }
        Returns: boolean
      }
      decrypt_phi_date: { Args: { encrypted_text: string }; Returns: string }
      decrypt_phi_text: { Args: { encrypted_text: string }; Returns: string }
      decrypt_phi_text_logged: {
        Args: {
          encrypted_text: string
          p_actor_user_id: string
          p_field_name?: string
          p_target_user_id?: string
        }
        Returns: string
      }
      discharge_care_team_member: {
        Args: {
          p_assignment_id: string
          p_notes?: string
          p_reason_code: Database["public"]["Enums"]["care_team_end_reason"]
        }
        Returns: boolean
      }
      discount_code_hash: { Args: { p_code: string }; Returns: string }
      encrypt_phi_boolean: { Args: { bool_value: boolean }; Returns: string }
      encrypt_phi_date: { Args: { date_value: string }; Returns: string }
      encrypt_phi_text: { Args: { plain_text: string }; Returns: string }
      get_active_care_team_for_date: {
        Args: { p_day_date: string; p_subscription_id: string }
        Returns: {
          module_type: string
          specialty: string
          staff_user_id: string
        }[]
      }
      get_admin_analytics: {
        Args: never
        Returns: {
          active_subscriptions: number
          new_signups_week: number
          pending_approvals: number
          pending_testimonials: number
          total_monthly_revenue: number
        }[]
      }
      get_client_from_day_module: {
        Args: { p_module_id: string }
        Returns: string
      }
      get_client_from_module_exercise: {
        Args: { p_exercise_id: string }
        Returns: string
      }
      get_client_from_program: {
        Args: { p_program_id: string }
        Returns: string
      }
      get_client_from_program_day: {
        Args: { p_day_id: string }
        Returns: string
      }
      get_client_from_thread: { Args: { p_thread_id: string }; Returns: string }
      get_client_medical_flags: {
        Args: { p_client_user_id: string }
        Returns: {
          admin_summary: string
          has_injuries_noted: boolean
          medical_cleared: boolean
          medical_cleared_at: string
          needs_medical_review: boolean
          submission_date: string
        }[]
      }
      get_coach_analytics: {
        Args: { coach_user_id: string }
        Returns: {
          active_clients: number
          new_clients_week: number
          pending_documents: number
          pending_requests: number
          total_clients: number
        }[]
      }
      get_coach_client_tenure: {
        Args: { p_client_uid: string; p_coach_uid: string }
        Returns: {
          ended_at: string
          is_active: boolean
          relationship_id: string
          role: string
          started_at: string
        }[]
      }
      get_decrypted_form_submission: {
        Args: { submission_id: string }
        Returns: {
          created_at: string
          date_of_birth: string
          email: string
          first_name: string
          form_type: string
          id: string
          last_name: string
          parq_additional_details: string
          parq_balance_dizziness: boolean
          parq_bone_joint_problem: boolean
          parq_chest_pain_active: boolean
          parq_chest_pain_inactive: boolean
          parq_heart_condition: boolean
          parq_injuries_conditions: string
          parq_medication: boolean
          parq_other_reason: boolean
          phone_number: string
          plan_name: string
          submission_status: string
          training_experience: string
          training_goals: string
          user_id: string
        }[]
      }
      get_default_column_config: { Args: { p_coach_id: string }; Returns: Json }
      get_educational_videos_with_access: {
        Args: never
        Returns: {
          access_state: string
          category: string
          created_at: string
          description: string
          id: string
          is_completed: boolean
          is_free_preview: boolean
          is_pinned: boolean
          title: string
        }[]
      }
      get_form_submission_phi: {
        Args: { p_submission_id: string }
        Returns: {
          date_of_birth: string
          email: string
          first_name: string
          id: string
          last_name: string
          needs_medical_review: boolean
          parq_additional_details: string
          parq_balance_dizziness: boolean
          parq_bone_joint_problem: boolean
          parq_chest_pain_active: boolean
          parq_chest_pain_inactive: boolean
          parq_heart_condition: boolean
          parq_injuries_conditions: string
          parq_medication: boolean
          parq_other_reason: boolean
          phone_number: string
          user_id: string
        }[]
      }
      get_module_owner_from_day_module: {
        Args: { p_module_id: string }
        Returns: string
      }
      get_module_owner_from_exercise: {
        Args: { p_exercise_id: string }
        Returns: string
      }
      get_module_owner_from_thread: {
        Args: { p_thread_id: string }
        Returns: string
      }
      get_my_coach_profile: {
        Args: never
        Returns: {
          bio: string
          created_at: string
          date_of_birth: string
          display_name: string
          email: string
          first_name: string
          gender: string
          id: string
          instagram_url: string
          last_name: string
          location: string
          max_onetoone_clients: number
          max_team_clients: number
          nickname: string
          phone: string
          profile_picture_url: string
          qualifications: string[]
          short_bio: string
          snapchat_url: string
          specializations: string[]
          specialties: Database["public"]["Enums"]["staff_specialty"][]
          status: string
          tiktok_url: string
          updated_at: string
          user_id: string
          whatsapp_number: string
          youtube_url: string
        }[]
      }
      get_my_latest_form_submission_phi: {
        Args: never
        Returns: {
          created_at: string
          date_of_birth: string
          email: string
          first_name: string
          id: string
          last_name: string
          needs_medical_review: boolean
          parq_additional_details: string
          parq_balance_dizziness: boolean
          parq_bone_joint_problem: boolean
          parq_chest_pain_active: boolean
          parq_chest_pain_inactive: boolean
          parq_heart_condition: boolean
          parq_injuries_conditions: string
          parq_medication: boolean
          parq_other_reason: boolean
          phone_number: string
          user_id: string
        }[]
      }
      get_my_profile_private: {
        Args: never
        Returns: {
          created_at: string
          date_of_birth: string
          email: string
          full_name: string
          gender: string
          id: string
          last_name: string
          phone: string
          updated_at: string
        }[]
      }
      get_phi_encryption_key: { Args: never; Returns: string }
      get_policies_with_true_qual: {
        Args: never
        Returns: {
          cmd: string
          policyname: unknown
          qual: string
          roles: unknown[]
          schemaname: unknown
          tablename: unknown
        }[]
      }
      get_rls_audit_report: {
        Args: never
        Returns: {
          delete_access: string
          insert_access: string
          pii_phi_table: boolean
          rls_enabled: boolean
          select_access: string
          table_name: string
          update_access: string
        }[]
      }
      get_tables_without_rls: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_views_without_security_invoker: {
        Args: never
        Returns: {
          reloptions: string[]
          view_name: string
        }[]
      }
      has_active_care_team_access: {
        Args: { p_staff_uid: string; p_subscription_id: string }
        Returns: boolean
      }
      has_active_coach_access_to_client: {
        Args: { p_client_uid: string; p_coach_uid: string }
        Returns: boolean
      }
      has_active_coach_relationship: {
        Args: { p_client_uid: string; p_coach_uid: string; p_role?: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_grant_usage: {
        Args: { p_code_id: string; p_user_id: string }
        Returns: undefined
      }
      is_active_coach_for_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_admin_internal: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_coach_for_user: {
        Args: { p_actor_uid: string; p_client_uid: string }
        Returns: boolean
      }
      is_care_team_member_for_client: {
        Args: { p_client_uid: string; p_staff_uid: string }
        Returns: boolean
      }
      is_coach: { Args: { p_user_id: string }; Returns: boolean }
      is_coach_for_client: {
        Args: { client_user_id: string }
        Returns: boolean
      }
      is_coach_for_submission: {
        Args: { submission_user_id: string }
        Returns: boolean
      }
      is_dietitian: { Args: { p_user_id: string }; Returns: boolean }
      is_dietitian_for_client: {
        Args: { p_client_uid: string; p_dietitian_uid: string }
        Returns: boolean
      }
      is_module_owner: {
        Args: { p_module_owner_coach_id: string; p_user_id: string }
        Returns: boolean
      }
      is_on_active_care_team_for_client: {
        Args: { p_client_uid: string; p_staff_uid: string }
        Returns: boolean
      }
      is_primary_coach_for_subscription: {
        Args: { p_subscription_id: string; p_user_id: string }
        Returns: boolean
      }
      is_primary_coach_for_user: {
        Args: { p_client_uid: string; p_coach_uid: string }
        Returns: boolean
      }
      log_approval_action: {
        Args: {
          p_action_type: string
          p_actor_role: string
          p_actor_user_id: string
          p_ip_address?: string
          p_metadata?: Json
          p_new_status?: string
          p_previous_status?: string
          p_reason?: string
          p_target_subscription_id?: string
          p_target_user_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      log_phi_access: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_fields_accessed?: string[]
          p_ip_address?: string
          p_metadata?: Json
          p_request_id?: string
          p_resource_id?: string
          p_resource_type?: string
          p_target_user_id: string
          p_user_agent?: string
        }
        Returns: string
      }
      log_phi_access_by_role: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_fields_accessed?: string[]
          p_metadata?: Json
          p_resource_type: string
          p_target_user_id: string
        }
        Returns: string
      }
      mark_care_team_message_read: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      mark_video_complete: { Args: { p_video_id: string }; Returns: boolean }
      process_care_team_discharges: { Args: never; Returns: number }
      scan_phi_plaintext_violations: {
        Args: never
        Returns: {
          description: string
          field_name: string
          record_count: number
          severity: string
          violation_type: string
        }[]
      }
      set_client_medical_clearance: {
        Args: {
          p_cleared: boolean
          p_client_user_id: string
          p_summary?: string
        }
        Returns: boolean
      }
      should_create_module_for_specialist: {
        Args: {
          p_day_date: string
          p_staff_user_id: string
          p_subscription_id: string
        }
        Returns: boolean
      }
      terminate_care_team_member: {
        Args: {
          p_assignment_id: string
          p_notes: string
          p_reason_code: Database["public"]["Enums"]["care_team_end_reason"]
        }
        Returns: boolean
      }
      update_my_profile_private: {
        Args: {
          p_date_of_birth?: string
          p_email?: string
          p_full_name?: string
          p_gender?: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: boolean
      }
      user_has_video_entitlement: {
        Args: { p_video_id: string }
        Returns: boolean
      }
      validate_discount_code: {
        Args: { p_code: string; p_service_id: string; p_user_id: string }
        Returns: {
          amount_off_kwd: number
          code_id: string
          is_valid: boolean
          percent_off: number
          reason: string
        }[]
      }
      verify_phi_view_isolation: {
        Args: never
        Returns: {
          has_anon_access: boolean
          has_authenticated_access: boolean
          is_secure: boolean
          view_name: string
        }[]
      }
      video_prerequisite_met: { Args: { p_video_id: string }; Returns: boolean }
      was_coach_during_record: {
        Args: {
          p_client_id: string
          p_coach_id_at_creation: string
          p_record_created_at: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_status:
        | "pending"
        | "active"
        | "suspended"
        | "approved"
        | "needs_medical_review"
        | "pending_payment"
        | "cancelled"
        | "expired"
        | "pending_coach_approval"
        | "inactive"
      app_role: "member" | "coach" | "admin" | "dietitian"
      billing_mode: "manual" | "recurring"
      care_team_end_reason:
        | "subscription_cancelled"
        | "addon_cancelled"
        | "coach_request"
        | "client_request"
        | "admin_override"
        | "for_cause_performance"
        | "for_cause_conduct"
        | "for_cause_other"
        | "replaced"
      care_team_role:
        | "primary_coach"
        | "nutrition"
        | "lifestyle"
        | "bodybuilding"
        | "powerlifting"
        | "running"
        | "mobility"
        | "physiotherapist"
        | "other"
      care_team_status:
        | "active"
        | "scheduled_end"
        | "terminated_for_cause"
        | "ended"
      client_module_status: "scheduled" | "available" | "completed" | "skipped"
      client_program_status: "active" | "paused" | "ended"
      discount_applies_to: "first_payment" | "all_payments" | "limited_payments"
      exercise_category:
        | "strength"
        | "cardio"
        | "mobility"
        | "physio"
        | "warmup"
        | "cooldown"
      exercise_media_type: "video" | "image"
      exercise_section: "warmup" | "main" | "accessory" | "cooldown"
      fee_type: "percent" | "fixed" | "none"
      form_type:
        | "one_to_one_in_person"
        | "one_to_one_online"
        | "buns_of_steel"
        | "fe_squad"
        | "one_to_one_hybrid"
      intensity_type: "RIR" | "RPE" | "PERCENT_1RM" | "TARGET_LOAD" | "OTHER"
      module_status: "draft" | "published"
      nutrition_approach:
        | "calorie_counting"
        | "macros_calories"
        | "intuitive_eating"
        | "not_sure"
      payment_status: "initiated" | "paid" | "failed" | "cancelled"
      payout_recipient: "primary_coach" | "addon_staff"
      payout_type: "percent" | "fixed"
      program_level: "beginner" | "intermediate" | "advanced"
      program_visibility: "private" | "shared"
      referral_source: "instagram" | "tiktok" | "friend_referral" | "other"
      service_type: "team" | "one_to_one"
      session_timing: "morning" | "afternoon" | "evening" | "anytime"
      session_type:
        | "strength"
        | "cardio"
        | "hiit"
        | "mobility"
        | "recovery"
        | "sport_specific"
        | "other"
      staff_specialty:
        | "nutrition"
        | "lifestyle"
        | "bodybuilding"
        | "powerlifting"
        | "running"
        | "calisthenics"
        | "mobility"
        | "physiotherapy"
        | "dietitian"
      thread_author_role: "client" | "coach"
      training_experience:
        | "beginner_0_6"
        | "intermediate_6_24"
        | "advanced_24_plus"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: [
        "pending",
        "active",
        "suspended",
        "approved",
        "needs_medical_review",
        "pending_payment",
        "cancelled",
        "expired",
        "pending_coach_approval",
        "inactive",
      ],
      app_role: ["member", "coach", "admin", "dietitian"],
      billing_mode: ["manual", "recurring"],
      care_team_end_reason: [
        "subscription_cancelled",
        "addon_cancelled",
        "coach_request",
        "client_request",
        "admin_override",
        "for_cause_performance",
        "for_cause_conduct",
        "for_cause_other",
        "replaced",
      ],
      care_team_role: [
        "primary_coach",
        "nutrition",
        "lifestyle",
        "bodybuilding",
        "powerlifting",
        "running",
        "mobility",
        "physiotherapist",
        "other",
      ],
      care_team_status: [
        "active",
        "scheduled_end",
        "terminated_for_cause",
        "ended",
      ],
      client_module_status: ["scheduled", "available", "completed", "skipped"],
      client_program_status: ["active", "paused", "ended"],
      discount_applies_to: [
        "first_payment",
        "all_payments",
        "limited_payments",
      ],
      exercise_category: [
        "strength",
        "cardio",
        "mobility",
        "physio",
        "warmup",
        "cooldown",
      ],
      exercise_media_type: ["video", "image"],
      exercise_section: ["warmup", "main", "accessory", "cooldown"],
      fee_type: ["percent", "fixed", "none"],
      form_type: [
        "one_to_one_in_person",
        "one_to_one_online",
        "buns_of_steel",
        "fe_squad",
        "one_to_one_hybrid",
      ],
      intensity_type: ["RIR", "RPE", "PERCENT_1RM", "TARGET_LOAD", "OTHER"],
      module_status: ["draft", "published"],
      nutrition_approach: [
        "calorie_counting",
        "macros_calories",
        "intuitive_eating",
        "not_sure",
      ],
      payment_status: ["initiated", "paid", "failed", "cancelled"],
      payout_recipient: ["primary_coach", "addon_staff"],
      payout_type: ["percent", "fixed"],
      program_level: ["beginner", "intermediate", "advanced"],
      program_visibility: ["private", "shared"],
      referral_source: ["instagram", "tiktok", "friend_referral", "other"],
      service_type: ["team", "one_to_one"],
      session_timing: ["morning", "afternoon", "evening", "anytime"],
      session_type: [
        "strength",
        "cardio",
        "hiit",
        "mobility",
        "recovery",
        "sport_specific",
        "other",
      ],
      staff_specialty: [
        "nutrition",
        "lifestyle",
        "bodybuilding",
        "powerlifting",
        "running",
        "calisthenics",
        "mobility",
        "physiotherapy",
        "dietitian",
      ],
      thread_author_role: ["client", "coach"],
      training_experience: [
        "beginner_0_6",
        "intermediate_6_24",
        "advanced_24_plus",
      ],
    },
  },
} as const
A new version of Supabase CLI is available: v2.75.0 (currently installed v2.72.7)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
