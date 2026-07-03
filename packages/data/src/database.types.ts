// @giokon/data — Supabase DB 타입
//
// ⚠️ 임시 수기 작성본. Supabase 프로젝트 연결 후
//   `supabase gen types typescript --local > database.types.ts`
// 로 자동 생성본으로 교체한다. 스키마 출처: supabase/migrations/*.
// (20260521131723_initial_schema + 20260624090000_supabase_auth_rls
//  + 20260703120000_organizations_rbac + 20260703130000_audit_log
//  + 20260703140000_consents + 20260703150000_consent_retention)
//
// 참고: org_id 는 NOT NULL 이지만 INSERT 시 스탬프 트리거(app.stamp_org_id)가
// 자동 채우므로 Insert 타입에서는 선택(optional)으로 둔다.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          name: string
          email: string
          org_id: string
          role: Database['public']['Enums']['org_role']
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          email: string
          org_id?: string
          role?: Database['public']['Enums']['org_role']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          org_id?: string
          role?: Database['public']['Enums']['org_role']
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          org_id: string
          name: string
          birth_year: number
          hometown: string | null
          job: string | null
          family: string | null
          memories: string[]
          hobbies: string | null
          guardian_name: string | null
          guardian_relation: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id?: string
          name: string
          birth_year: number
          hometown?: string | null
          job?: string | null
          family?: string | null
          memories?: string[]
          hobbies?: string | null
          guardian_name?: string | null
          guardian_relation?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          org_id?: string
          name?: string
          birth_year?: number
          hometown?: string | null
          job?: string | null
          family?: string | null
          memories?: string[]
          hobbies?: string | null
          guardian_name?: string | null
          guardian_relation?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chronicle_entries: {
        Row: {
          id: string
          profile_id: string
          user_id: string
          org_id: string
          topic: string
          content: string
          keywords: string[]
          source: Database['public']['Enums']['chronicle_source']
          recorded_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          user_id: string
          org_id?: string
          topic: string
          content: string
          keywords?: string[]
          source?: Database['public']['Enums']['chronicle_source']
          recorded_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          user_id?: string
          org_id?: string
          topic?: string
          content?: string
          keywords?: string[]
          source?: Database['public']['Enums']['chronicle_source']
          recorded_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          profile_id: string
          user_id: string
          org_id: string
          status: Database['public']['Enums']['session_status']
          turn_count: number
          duration_seconds: number | null
          current_topic: string | null
          started_at: string
          ended_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          user_id: string
          org_id?: string
          status?: Database['public']['Enums']['session_status']
          turn_count?: number
          duration_seconds?: number | null
          current_topic?: string | null
          started_at?: string
          ended_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          user_id?: string
          org_id?: string
          status?: Database['public']['Enums']['session_status']
          turn_count?: number
          duration_seconds?: number | null
          current_topic?: string | null
          started_at?: string
          ended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      session_logs: {
        Row: {
          id: string
          session_id: string
          profile_id: string
          user_id: string
          org_id: string
          turn_index: number
          role: Database['public']['Enums']['session_log_role']
          content: string
          original_content: string | null
          topic: string | null
          switch_topic: boolean | null
          audio_url: string | null
          audio_expires_at: string | null
          duration_ms: number | null
          spoken_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          profile_id: string
          user_id: string
          org_id?: string
          turn_index: number
          role: Database['public']['Enums']['session_log_role']
          content: string
          original_content?: string | null
          topic?: string | null
          switch_topic?: boolean | null
          audio_url?: string | null
          audio_expires_at?: string | null
          duration_ms?: number | null
          spoken_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          profile_id?: string
          user_id?: string
          org_id?: string
          turn_index?: number
          role?: Database['public']['Enums']['session_log_role']
          content?: string
          original_content?: string | null
          topic?: string | null
          switch_topic?: boolean | null
          audio_url?: string | null
          audio_expires_at?: string | null
          duration_ms?: number | null
          spoken_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          profile_id: string | null
          consent_type: Database['public']['Enums']['consent_type']
          granted: boolean
          version: string
          subject_type: Database['public']['Enums']['consent_subject_type']
          guardian_name: string | null
          guardian_relation: string | null
          capacity: Database['public']['Enums']['consent_capacity']
          basis: string | null
          voice_record_url: string | null
          granted_at: string
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          user_id: string
          profile_id?: string | null
          consent_type: Database['public']['Enums']['consent_type']
          granted: boolean
          version: string
          subject_type?: Database['public']['Enums']['consent_subject_type']
          guardian_name?: string | null
          guardian_relation?: string | null
          capacity?: Database['public']['Enums']['consent_capacity']
          basis?: string | null
          voice_record_url?: string | null
          granted_at?: string
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          profile_id?: string | null
          consent_type?: Database['public']['Enums']['consent_type']
          granted?: boolean
          version?: string
          subject_type?: Database['public']['Enums']['consent_subject_type']
          guardian_name?: string | null
          guardian_relation?: string | null
          capacity?: Database['public']['Enums']['consent_capacity']
          basis?: string | null
          voice_record_url?: string | null
          granted_at?: string
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          occurred_at: string
          actor_id: string | null
          org_id: string | null
          action: string
          table_name: string | null
          record_id: string | null
          ip: string | null
          user_agent: string | null
          detail: Json | null
        }
        Insert: {
          id?: never
          occurred_at?: string
          actor_id?: string | null
          org_id?: string | null
          action: string
          table_name?: string | null
          record_id?: string | null
          ip?: string | null
          user_agent?: string | null
          detail?: Json | null
        }
        Update: {
          id?: never
          occurred_at?: string
          actor_id?: string | null
          org_id?: string | null
          action?: string
          table_name?: string | null
          record_id?: string | null
          ip?: string | null
          user_agent?: string | null
          detail?: Json | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      chronicle_source: 'caregiver' | 'ai'
      session_status: 'active' | 'ended'
      session_log_role: 'ai' | 'user'
      org_role: 'org_admin' | 'caregiver' | 'guardian'
      consent_type:
        | 'privacy_required'
        | 'sensitive_health_voice'
        | 'cross_border_transfer'
        | 'ai_processing'
        | 'marketing_optional'
      consent_subject_type: 'self' | 'guardian' | 'legal_representative'
      consent_capacity: 'capable' | 'limited' | 'incapable' | 'unknown'
    }
    CompositeTypes: { [_ in never]: never }
  }
}

// 편의 별칭 ──────────────────────────────────────────────────────────────
type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> =
  PublicSchema['Enums'][T]

export type OrganizationRow = Tables<'organizations'>
export type UserRow = Tables<'users'>
export type OrgRole = Enums<'org_role'>
export type ProfileRow = Tables<'profiles'>
export type ChronicleRow = Tables<'chronicle_entries'>
export type SessionRow = Tables<'sessions'>
export type SessionLogRow = Tables<'session_logs'>
export type ConsentRow = Tables<'consents'>
export type ConsentType = Enums<'consent_type'>
export type ConsentSubjectType = Enums<'consent_subject_type'>
export type ConsentCapacity = Enums<'consent_capacity'>
export type AuditLogRow = Tables<'audit_log'>
