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
          /** 장기요양등급(D5). 미입력이면 null. */
          care_grade: Database['public']['Enums']['care_grade'] | null
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
          care_grade?: Database['public']['Enums']['care_grade'] | null
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
          care_grade?: Database['public']['Enums']['care_grade'] | null
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
          // 파일럿 D6(20260924040000) — **RPC 전용**(advance_session_phase·request_session_control).
          // 직접 INSERT/UPDATE 는 트리거가 거절하므로 Insert/Update 타입에는 넣지 않는다.
          phase: Database['public']['Enums']['session_phase'] | null
          phase_started_at: string | null
          paused_at: string | null
          paused_by: string | null
          pause_reason: string | null
          control_request: 'pause' | 'resume' | 'end' | null
          prompt_version: string | null
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
          transcript_provenance?: Json | null
          transcript_revisions?: Json
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
          transcript_provenance?: Json | null
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
      // 파일럿 D5(20260924070000) — 공단 서식 프로그램 일지. care_journals·journal_photos 는 삭제됐다.
      // finalized_*·guardian_text_approved_by·generation_* 는 서버가 채운다(클라이언트 값은 무시·거부) — Insert/Update 에서 뺐다.
      // 확정(status='final')은 사람 + 위임 권한(journal_finalize)만, 확정 뒤 수정은 edit_reason 필수(트리거).
      program_journals: {
        Row: {
          id: string
          org_id: string
          profile_id: string
          session_id: string | null
          status: Database['public']['Enums']['program_journal_status']
          journal_date: string
          operated_from: string | null
          operated_to: string | null
          program_type: string
          location: string | null
          facilitator_user_id: string | null
          participants: string | null
          goal: string | null
          activity_content: string | null
          participant_response: string | null
          opinion_collected: string | null
          overall_evaluation: string | null
          next_plan: string | null
          tool_used: string | null
          delivered: boolean
          non_delivery_reason: Database['public']['Enums']['journal_non_delivery_reason'] | null
          guardian_text: string | null
          guardian_text_approved_by: string | null
          guardian_text_approved_at: string | null
          finalized_by: string | null
          finalized_at: string | null
          draft_generated_at: string | null
          generation_attempts: number
          last_error: string | null
          edit_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          profile_id: string
          status?: 'pending_review' | 'final'
          journal_date?: string
          operated_from?: string | null
          operated_to?: string | null
          program_type?: string
          location?: string | null
          facilitator_user_id?: string | null
          participants?: string | null
          goal?: string | null
          activity_content?: string | null
          participant_response?: string | null
          opinion_collected?: string | null
          overall_evaluation?: string | null
          next_plan?: string | null
          tool_used?: string | null
          delivered?: boolean
          non_delivery_reason?: Database['public']['Enums']['journal_non_delivery_reason'] | null
          guardian_text?: string | null
          /** 값을 보내면 서버가 호출자·지금으로 승인한다(보낸 시각은 쓰지 않는다). */
          guardian_text_approved_at?: string | null
          draft_generated_at?: string | null
        }
        Update: {
          status?: 'pending_review' | 'final'
          journal_date?: string
          operated_from?: string | null
          operated_to?: string | null
          program_type?: string
          location?: string | null
          facilitator_user_id?: string | null
          participants?: string | null
          goal?: string | null
          activity_content?: string | null
          participant_response?: string | null
          opinion_collected?: string | null
          overall_evaluation?: string | null
          next_plan?: string | null
          tool_used?: string | null
          delivered?: boolean
          non_delivery_reason?: Database['public']['Enums']['journal_non_delivery_reason'] | null
          guardian_text?: string | null
          guardian_text_approved_at?: string | null
          draft_generated_at?: string | null
          /** 확정 뒤 수정 사유 — 트리거가 이력으로 옮기고 비운다. */
          edit_reason?: string | null
        }
        Relationships: []
      }
      program_journal_photos: {
        Row: {
          id: string
          org_id: string
          journal_id: string
          path: string
          caption: string | null
          sort: number
          uploaded_by: string | null
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
        }
        Update: {
          caption?: string | null
          sort?: number
        }
        Relationships: []
      }
      // 확정 후 수정 이력 — 읽기 전용(트리거가 쓴다).
      program_journal_revisions: {
        Row: {
          id: string
          journal_id: string
          org_id: string
          profile_id: string
          changed_by: string | null
          changed_at: string
          reason: string
          changes: Json
        }
        Insert: never
        Update: never
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
          // 파일럿 D7(20260924050000) — 발송 워커 전용. 사용자는 바꿀 수 없어(트리거) Insert/Update 에 넣지 않는다.
          pushed_at: string | null
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
      // 파일럿 D3(20260924010000) — 기관 설정 1행. 쓰기는 org_admin·center_director, 읽기는 돌봄팀.
      // ai_drafts_enabled(20260925000000) — 플랫폼 운영자만 켠다(트리거가 막는다). 클라이언트 쓰기 타입에 넣지 않는다.
      org_settings: {
        Row: { org_id: string; facility_type: 'nursing_home' | 'day_care' | null; target_minutes: number; default_avoid_topics: string[]; default_program_type: string; default_location: string | null; ai_drafts_enabled: boolean; updated_at: string; updated_by: string | null }
        Insert: { org_id: string; facility_type?: 'nursing_home' | 'day_care' | null; target_minutes?: number; default_avoid_topics?: string[]; default_program_type?: string; default_location?: string | null }
        Update: { facility_type?: 'nursing_home' | 'day_care' | null; target_minutes?: number; default_avoid_topics?: string[]; default_program_type?: string; default_location?: string | null }
        Relationships: []
      }
      // 파일럿 D3 — 위임 3종 × 허용 역할. 행이 없으면 서버가 기본 집합으로 폴백한다.
      org_capabilities: {
        Row: { org_id: string; capability: Database['public']['Enums']['org_capability']; allowed_roles: Database['public']['Enums']['org_role'][]; updated_at: string; updated_by: string | null }
        Insert: { org_id: string; capability: Database['public']['Enums']['org_capability']; allowed_roles?: Database['public']['Enums']['org_role'][] }
        Update: { allowed_roles?: Database['public']['Enums']['org_role'][] }
        Relationships: []
      }
      // 파일럿 D7(20260924050000) — 본인 행 조회만. 쓰기는 register_push_token·revoke_push_token RPC.
      push_tokens: {
        Row: { id: string; user_id: string; token: string; platform: 'ios' | 'android'; created_at: string; updated_at: string; last_seen_at: string; revoked_at: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      // 파일럿 D3 후반(20260924020000) — 직원 합류. 쓰기는 전부 RPC(create_org_invite·revoke_org_invite·request_org_join·
      // cancel_org_join·approve_org_join·reject_org_join, complete_onboarding 의 p_invite_code). 읽기: 관리 역할 / 요청자 본인.
      org_invites: {
        Row: { id: string; org_id: string; code: string; role: Database['public']['Enums']['org_role']; created_by: string; created_at: string; expires_at: string; revoked_at: string | null; revoked_by: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      org_join_requests: {
        Row: { id: string; org_id: string; user_id: string; invite_id: string; requested_role: Database['public']['Enums']['org_role']; requester_name: string; status: Database['public']['Enums']['org_join_status']; created_at: string; decided_at: string | null; decided_by: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      // 파일럿 D6 — 감독 개입 기록(읽기: 같은 기관 돌봄팀, 쓰기: RPC 전용)
      session_interventions: {
        Row: { id: string; session_id: string; profile_id: string; org_id: string; actor_id: string | null; action: 'pause' | 'resume' | 'end' | 'phase_advance'; detail: Json | null; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      // Planned functional RPC contract; not deployed or enabled by the app yet.
      save_voice_playback_v1: { Args: { p_session_id: string; p_observations: Json }; Returns: number }
      transcript_storage_version: { Args: Record<PropertyKey, never>; Returns: number }
      can_process_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      can_process_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
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
          p_consent_version?: string | null
          p_social_acknowledged?: boolean | null
          /** 파일럿 D3: 요양보호사가 기관 초대 코드로 합류 — 가입은 끝나되 승인 전까지 org_id NULL. p_org_name 과 동시 불가. */
          p_invite_code?: string | null
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
      // 파일럿 D3 — 역할 부여(org_admin·center_director 만, 자기 자신·보호자↔돌봄팀·마지막 관리자 강등 불가).
      set_member_role: {
        Args: { p_target: string; p_role: Database['public']['Enums']['org_role'] }
        Returns: undefined
      }
      create_org_invite: {
        Args: { p_role: Database['public']['Enums']['org_role']; p_valid_days?: number }
        Returns: Database['public']['Tables']['org_invites']['Row']
      }
      revoke_org_invite: { Args: { p_invite_id: string }; Returns: undefined }
      request_org_join: { Args: { p_code: string }; Returns: Database['public']['Tables']['org_join_requests']['Row'] }
      cancel_org_join: { Args: Record<string, never>; Returns: undefined }
      approve_org_join: { Args: { p_request_id: string }; Returns: undefined }
      reject_org_join: { Args: { p_request_id: string }; Returns: undefined }
      // 파일럿 D6 — 중계가 2초마다(사용자 JWT). allowed=false 면 다른 값은 없다.
      session_tick: {
        Args: { p_session_id: string }
        Returns: { allowed: false } | { allowed: true; phase: Database['public']['Enums']['session_phase'] | null; phase_elapsed_seconds: number | null; elapsed_seconds: number; target_minutes: number; paused: boolean; end_requested: boolean }
      }
      advance_session_phase: {
        Args: { p_session_id: string; p_phase: Database['public']['Enums']['session_phase']; p_prompt_version?: string | null }
        Returns: Database['public']['Enums']['session_phase']
      }
      retry_journal_generation: {
        Args: { p_journal_id: string }
        Returns: undefined
      }
      /** 보호자 — 내게 공개된 확정 일지의 **보호자 문장만**(공단 서식 칸은 오지 않는다). */
      get_my_shared_journals: {
        Args: Record<string, never>
        Returns: {
          id: string
          profile_id: string
          journal_date: string
          operated_from: string | null
          operated_to: string | null
          guardian_text: string | null
          finalized_at: string | null
        }[]
      }
      // 파일럿 W4(20260927000000) — 대화 요약만 공개(session_summary)한 보호자: 요약 문장·첫 주제·날짜만.
      get_my_shared_summaries: {
        Args: Record<string, never>
        Returns: {
          id: string
          session_id: string
          profile_id: string
          summary: string | null
          first_topic: string | null
          created_at: string
        }[]
      }
      register_push_token: {
        Args: { p_token: string; p_platform: 'ios' | 'android' }
        Returns: undefined
      }
      revoke_push_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      request_session_control: {
        Args: { p_session_id: string; p_action: 'pause' | 'resume' | 'end'; p_reason?: string | null }
        Returns: undefined
      }
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
      org_role: 'org_admin' | 'caregiver' | 'guardian' | 'social_worker' | 'center_director'
      consent_type:
        | 'terms_required'
        | 'privacy_required'
        | 'elder_privacy_required'
        | 'sensitive_health_voice'
        | 'cross_border_transfer'
        | 'ai_processing'
        | 'marketing_optional'
      consent_subject_type: 'self' | 'guardian' | 'legal_representative'
      consent_capacity: 'capable' | 'limited' | 'incapable' | 'unknown'
      safety_event_level: 'watch' | 'crisis'
      guardian_link_status: 'pending' | 'approved' | 'revoked'
      caregiver_assignment_status: 'active' | 'removed' | 'pending'
      program_journal_status: 'generating' | 'pending_review' | 'final' | 'failed'
      journal_non_delivery_reason: 'absent' | 'unwell' | 'refused' | 'other'
      care_grade: 'grade_1' | 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'cognitive_support'
      // ⚠️ 'report' 는 DB enum 에만 남은 값이다 — 만드는 쪽이 없다(파일럿 W4 에서 화면 코드 정리 · enum 값은 Postgres 에서 지우기 어려워 둔다).
      share_item_type: 'journal' | 'analysis' | 'session_summary' | 'report' | 'photo'
      inquiry_visibility: 'public' | 'private'
      inquiry_status: 'waiting' | 'answered'
      notification_kind: 'safety' | 'share_viewed' | 'message'
      org_capability: 'journal_finalize' | 'share_revoke' | 'guardian_link_approve'
      org_join_status: 'pending' | 'approved' | 'rejected' | 'cancelled'
      session_phase: 'intro' | 'reminiscence' | 'closing'
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
export type OrgCapability = Enums<'org_capability'>
export type ProgramJournalRow = Tables<'program_journals'>
export type ProgramJournalPhotoRow = Tables<'program_journal_photos'>
export type ProgramJournalRevisionRow = Tables<'program_journal_revisions'>
export type ProgramJournalStatus = Enums<'program_journal_status'>
export type JournalNonDeliveryReason = Enums<'journal_non_delivery_reason'>
export type CareGrade = Enums<'care_grade'>
export type GuardianShareRow = Tables<'guardian_shares'>
export type ShareItemType = Enums<'share_item_type'>
export type NotificationRow = Tables<'notifications'>
export type NotificationKind = Enums<'notification_kind'>
export type MessageRow = Tables<'messages'>
export type InquiryRow = Tables<'inquiries'>
export type InquiryReplyRow = Tables<'inquiry_replies'>
export type InquiryVisibility = Enums<'inquiry_visibility'>
export type InquiryStatus = Enums<'inquiry_status'>
