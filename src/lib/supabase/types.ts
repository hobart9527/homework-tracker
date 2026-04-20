export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      parents: {
        Row: {
          id: string;
          passcode: string;
          reminder_cutoff_time: string | null;
          auto_remind_parent: boolean | null;
          auto_remind_child: boolean | null;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          telegram_chat_id: string | null;
          telegram_recipient_label: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          passcode: string;
          reminder_cutoff_time?: string | null;
          auto_remind_parent?: boolean | null;
          auto_remind_child?: boolean | null;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          telegram_chat_id?: string | null;
          telegram_recipient_label?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          passcode?: string;
          reminder_cutoff_time?: string | null;
          auto_remind_parent?: boolean | null;
          auto_remind_child?: boolean | null;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
          telegram_chat_id?: string | null;
          telegram_recipient_label?: string | null;
          created_at?: string | null;
        };
      };
      children: {
        Row: {
          id: string;
          parent_id: string;
          name: string;
          avatar: string | null;
          age: number | null;
          gender: "female" | "male" | null;
          password_hash: string;
          points: number | null;
          streak_days: number | null;
          last_check_in: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          parent_id: string;
          name: string;
          avatar?: string | null;
          age?: number | null;
          gender?: "female" | "male" | null;
          password_hash: string;
          points?: number | null;
          streak_days?: number | null;
          last_check_in?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string;
          name?: string;
          avatar?: string | null;
          age?: number | null;
          gender?: "female" | "male" | null;
          password_hash?: string;
          points?: number | null;
          streak_days?: number | null;
          last_check_in?: string | null;
          created_at?: string | null;
        };
      };
      custom_homework_types: {
        Row: {
          id: string;
          parent_id: string;
          name: string;
          icon: string | null;
          default_points: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          parent_id: string;
          name: string;
          icon?: string | null;
          default_points?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          parent_id?: string;
          name?: string;
          icon?: string | null;
          default_points?: number | null;
          created_at?: string | null;
        };
      };
      homeworks: {
        Row: {
          id: string;
          child_id: string;
          type_id: string | null;
          type_name: string;
          type_icon: string | null;
          title: string;
          description: string | null;
          repeat_type: "daily" | "weekly" | "interval" | "once";
          repeat_days: number[] | null;
          repeat_interval: number | null;
          repeat_start_date: string | null;
          repeat_end_date: string | null;
          point_value: number | null;
          point_deduction: number | null;
          estimated_minutes: number | null;
          daily_cutoff_time: string | null;
          is_active: boolean | null;
          required_checkpoint_type: "photo" | "audio" | null;
          platform_binding_platform: string | null;
          platform_binding_source_ref: string | null;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          child_id: string;
          type_id?: string | null;
          type_name: string;
          type_icon?: string | null;
          title: string;
          description?: string | null;
          repeat_type: "daily" | "weekly" | "interval" | "once";
          repeat_days?: number[] | null;
          repeat_interval?: number | null;
          repeat_start_date?: string | null;
          repeat_end_date?: string | null;
          point_value?: number | null;
          point_deduction?: number | null;
          estimated_minutes?: number | null;
          daily_cutoff_time?: string | null;
          is_active?: boolean | null;
          required_checkpoint_type?: "photo" | "audio" | null;
          platform_binding_platform?: string | null;
          platform_binding_source_ref?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          child_id?: string;
          type_id?: string | null;
          type_name?: string;
          type_icon?: string | null;
          title?: string;
          description?: string | null;
          repeat_type?: "daily" | "weekly" | "interval" | "once";
          repeat_days?: number[] | null;
          repeat_interval?: number | null;
          repeat_start_date?: string | null;
          repeat_end_date?: string | null;
          point_value?: number | null;
          point_deduction?: number | null;
          estimated_minutes?: number | null;
          daily_cutoff_time?: string | null;
          is_active?: boolean | null;
          required_checkpoint_type?: "photo" | "audio" | null;
          platform_binding_platform?: string | null;
          platform_binding_source_ref?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
      };
      check_ins: {
        Row: {
          id: string;
          homework_id: string;
          child_id: string;
          completed_at: string | null;
          submitted_at: string | null;
          points_earned: number;
          awarded_points: number;
          is_scored: boolean;
          is_late: boolean;
          proof_type: "photo" | "audio" | null;
          note: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          homework_id: string;
          child_id: string;
          completed_at?: string | null;
          submitted_at?: string | null;
          points_earned: number;
          awarded_points?: number;
          is_scored?: boolean;
          is_late?: boolean;
          proof_type?: "photo" | "audio" | null;
          note?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          homework_id?: string;
          child_id?: string;
          completed_at?: string | null;
          submitted_at?: string | null;
          points_earned?: number;
          awarded_points?: number;
          is_scored?: boolean;
          is_late?: boolean;
          proof_type?: "photo" | "audio" | null;
          note?: string | null;
          created_at?: string | null;
        };
      };
      homework_auto_matches: {
        Row: {
          id: string;
          homework_id: string;
          learning_event_id: string;
          match_rule: string;
          match_result:
            | "auto_completed"
            | "partially_completed"
            | "unmatched"
            | "supporting_evidence"
            | "already_completed";
          is_primary: boolean;
          triggered_check_in_id: string | null;
          matched_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          homework_id: string;
          learning_event_id: string;
          match_rule: string;
          match_result:
            | "auto_completed"
            | "partially_completed"
            | "unmatched"
            | "supporting_evidence"
            | "already_completed";
          is_primary?: boolean;
          triggered_check_in_id?: string | null;
          matched_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          homework_id?: string;
          learning_event_id?: string;
          match_rule?: string;
          match_result?:
            | "auto_completed"
            | "partially_completed"
            | "unmatched"
            | "supporting_evidence"
            | "already_completed";
          is_primary?: boolean;
          triggered_check_in_id?: string | null;
          matched_at?: string;
          created_at?: string;
        };
      };
      homework_reminders: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          homework_id: string;
          target_date: string;
          status: "pending_initial" | "sent_sms" | "resolved_completed" | "escalated_call" | "failed";
          escalation_channel: string;
          initial_sent_at: string | null;
          escalated_at: string | null;
          resolved_at: string | null;
          failure_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          homework_id: string;
          target_date: string;
          status: "pending_initial" | "sent_sms" | "resolved_completed" | "escalated_call" | "failed";
          escalation_channel?: string;
          initial_sent_at?: string | null;
          escalated_at?: string | null;
          resolved_at?: string | null;
          failure_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          child_id?: string;
          homework_id?: string;
          target_date?: string;
          status?: "pending_initial" | "sent_sms" | "resolved_completed" | "escalated_call" | "failed";
          escalation_channel?: string;
          initial_sent_at?: string | null;
          escalated_at?: string | null;
          resolved_at?: string | null;
          failure_reason?: string | null;
          created_at?: string;
        };
      };
      attachments: {
        Row: {
          id: string;
          check_in_id: string;
          type: "photo" | "audio";
          storage_path: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          check_in_id: string;
          type: "photo" | "audio";
          storage_path: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          check_in_id?: string;
          type?: "photo" | "audio";
          storage_path?: string;
          created_at?: string | null;
        };
      };
      platform_accounts: {
        Row: {
          id: string;
          child_id: string;
          platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
          external_account_ref: string;
          auth_mode: string;
          status: "attention_required" | "active" | "syncing" | "failed";
          last_synced_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          child_id: string;
          platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
          external_account_ref: string;
          auth_mode?: string;
          status?: "attention_required" | "active" | "syncing" | "failed";
          last_synced_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          child_id?: string;
          platform?: "ixl" | "khan-academy" | "raz-kids" | "epic";
          external_account_ref?: string;
          auth_mode?: string;
          status?: "attention_required" | "active" | "syncing" | "failed";
          last_synced_at?: string | null;
          created_at?: string | null;
        };
      };
      platform_sync_jobs: {
        Row: {
          id: string;
          platform_account_id: string;
          trigger_mode: "scheduled" | "manual";
          status: "running" | "completed" | "failed" | "attention_required";
          window_key: string;
          started_at: string;
          finished_at: string | null;
          error_summary: string | null;
          raw_summary: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          platform_account_id: string;
          trigger_mode: "scheduled" | "manual";
          status: "running" | "completed" | "failed" | "attention_required";
          window_key: string;
          started_at?: string;
          finished_at?: string | null;
          error_summary?: string | null;
          raw_summary?: Json;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          platform_account_id?: string;
          trigger_mode?: "scheduled" | "manual";
          status?: "running" | "completed" | "failed" | "attention_required";
          window_key?: string;
          started_at?: string;
          finished_at?: string | null;
          error_summary?: string | null;
          raw_summary?: Json;
          created_at?: string | null;
        };
      };
      learning_events: {
        Row: {
          id: string;
          child_id: string;
          platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
          platform_account_id: string;
          occurred_at: string;
          local_date_key: string;
          event_type: string;
          title: string;
          subject: string | null;
          duration_minutes: number | null;
          score: number | null;
          completion_state: string | null;
          source_ref: string;
          raw_payload: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          child_id: string;
          platform: "ixl" | "khan-academy" | "raz-kids" | "epic";
          platform_account_id: string;
          occurred_at: string;
          local_date_key: string;
          event_type: string;
          title: string;
          subject?: string | null;
          duration_minutes?: number | null;
          score?: number | null;
          completion_state?: string | null;
          source_ref: string;
          raw_payload?: Json;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          child_id?: string;
          platform?: "ixl" | "khan-academy" | "raz-kids" | "epic";
          platform_account_id?: string;
          occurred_at?: string;
          local_date_key?: string;
          event_type?: string;
          title?: string;
          subject?: string | null;
          duration_minutes?: number | null;
          score?: number | null;
          completion_state?: string | null;
          source_ref?: string;
          raw_payload?: Json;
          created_at?: string | null;
        };
      };
      learning_event_reviews: {
        Row: {
          id: string;
          learning_event_id: string;
          review_status: "unmatched" | "resolved";
          review_reason: "no_candidate_homeworks" | "no_matching_homework";
          review_summary: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          learning_event_id: string;
          review_status: "unmatched" | "resolved";
          review_reason: "no_candidate_homeworks" | "no_matching_homework";
          review_summary?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          learning_event_id?: string;
          review_status?: "unmatched" | "resolved";
          review_reason?: "no_candidate_homeworks" | "no_matching_homework";
          review_summary?: Json;
          created_at?: string;
        };
      };
      notification_deliveries: {
        Row: {
          id: string;
          channel: string;
          recipient_ref: string;
          template: string;
          payload_summary: Json;
          dedup_key: string;
          status: "pending" | "sent" | "failed";
          sent_at: string | null;
          failure_reason: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          channel: string;
          recipient_ref: string;
          template: string;
          payload_summary?: Json;
          dedup_key: string;
          status: "pending" | "sent" | "failed";
          sent_at?: string | null;
          failure_reason?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          channel?: string;
          recipient_ref?: string;
          template?: string;
          payload_summary?: Json;
          dedup_key?: string;
          status?: "pending" | "sent" | "failed";
          sent_at?: string | null;
          failure_reason?: string | null;
          created_at?: string | null;
        };
      };
      voice_push_tasks: {
        Row: {
          id: string;
          child_id: string;
          homework_id: string;
          check_in_id: string;
          attachment_id: string;
          file_path: string;
          status: "pending" | "retrying" | "sent" | "failed";
          delivery_attempts: number;
          failure_reason: string | null;
          last_attempted_at: string | null;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          child_id: string;
          homework_id: string;
          check_in_id: string;
          attachment_id: string;
          file_path: string;
          status?: "pending" | "retrying" | "sent" | "failed";
          delivery_attempts?: number;
          failure_reason?: string | null;
          last_attempted_at?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          child_id?: string;
          homework_id?: string;
          check_in_id?: string;
          attachment_id?: string;
          file_path?: string;
          status?: "pending" | "retrying" | "sent" | "failed";
          delivery_attempts?: number;
          failure_reason?: string | null;
          last_attempted_at?: string | null;
          sent_at?: string | null;
          created_at?: string | null;
        };
      };
      voice_push_attempts: {
        Row: {
          id: string;
          voice_push_task_id: string;
          attempt_number: number;
          status: "retrying" | "failed" | "sent";
          failure_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          voice_push_task_id: string;
          attempt_number: number;
          status: "retrying" | "failed" | "sent";
          failure_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          voice_push_task_id?: string;
          attempt_number?: number;
          status?: "retrying" | "failed" | "sent";
          failure_reason?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
