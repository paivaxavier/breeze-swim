export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string
          primary_name: string
          primary_email: string
          primary_phone: string | null
          pool_address: string | null
          gate_instructions: string | null
          zelle_instructions: string | null
          is_returning: boolean
          notes_edit_pending: boolean
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['families']['Row']> & {
          primary_name: string
          primary_email: string
        }
        Update: Partial<Database['public']['Tables']['families']['Row']>
      }
      swimmers: {
        Row: {
          id: string
          family_id: string
          name: string
          date_of_birth: string | null
          status: 'active' | 'former' | 'waitlist'
          adaptive_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['swimmers']['Row']> & {
          family_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['swimmers']['Row']>
      }
      enrollments: {
        Row: {
          id: string
          swimmer_id: string
          start_date: string | null
          end_date: string | null
          lesson_time: string | null
          location: 'bunnell' | 'client_pool'
          program_weeks: number | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['enrollments']['Row']> & {
          swimmer_id: string
        }
        Update: Partial<Database['public']['Tables']['enrollments']['Row']>
      }
      profiles: {
        Row: {
          id: string
          role: 'admin' | 'parent_primary' | 'parent_guest'
          family_id: string | null
          full_name: string | null
          phone: string | null
          welcome_type: 'full' | 'short' | null
          welcome_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
      }
      family_invites: {
        Row: {
          id: string
          family_id: string
          email: string
          token: string
          invite_role: 'primary' | 'guest'
          invited_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['family_invites']['Row']> & {
          family_id: string
          email: string
        }
        Update: Partial<Database['public']['Tables']['family_invites']['Row']>
      }
      welcome_progress: {
        Row: {
          id: string
          profile_id: string
          step_key: string
          completed_at: string
          step_data: Json
        }
        Insert: {
          profile_id: string
          step_key: string
          step_data?: Json
        }
        Update: Partial<Database['public']['Tables']['welcome_progress']['Row']>
      }
      admin_notifications: {
        Row: {
          id: string
          family_id: string
          notification_type: string
          message: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          family_id: string
          notification_type: string
          message: string
        }
        Update: Partial<Database['public']['Tables']['admin_notifications']['Row']>
      }
    }
    Functions: {
      get_invite_by_token: {
        Args: { invite_token: string }
        Returns: {
          invite_id: string
          family_id: string
          email: string
          invite_role: 'primary' | 'guest'
          accepted_at: string | null
          family_name: string
          is_returning: boolean
        }[]
      }
      accept_family_invite: {
        Args: { invite_token: string }
        Returns: Json
      }
      complete_welcome_step: {
        Args: { p_step_key: string; p_step_data?: Json }
        Returns: undefined
      }
      finish_welcome: {
        Args: Record<string, never>
        Returns: undefined
      }
      update_swimmer_with_notification: {
        Args: { p_swimmer_id: string; p_adaptive_notes: string }
        Returns: undefined
      }
    }
  }
}
