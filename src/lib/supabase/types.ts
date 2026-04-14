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
          estimated_minutes: number | null;
          daily_cutoff_time: string | null;
          is_active: boolean | null;
          required_checkpoint_type: "photo" | "audio" | null;
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
          estimated_minutes?: number | null;
          daily_cutoff_time?: string | null;
          is_active?: boolean | null;
          required_checkpoint_type?: "photo" | "audio" | null;
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
          estimated_minutes?: number | null;
          daily_cutoff_time?: string | null;
          is_active?: boolean | null;
          required_checkpoint_type?: "photo" | "audio" | null;
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
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
