// @giokon/data — Supabase DB 타입
//
// ⚠️ 임시 수기 작성본. Supabase 프로젝트 연결 후
//   `supabase gen types typescript --local > database.types.ts`
// 로 자동 생성본으로 교체한다. 스키마 출처: supabase/migrations/*.
// (20260521131723_initial_schema + 20260624090000_supabase_auth_rls
//  + 20260703120000_organizations_rbac + 20260703130000_audit_log
//  + 20260703140000_consents + 20260703150000_consent_retention
//  + 20260711100000_safety_events + 20260718100000_safety_events_guardian_rls
//  + 20260718110000_auth_onboarding + 20260718120000_guardian_links
//  + 20260718125000_realtime_publication
//  + 20260718130000_session_analyses + 20260718140000_care_journals
//  + 20260718150000_guardian_shares + 20260831000000_share_view_receipt
//  + 20260901000000_profile_note + 20260901010000_notifications
//  + 20260901020000_messages)
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
          email: string | null
          org_id: string | null
          role: Database['public']['Enums']['org_role']
          phone: string | null
          onboarded_at: string | null
          is_site_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          email?: string | null
          org_id?: string | null
          role?: Database['public']['Enums']['org_role']
          phone?: string | null
          onboarded_at?: string | null
          is_site_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          org_id?: string | null
          role?: Database['public']['Enums']['org_role']
          phone?: string | null
          onboarded_at?: string | null
          is_site_admin?: boolean
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
          /** 생년월일. 입력의 단일 근거(birth_year 는 파생). 월·일 미상이면 null. */
          birth_date: string | null
          hometown: string | null
          job: string | null
          family: string | null
          hobbies: string | null
          guardian_name: string | null
          guardian_relation: string | null
          /** Storage elder-photos 내 경로(private 버킷 — 조회는 signed URL). */
          photo_path: string | null
          /** 어르신 성별(선택). 화면 표기는 앱에서 매핑. */
          gender: Database['public']['Enums']['elder_gender'] | null
          /** 돌봄에서 참고할 메모(특이사항). 최대 500자 — 건강 상태를 적는 칸이 아니다. */
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id?: string
          name: string
          birth_year: number
          birth_date?: string | null
          hometown?: string | null
          job?: string | null
          family?: string | null
          hobbies?: string | null
          guardian_name?: string | null
          guardian_relation?: string | null
          photo_path?: string | null
          gender?: Database['public']['Enums']['elder_gender'] | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          org_id?: string
          name?: string
          birth_year?: number
          birth_date?: string | null
          hometown?: string | null
          job?: string | null
          family?: string | null
          hobbies?: string | null
          guardian_name?: string | null
          guardian_relation?: string | null
          photo_path?: string | null
          gender?: Database['public']['Enums']['elder_gender'] | null
          note?: string | null
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
          title: string | null
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
          title?: string | null
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
          title?: string | null
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
          title: string | null
          goal: string | null
          content: string | null
          avoid_topics: string | null
          keywords: string[]
          duration_minutes: number | null
          planned_date: string | null
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
          title?: string | null
          goal?: string | null
          content?: string | null
          avoid_topics?: string | null
          keywords?: string[]
          duration_minutes?: number | null
          planned_date?: string | null
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
          title?: string | null
          goal?: string | null
          content?: string | null
          avoid_topics?: string | null
          keywords?: string[]
          duration_minutes?: number | null
          planned_date?: string | null
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
      safety_events: {
        Row: {
          id: string
          org_id: string
          user_id: string | null
          profile_id: string
          session_id: string | null
          level: Database['public']['Enums']['safety_event_level']
          categories: string[]
          matched_terms: string[]
          excerpt: string | null
          caregiver_alert: string
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          user_id?: string | null
          profile_id: string
          session_id?: string | null
          level: Database['public']['Enums']['safety_event_level']
          categories?: string[]
          matched_terms?: string[]
          excerpt?: string | null
          caregiver_alert: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string | null
          profile_id?: string
          session_id?: string | null
          level?: Database['public']['Enums']['safety_event_level']
          categories?: string[]
          matched_terms?: string[]
          excerpt?: string | null
          caregiver_alert?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
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
      profile_guardians: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          guardian_user_id: string
          status: Database['public']['Enums']['guardian_link_status']
          approved_by: string | null
          approved_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          guardian_user_id: string
          status?: Database['public']['Enums']['guardian_link_status']
          approved_by?: string | null
          approved_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          guardian_user_id?: string
          status?: Database['public']['Enums']['guardian_link_status']
          approved_by?: string | null
          approved_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      elder_codes: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          code: string
          rotated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          code?: string
          rotated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          code?: string
          rotated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_caregivers: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          caregiver_user_id: string
          status: Database['public']['Enums']['caregiver_assignment_status']
          assigned_by: string | null
          assigned_at: string
          removed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          caregiver_user_id: string
          status?: Database['public']['Enums']['caregiver_assignment_status']
          assigned_by?: string | null
          assigned_at?: string
          removed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          caregiver_user_id?: string
          status?: Database['public']['Enums']['caregiver_assignment_status']
          assigned_by?: string | null
          assigned_at?: string
          removed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_analyses: {
        Row: {
          id: string
          org_id: string
          session_id: string
          profile_id: string
          user_id: string | null
          analysis: Json
          version: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          session_id: string
          profile_id: string
          user_id?: string | null
          analysis: Json
          version: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          session_id?: string
          profile_id?: string
          user_id?: string | null
          analysis?: Json
          version?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      care_journals: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          author_id: string | null
          journal_date: string
          content: string
          source: Database['public']['Enums']['journal_source']
          photo_path: string | null
          status: Database['public']['Enums']['journal_status']
          /** 활동 시작·종료 시각(HH:MM:SS). 미입력이면 null — 0시가 아니다. */
          activity_from: string | null
          activity_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          author_id?: string | null
          journal_date?: string
          content: string
          source?: Database['public']['Enums']['journal_source']
          photo_path?: string | null
          status?: Database['public']['Enums']['journal_status']
          activity_from?: string | null
          activity_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          author_id?: string | null
          journal_date?: string
          content?: string
          source?: Database['public']['Enums']['journal_source']
          photo_path?: string | null
          status?: Database['public']['Enums']['journal_status']
          activity_from?: string | null
          activity_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      journal_photos: {
        Row: {
          id: string
          org_id: string
          journal_id: string
          path: string
          caption: string | null
          sort: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          journal_id: string
          path: string
          caption?: string | null
          sort?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          journal_id?: string
          path?: string
          caption?: string | null
          sort?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      guardian_shares: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          item_type: Database['public']['Enums']['share_item_type']
          item_id: string
          note: string | null
          shared_by: string | null
          shared_at: string
          revoked_at: string | null
          revoked_by: string | null
          viewed_at: string | null
          viewed_by: string | null
          view_count: number
          notify_on_view: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          item_type: Database['public']['Enums']['share_item_type']
          item_id: string
          note?: string | null
          shared_by?: string | null
          shared_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
          view_count?: number
          notify_on_view?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          profile_id?: string
          item_type?: Database['public']['Enums']['share_item_type']
          item_id?: string
          note?: string | null
          shared_by?: string | null
          shared_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          viewed_at?: string | null
          viewed_by?: string | null
          view_count?: number
          notify_on_view?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // 보호자 메시지(20260901020000_messages) — 보호자 → 담당 요양보호사 단방향.
      // append-only(Update 정책 없음)라 Update 타입도 두지 않는다.
      messages: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          sender_user_id: string | null
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          sender_user_id: string
          body: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      // 알림(20260901010000_notifications) — 사람이 만들지 않고 트리거가 파생한다.
      // INSERT 정책이 없어 클라이언트는 읽기·읽음 처리(update)만 가능하다.
      notifications: {
        Row: {
          id: string
          org_id: string
          user_id: string
          kind: Database['public']['Enums']['notification_kind']
          profile_id: string | null
          source_id: string | null
          title: string
          body: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          user_id: string
          kind: Database['public']['Enums']['notification_kind']
          profile_id?: string | null
          source_id?: string | null
          title: string
          body?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          kind?: Database['public']['Enums']['notification_kind']
          profile_id?: string | null
          source_id?: string | null
          title?: string
          body?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: { id: string; author_id: string; title: string; content: string; visibility: Database['public']['Enums']['inquiry_visibility']; status: Database['public']['Enums']['inquiry_status']; created_at: string; updated_at: string }
        Insert: { id?: string; author_id: string; title: string; content: string; visibility?: Database['public']['Enums']['inquiry_visibility']; status?: Database['public']['Enums']['inquiry_status']; created_at?: string; updated_at?: string }
        Update: { id?: string; author_id?: string; title?: string; content?: string; visibility?: Database['public']['Enums']['inquiry_visibility']; status?: Database['public']['Enums']['inquiry_status']; created_at?: string; updated_at?: string }
        Relationships: []
      }
      inquiry_replies: {
        Row: { id: string; inquiry_id: string; author_id: string; content: string; created_at: string; updated_at: string }
        Insert: { id?: string; inquiry_id: string; author_id: string; content: string; created_at?: string; updated_at?: string }
        Update: { id?: string; inquiry_id?: string; author_id?: string; content?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      /** 서버 전용: 서명·브라우저 쿠키 검증을 마친 네이버 콜백 보관. */
      store_naver_mobile_handoff: {
        Args: { p_id: string; p_challenge: string; p_code: string; p_state: string; p_expires_at: string }
        Returns: boolean
      }
      /** 서버 전용: S256 검증 후 일회성 인가 코드 소비. */
      consume_naver_mobile_handoff: {
        Args: { p_id: string; p_challenge: string }
        Returns: Json
      }
      /** Live 토큰 발급 자격 검증 및 사용자·기관·프로젝트 발급 한도 예약. */
      reserve_live_token: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      /** 보호자가 공개 항목을 열어 봤음을 기록한다(확인 시각·횟수·확인자). */
      mark_share_viewed: {
        Args: { p_share_id: string }
        Returns: Database['public']['Tables']['guardian_shares']['Row']
      }
      complete_onboarding: {
        Args: {
          p_name: string
          p_phone: string
          p_role: string
          p_org_name?: string | null
          p_elder_code?: string | null
          /** 온보딩 화면의 계정 필수 동의(consent_type 목록) — consents 적재(C2). */
          p_consents?: string[] | null
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      claim_elder_by_code: {
        Args: { p_code: string }
        Returns: Database['public']['Tables']['profile_caregivers']['Row']
      }
      link_guardian_by_elder_code: {
        Args: { p_code: string }
        Returns: Database['public']['Tables']['profile_guardians']['Row']
      }
      rotate_elder_code: {
        Args: { p_profile_id: string }
        Returns: Database['public']['Tables']['elder_codes']['Row']
      }
      approve_caregiver_assignment: {
        Args: { p_id: string }
        Returns: Database['public']['Tables']['profile_caregivers']['Row']
      }
      find_login_email: {
        Args: { p_name: string; p_phone: string }
        Returns: string | null
      }
      // 구 1회성 초대(폐기·감사 이력용). 신규 코드는 elder_codes 로 대체.
      list_inquiries: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Array<{ id: string; title: string; masked_author: string; visibility: Database['public']['Enums']['inquiry_visibility']; status: Database['public']['Enums']['inquiry_status']; created_at: string; reply_count: number; locked: boolean; total: number }>
      }
    }
    Enums: {
      chronicle_source: 'caregiver' | 'ai'
      session_status: 'planned' | 'active' | 'ended'
      session_log_role: 'ai' | 'user'
      elder_gender: 'female' | 'male'
      org_role: 'org_admin' | 'caregiver' | 'guardian'
      consent_type:
        | 'privacy_required'
        | 'sensitive_health_voice'
        | 'cross_border_transfer'
        | 'ai_processing'
        | 'marketing_optional'
      consent_subject_type: 'self' | 'guardian' | 'legal_representative'
      consent_capacity: 'capable' | 'limited' | 'incapable' | 'unknown'
      safety_event_level: 'watch' | 'crisis'
      guardian_link_status: 'pending' | 'approved' | 'revoked'
      caregiver_assignment_status: 'active' | 'removed' | 'pending'
      journal_source: 'photo' | 'voice' | 'typed' | 'ai_draft'
      journal_status: 'draft' | 'final'
      share_item_type: 'journal' | 'analysis' | 'session_summary' | 'report' | 'photo'
      inquiry_visibility: 'public' | 'private'
      inquiry_status: 'waiting' | 'answered'
      notification_kind: 'safety' | 'share_viewed' | 'message'
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
export type SafetyEventRow = Tables<'safety_events'>
export type SafetyEventLevel = Enums<'safety_event_level'>
export type ProfileGuardianRow = Tables<'profile_guardians'>
export type GuardianLinkStatus = Enums<'guardian_link_status'>
export type ElderCodeRow = Tables<'elder_codes'>
export type ProfileCaregiverRow = Tables<'profile_caregivers'>
export type CaregiverAssignmentStatus = Enums<'caregiver_assignment_status'>
export type SessionAnalysisRow = Tables<'session_analyses'>
export type CareJournalRow = Tables<'care_journals'>
export type JournalPhotoRow = Tables<'journal_photos'>
export type JournalSource = Enums<'journal_source'>
export type JournalStatus = Enums<'journal_status'>
export type GuardianShareRow = Tables<'guardian_shares'>
export type ShareItemType = Enums<'share_item_type'>
export type NotificationRow = Tables<'notifications'>
export type NotificationKind = Enums<'notification_kind'>
export type MessageRow = Tables<'messages'>
export type InquiryRow = Tables<'inquiries'>
export type InquiryReplyRow = Tables<'inquiry_replies'>
export type InquiryVisibility = Enums<'inquiry_visibility'>
export type InquiryStatus = Enums<'inquiry_status'>
