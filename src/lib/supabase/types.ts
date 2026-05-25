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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          check_in_id: string
          created_at: string | null
          id: string
          storage_path: string
          type: string
        }
        Insert: {
          check_in_id: string
          created_at?: string | null
          id?: string
          storage_path: string
          type: string
        }
        Update: {
          check_in_id?: string
          created_at?: string | null
          id?: string
          storage_path?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          audio_duration_seconds: number | null
          awarded_points: number
          child_id: string
          completed_at: string
          created_at: string | null
          homework_id: string
          id: string
          is_late: boolean
          is_scored: boolean
          note: string | null
          points_earned: number
          proof_type: string | null
          submitted_at: string | null
        }
        Insert: {
          audio_duration_seconds?: number | null
          awarded_points?: number
          child_id: string
          completed_at?: string
          created_at?: string | null
          homework_id: string
          id?: string
          is_late?: boolean
          is_scored?: boolean
          note?: string | null
          points_earned: number
          proof_type?: string | null
          submitted_at?: string | null
        }
        Update: {
          audio_duration_seconds?: number | null
          awarded_points?: number
          child_id?: string
          completed_at?: string
          created_at?: string | null
          homework_id?: string
          id?: string
          is_late?: boolean
          is_scored?: boolean
          note?: string | null
          points_earned?: number
          proof_type?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          age: number | null
          audio_zh_enabled: boolean | null
          avatar: string | null
          category_priorities: Json | null
          created_at: string | null
          default_wechat_group_id: string | null
          gender: string | null
          id: string
          interest_signal: Json | null
          last_categories: string[] | null
          last_check_in: string | null
          name: string
          parent_id: string
          password_hash: string
          pinyin_enabled: boolean | null
          points: number | null
          reading_grade_level: number | null
          reading_level: string | null
          reading_level_en: string | null
          reading_level_en_max: string | null
          reading_level_zh: string | null
          reading_level_zh_max: string | null
          streak_days: number | null
        }
        Insert: {
          age?: number | null
          audio_zh_enabled?: boolean | null
          avatar?: string | null
          category_priorities?: Json | null
          created_at?: string | null
          default_wechat_group_id?: string | null
          gender?: string | null
          id?: string
          interest_signal?: Json | null
          last_categories?: string[] | null
          last_check_in?: string | null
          name: string
          parent_id: string
          password_hash: string
          pinyin_enabled?: boolean | null
          points?: number | null
          reading_grade_level?: number | null
          reading_level?: string | null
          reading_level_en?: string | null
          reading_level_en_max?: string | null
          reading_level_zh?: string | null
          reading_level_zh_max?: string | null
          streak_days?: number | null
        }
        Update: {
          age?: number | null
          audio_zh_enabled?: boolean | null
          avatar?: string | null
          category_priorities?: Json | null
          created_at?: string | null
          default_wechat_group_id?: string | null
          gender?: string | null
          id?: string
          interest_signal?: Json | null
          last_categories?: string[] | null
          last_check_in?: string | null
          name?: string
          parent_id?: string
          password_hash?: string
          pinyin_enabled?: boolean | null
          points?: number | null
          reading_grade_level?: number | null
          reading_level?: string | null
          reading_level_en?: string | null
          reading_level_en_max?: string | null
          reading_level_zh?: string | null
          reading_level_zh_max?: string | null
          streak_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "children_default_wechat_group_id_fkey"
            columns: ["default_wechat_group_id"]
            isOneToOne: false
            referencedRelation: "wechat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_homework_types: {
        Row: {
          created_at: string | null
          default_points: number
          icon: string
          id: string
          name: string
          parent_id: string
        }
        Insert: {
          created_at?: string | null
          default_points?: number
          icon?: string
          id?: string
          name: string
          parent_id: string
        }
        Update: {
          created_at?: string | null
          default_points?: number
          icon?: string
          id?: string
          name?: string
          parent_id?: string
        }
        Relationships: []
      }
      homework_auto_matches: {
        Row: {
          created_at: string
          homework_id: string
          id: string
          is_primary: boolean
          learning_event_id: string
          match_result: string
          match_rule: string
          matched_at: string
          triggered_check_in_id: string | null
        }
        Insert: {
          created_at?: string
          homework_id: string
          id?: string
          is_primary?: boolean
          learning_event_id: string
          match_result: string
          match_rule: string
          matched_at?: string
          triggered_check_in_id?: string | null
        }
        Update: {
          created_at?: string
          homework_id?: string
          id?: string
          is_primary?: boolean
          learning_event_id?: string
          match_result?: string
          match_rule?: string
          matched_at?: string
          triggered_check_in_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_auto_matches_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_auto_matches_learning_event_id_fkey"
            columns: ["learning_event_id"]
            isOneToOne: false
            referencedRelation: "learning_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_auto_matches_triggered_check_in_id_fkey"
            columns: ["triggered_check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_reminders: {
        Row: {
          child_id: string
          created_at: string
          escalated_at: string | null
          escalation_channel: string
          failure_reason: string | null
          homework_id: string
          id: string
          initial_sent_at: string | null
          parent_id: string
          resolved_at: string | null
          status: string
          target_date: string
        }
        Insert: {
          child_id: string
          created_at?: string
          escalated_at?: string | null
          escalation_channel?: string
          failure_reason?: string | null
          homework_id: string
          id?: string
          initial_sent_at?: string | null
          parent_id: string
          resolved_at?: string | null
          status: string
          target_date: string
        }
        Update: {
          child_id?: string
          created_at?: string
          escalated_at?: string | null
          escalation_channel?: string
          failure_reason?: string | null
          homework_id?: string
          id?: string
          initial_sent_at?: string | null
          parent_id?: string
          resolved_at?: string | null
          status?: string
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_reminders_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_reminders_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_reminders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_type_bindings: {
        Row: {
          allowed_platforms: string[]
          created_at: string
          group_id: string
          id: string
          is_builtin: boolean
          match_keywords: string[]
          sort_order: number
          type_id: string
        }
        Insert: {
          allowed_platforms?: string[]
          created_at?: string
          group_id: string
          id?: string
          is_builtin?: boolean
          match_keywords?: string[]
          sort_order?: number
          type_id: string
        }
        Update: {
          allowed_platforms?: string[]
          created_at?: string
          group_id?: string
          id?: string
          is_builtin?: boolean
          match_keywords?: string[]
          sort_order?: number
          type_id?: string
        }
        Relationships: []
      }
      platform_subject_mappings: {
        Row: {
          confidence: number
          created_at: string
          id: string
          is_builtin: boolean
          platform: string
          platform_subject: string
          type_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          is_builtin?: boolean
          platform: string
          platform_subject: string
          type_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          is_builtin?: boolean
          platform?: string
          platform_subject?: string
          type_id?: string
        }
        Relationships: []
      }
      homework_type_groups: {
        Row: {
          created_at: string | null
          icon: string
          id: string
          name: string
          parent_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          icon?: string
          id?: string
          name: string
          parent_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          icon?: string
          id?: string
          name?: string
          parent_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homework_type_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      homeworks: {
        Row: {
          child_id: string
          created_at: string | null
          created_by: string | null
          daily_cutoff_time: string | null
          description: string | null
          estimated_minutes: number | null
          id: string
          is_active: boolean | null
          platform_binding_platform: string | null
          platform_binding_source_ref: string | null
          point_deduction: number
          point_value: number
          repeat_days: number[] | null
          repeat_end_date: string | null
          repeat_interval: number | null
          repeat_start_date: string | null
          repeat_type: string
          required_checkpoint_type: string | null
          send_to_wechat: boolean
          title: string
          type_group_id: string | null
          type_icon: string
          type_id: string | null
          type_name: string
          wechat_group_id: string | null
        }
        Insert: {
          child_id: string
          created_at?: string | null
          created_by?: string | null
          daily_cutoff_time?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean | null
          platform_binding_platform?: string | null
          platform_binding_source_ref?: string | null
          point_deduction?: number
          point_value?: number
          repeat_days?: number[] | null
          repeat_end_date?: string | null
          repeat_interval?: number | null
          repeat_start_date?: string | null
          repeat_type: string
          required_checkpoint_type?: string | null
          send_to_wechat?: boolean
          title: string
          type_group_id?: string | null
          type_icon?: string
          type_id?: string | null
          type_name: string
          wechat_group_id?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string | null
          created_by?: string | null
          daily_cutoff_time?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean | null
          platform_binding_platform?: string | null
          platform_binding_source_ref?: string | null
          point_deduction?: number
          point_value?: number
          repeat_days?: number[] | null
          repeat_end_date?: string | null
          repeat_interval?: number | null
          repeat_start_date?: string | null
          repeat_type?: string
          required_checkpoint_type?: string | null
          send_to_wechat?: boolean
          title?: string
          type_group_id?: string | null
          type_icon?: string
          type_id?: string | null
          type_name?: string
          wechat_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homeworks_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_type_group_id_fkey"
            columns: ["type_group_id"]
            isOneToOne: false
            referencedRelation: "homework_type_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "custom_homework_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_wechat_group_id_fkey"
            columns: ["wechat_group_id"]
            isOneToOne: false
            referencedRelation: "wechat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_event_reviews: {
        Row: {
          created_at: string
          id: string
          learning_event_id: string
          review_reason: string
          review_status: string
          review_summary: Json
        }
        Insert: {
          created_at?: string
          id?: string
          learning_event_id: string
          review_reason: string
          review_status: string
          review_summary?: Json
        }
        Update: {
          created_at?: string
          id?: string
          learning_event_id?: string
          review_reason?: string
          review_status?: string
          review_summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "learning_event_reviews_learning_event_id_fkey"
            columns: ["learning_event_id"]
            isOneToOne: true
            referencedRelation: "learning_events"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_events: {
        Row: {
          child_id: string
          completion_state: string | null
          created_at: string | null
          duration_minutes: number | null
          event_type: string
          id: string
          local_date_key: string
          occurred_at: string
          platform: string
          platform_account_id: string
          raw_payload: Json
          score: number | null
          source_ref: string
          subject: string | null
          title: string
        }
        Insert: {
          child_id: string
          completion_state?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          event_type: string
          id?: string
          local_date_key: string
          occurred_at: string
          platform: string
          platform_account_id: string
          raw_payload?: Json
          score?: number | null
          source_ref: string
          subject?: string | null
          title: string
        }
        Update: {
          child_id?: string
          completion_state?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          event_type?: string
          id?: string
          local_date_key?: string
          occurred_at?: string
          platform?: string
          platform_account_id?: string
          raw_payload?: Json
          score?: number | null
          source_ref?: string
          subject?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_events_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_platform_account_id_fkey"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_routing_rules: {
        Row: {
          channel: string
          child_id: string
          created_at: string
          homework_id: string | null
          id: string
          recipient_label: string | null
          recipient_ref: string
        }
        Insert: {
          channel: string
          child_id: string
          created_at?: string
          homework_id?: string | null
          id?: string
          recipient_label?: string | null
          recipient_ref: string
        }
        Update: {
          channel?: string
          child_id?: string
          created_at?: string
          homework_id?: string | null
          id?: string
          recipient_label?: string | null
          recipient_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_routing_rules_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_routing_rules_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string | null
          dedup_key: string
          failure_reason: string | null
          id: string
          payload_summary: Json
          recipient_ref: string
          sent_at: string | null
          status: string
          template: string
        }
        Insert: {
          channel: string
          created_at?: string | null
          dedup_key: string
          failure_reason?: string | null
          id?: string
          payload_summary?: Json
          recipient_ref: string
          sent_at?: string | null
          status: string
          template: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          dedup_key?: string
          failure_reason?: string | null
          id?: string
          payload_summary?: Json
          recipient_ref?: string
          sent_at?: string | null
          status?: string
          template?: string
        }
        Relationships: []
      }
      parents: {
        Row: {
          auto_remind_child: boolean | null
          auto_remind_parent: boolean | null
          created_at: string | null
          id: string
          passcode: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          reminder_cutoff_time: string | null
          telegram_chat_id: string | null
          telegram_recipient_label: string | null
        }
        Insert: {
          auto_remind_child?: boolean | null
          auto_remind_parent?: boolean | null
          created_at?: string | null
          id: string
          passcode: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminder_cutoff_time?: string | null
          telegram_chat_id?: string | null
          telegram_recipient_label?: string | null
        }
        Update: {
          auto_remind_child?: boolean | null
          auto_remind_parent?: boolean | null
          created_at?: string | null
          id?: string
          passcode?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          reminder_cutoff_time?: string | null
          telegram_chat_id?: string | null
          telegram_recipient_label?: string | null
        }
        Relationships: []
      }
      platform_accounts: {
        Row: {
          auth_mode: string
          auto_login_enabled: boolean
          child_id: string
          created_at: string | null
          external_account_ref: string
          id: string
          last_sync_error_summary: string | null
          last_synced_at: string | null
          login_credentials_encrypted: string | null
          managed_session_captured_at: string | null
          managed_session_expires_at: string | null
          managed_session_payload: Json | null
          platform: string
          status: string
        }
        Insert: {
          auth_mode?: string
          auto_login_enabled?: boolean
          child_id: string
          created_at?: string | null
          external_account_ref: string
          id?: string
          last_sync_error_summary?: string | null
          last_synced_at?: string | null
          login_credentials_encrypted?: string | null
          managed_session_captured_at?: string | null
          managed_session_expires_at?: string | null
          managed_session_payload?: Json | null
          platform: string
          status?: string
        }
        Update: {
          auth_mode?: string
          auto_login_enabled?: boolean
          child_id?: string
          created_at?: string | null
          external_account_ref?: string
          id?: string
          last_sync_error_summary?: string | null
          last_synced_at?: string | null
          login_credentials_encrypted?: string | null
          managed_session_captured_at?: string | null
          managed_session_expires_at?: string | null
          managed_session_payload?: Json | null
          platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_accounts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_sync_jobs: {
        Row: {
          created_at: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          next_retry_at: string | null
          platform_account_id: string
          retry_count: number
          started_at: string
          status: string
          trigger_mode: string
          window_key: string
        }
        Insert: {
          created_at?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          next_retry_at?: string | null
          platform_account_id: string
          retry_count?: number
          started_at: string
          status: string
          trigger_mode: string
          window_key: string
        }
        Update: {
          created_at?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          next_retry_at?: string | null
          platform_account_id?: string
          retry_count?: number
          started_at?: string
          status?: string
          trigger_mode?: string
          window_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_sync_jobs_platform_account_id_fkey"
            columns: ["platform_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_article_illustrations: {
        Row: {
          article_id: string
          created_at: string
          id: string
          image_url: string
          paragraph_index: number
          scene_description: string | null
          source: string | null
          source_url: string | null
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          image_url: string
          paragraph_index: number
          scene_description?: string | null
          source?: string | null
          source_url?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          image_url?: string
          paragraph_index?: number
          scene_description?: string | null
          source?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_article_illustrations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "reading_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_articles: {
        Row: {
          audio_zh_alignment: Json | null
          audio_zh_url: string | null
          audio_zh_voice: string | null
          author_purpose: string | null
          category: string
          classical_quote: Json | null
          content: string
          content_source: string | null
          content_warnings: string[] | null
          cover_image_url: string | null
          cover_source: string | null
          cover_source_url: string | null
          created_at: string | null
          cultural_connection: string | null
          difficulty: number | null
          estimated_minutes: number | null
          genre: string | null
          grade_level: number
          id: string
          language: string | null
          pack_id: string | null
          pack_order: number | null
          pinyin_content: string | null
          quality_issues: Json | null
          raz_level: string | null
          scene_description: string | null
          source: string
          source_url: string | null
          status: string | null
          summary: string | null
          title: string
          topic_key: string
          word_count: number | null
        }
        Insert: {
          audio_zh_alignment?: Json | null
          audio_zh_url?: string | null
          audio_zh_voice?: string | null
          author_purpose?: string | null
          category: string
          classical_quote?: Json | null
          content: string
          content_source?: string | null
          content_warnings?: string[] | null
          cover_image_url?: string | null
          cover_source?: string | null
          cover_source_url?: string | null
          created_at?: string | null
          cultural_connection?: string | null
          difficulty?: number | null
          estimated_minutes?: number | null
          genre?: string | null
          grade_level: number
          id?: string
          language?: string | null
          pack_id?: string | null
          pack_order?: number | null
          pinyin_content?: string | null
          quality_issues?: Json | null
          raz_level?: string | null
          scene_description?: string | null
          source?: string
          source_url?: string | null
          status?: string | null
          summary?: string | null
          title: string
          topic_key: string
          word_count?: number | null
        }
        Update: {
          audio_zh_alignment?: Json | null
          audio_zh_url?: string | null
          audio_zh_voice?: string | null
          author_purpose?: string | null
          category?: string
          classical_quote?: Json | null
          content?: string
          content_source?: string | null
          content_warnings?: string[] | null
          cover_image_url?: string | null
          cover_source?: string | null
          cover_source_url?: string | null
          created_at?: string | null
          cultural_connection?: string | null
          difficulty?: number | null
          estimated_minutes?: number | null
          genre?: string | null
          grade_level?: number
          id?: string
          language?: string | null
          pack_id?: string | null
          pack_order?: number | null
          pinyin_content?: string | null
          quality_issues?: Json | null
          raz_level?: string | null
          scene_description?: string | null
          source?: string
          source_url?: string | null
          status?: string | null
          summary?: string | null
          title?: string
          topic_key?: string
          word_count?: number | null
        }
        Relationships: []
      }
      reading_assignments: {
        Row: {
          article_id: string
          assigned_by: string | null
          assigned_date: string | null
          child_id: string
          completed_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          article_id: string
          assigned_by?: string | null
          assigned_date?: string | null
          child_id: string
          completed_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          article_id?: string
          assigned_by?: string | null
          assigned_date?: string | null
          child_id?: string
          completed_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_assignments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "reading_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_assignments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_image_quota_daily: {
        Row: {
          daily_limit: number
          date: string
          used_count: number
        }
        Insert: {
          daily_limit?: number
          date: string
          used_count?: number
        }
        Update: {
          daily_limit?: number
          date?: string
          used_count?: number
        }
        Relationships: []
      }
      reading_questions: {
        Row: {
          article_id: string
          correct_answer: string
          created_at: string | null
          difficulty: number | null
          explanation: string | null
          hint: string | null
          id: string
          options: Json
          order_index: number
          question_text: string
          question_type: string
        }
        Insert: {
          article_id: string
          correct_answer: string
          created_at?: string | null
          difficulty?: number | null
          explanation?: string | null
          hint?: string | null
          id?: string
          options: Json
          order_index: number
          question_text: string
          question_type: string
        }
        Update: {
          article_id?: string
          correct_answer?: string
          created_at?: string | null
          difficulty?: number | null
          explanation?: string | null
          hint?: string | null
          id?: string
          options?: Json
          order_index?: number
          question_text?: string
          question_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_questions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "reading_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_quiz_attempts: {
        Row: {
          answers: Json
          article_id: string
          assignment_id: string | null
          child_id: string
          created_at: string | null
          id: string
          score: number
          time_spent_seconds: number | null
          total_questions: number
        }
        Insert: {
          answers: Json
          article_id: string
          assignment_id?: string | null
          child_id: string
          created_at?: string | null
          id?: string
          score: number
          time_spent_seconds?: number | null
          total_questions: number
        }
        Update: {
          answers?: Json
          article_id?: string
          assignment_id?: string | null
          child_id?: string
          created_at?: string | null
          id?: string
          score?: number
          time_spent_seconds?: number | null
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "reading_quiz_attempts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "reading_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_quiz_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "reading_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_quiz_attempts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_stats: {
        Row: {
          accuracy_streak: number | null
          articles_at_current_level: number | null
          child_id: string
          created_at: string | null
          id: string
          last_article_date: string | null
          total_articles_read: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy_streak?: number | null
          articles_at_current_level?: number | null
          child_id: string
          created_at?: string | null
          id?: string
          last_article_date?: string | null
          total_articles_read?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy_streak?: number | null
          articles_at_current_level?: number | null
          child_id?: string
          created_at?: string | null
          id?: string
          last_article_date?: string | null
          total_articles_read?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_stats_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_topics: {
        Row: {
          age_min_level: string | null
          category: string
          category_v2: string | null
          content_completeness: string | null
          content_warnings: string[] | null
          created_at: string
          freshness_until: string | null
          id: string
          image_tier: string | null
          key_facts: string | null
          language: string
          pack_id: string | null
          pack_order: number | null
          recommended_levels: string[] | null
          source: string | null
          source_image_url: string | null
          source_quality_score: number | null
          source_text: string | null
          source_url: string | null
          status: string
          target_grades: number[]
          topic_key: string
          updated_at: string
        }
        Insert: {
          age_min_level?: string | null
          category: string
          category_v2?: string | null
          content_completeness?: string | null
          content_warnings?: string[] | null
          created_at?: string
          freshness_until?: string | null
          id?: string
          image_tier?: string | null
          key_facts?: string | null
          language: string
          pack_id?: string | null
          pack_order?: number | null
          recommended_levels?: string[] | null
          source?: string | null
          source_image_url?: string | null
          source_quality_score?: number | null
          source_text?: string | null
          source_url?: string | null
          status?: string
          target_grades?: number[]
          topic_key: string
          updated_at?: string
        }
        Update: {
          age_min_level?: string | null
          category?: string
          category_v2?: string | null
          content_completeness?: string | null
          content_warnings?: string[] | null
          created_at?: string
          freshness_until?: string | null
          id?: string
          image_tier?: string | null
          key_facts?: string | null
          language?: string
          pack_id?: string | null
          pack_order?: number | null
          recommended_levels?: string[] | null
          source?: string | null
          source_image_url?: string | null
          source_quality_score?: number | null
          source_text?: string | null
          source_url?: string | null
          status?: string
          target_grades?: number[]
          topic_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_topics_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "topic_packs"
            referencedColumns: ["pack_id"]
          },
        ]
      }
      topic_packs: {
        Row: {
          category: string
          created_at: string
          description: string | null
          language: string
          pack_id: string
          pack_name_en: string
          pack_name_zh: string
          recommended_levels: string[]
          total_articles: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          language: string
          pack_id: string
          pack_name_en: string
          pack_name_zh: string
          recommended_levels: string[]
          total_articles?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          language?: string
          pack_id?: string
          pack_name_en?: string
          pack_name_zh?: string
          recommended_levels?: string[]
          total_articles?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      voice_push_tasks: {
        Row: {
          attachment_id: string
          check_in_id: string
          child_id: string
          created_at: string | null
          delivery_attempts: number
          failure_reason: string | null
          file_path: string
          homework_id: string
          id: string
          last_attempted_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attachment_id: string
          check_in_id: string
          child_id: string
          created_at?: string | null
          delivery_attempts?: number
          failure_reason?: string | null
          file_path: string
          homework_id: string
          id?: string
          last_attempted_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attachment_id?: string
          check_in_id?: string
          child_id?: string
          created_at?: string | null
          delivery_attempts?: number
          failure_reason?: string | null
          file_path?: string
          homework_id?: string
          id?: string
          last_attempted_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_push_tasks_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_push_tasks_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_push_tasks_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_group_targets: {
        Row: {
          created_at: string
          id: string
          send_enabled: boolean
          target_id: string
          target_type: string
          wechat_group_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          send_enabled?: boolean
          target_id: string
          target_type: string
          wechat_group_id: string
        }
        Update: {
          created_at?: string
          id?: string
          send_enabled?: boolean
          target_id?: string
          target_type?: string
          wechat_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_group_targets_wechat_group_id_fkey"
            columns: ["wechat_group_id"]
            isOneToOne: false
            referencedRelation: "wechat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_groups: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          parent_id: string
          recipient_ref: string
          source: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          parent_id: string
          recipient_ref: string
          source?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          parent_id?: string
          recipient_ref?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_child_by_name: {
        Args: { name_param: string }
        Returns: {
          age: number
          avatar: string
          created_at: string
          gender: string
          id: string
          last_check_in: string
          name: string
          parent_id: string
          password_hash: string
          points: number
          streak_days: number
        }[]
      }
      get_parent_by_passcode: {
        Args: { passcode_param: string }
        Returns: {
          auth_user_email: string
          auto_remind_child: boolean
          auto_remind_parent: boolean
          created_at: string
          id: string
          passcode: string
          quiet_hours_end: string
          quiet_hours_start: string
          reminder_cutoff_time: string
        }[]
      }
      increment_minimax_quota: {
        Args: { p_date: string; p_limit: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
