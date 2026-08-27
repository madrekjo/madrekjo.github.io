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
      admin_devices: {
        Row: {
          avatar_url: string | null
          created_at: string
          device_id: string
          display_name: string | null
          note: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          device_id: string
          display_name?: string | null
          note?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          device_id?: string
          display_name?: string | null
          note?: string | null
        }
        Relationships: []
      }
      banned_fingerprints: {
        Row: {
          created_at: string
          ip_hash: string
          origin_device_id: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          ip_hash: string
          origin_device_id?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          ip_hash?: string
          origin_device_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      blocked_devices: {
        Row: {
          banned_by: string | null
          created_at: string
          device_id: string
          evidence_url: string | null
          evidence_visible: boolean
          expires_at: string | null
          reason: string | null
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          device_id: string
          evidence_url?: string | null
          evidence_visible?: boolean
          expires_at?: string | null
          reason?: string | null
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          device_id?: string
          evidence_url?: string | null
          evidence_visible?: boolean
          expires_at?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      chat_comments: {
        Row: {
          avatar_url: string | null
          bg_color: string | null
          content: string
          created_at: string
          device_id: string
          display_name: string
          edited_at: string | null
          id: string
          is_admin: boolean
          parent_id: string | null
          post_id: string
          post_mode: string
          text_color: string | null
        }
        Insert: {
          avatar_url?: string | null
          bg_color?: string | null
          content: string
          created_at?: string
          device_id: string
          display_name: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          parent_id?: string | null
          post_id: string
          post_mode?: string
          text_color?: string | null
        }
        Update: {
          avatar_url?: string | null
          bg_color?: string | null
          content?: string
          created_at?: string
          device_id?: string
          display_name?: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          parent_id?: string | null
          post_id?: string
          post_mode?: string
          text_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chat_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "chat_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_likes: {
        Row: {
          created_at: string
          device_id: string
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "chat_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string
          device_id: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string
          device_id: string
          display_name: string
          id?: string
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string
          device_id?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      chat_post_mutes: {
        Row: {
          created_at: string
          device_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_post_mutes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "chat_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_posts: {
        Row: {
          attachments: Json
          avatar_url: string | null
          bg_color: string | null
          content: string
          created_at: string
          device_id: string
          display_name: string
          edited_at: string | null
          id: string
          is_admin: boolean
          pinned: boolean
          post_mode: string
          text_color: string | null
        }
        Insert: {
          attachments?: Json
          avatar_url?: string | null
          bg_color?: string | null
          content: string
          created_at?: string
          device_id: string
          display_name: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          pinned?: boolean
          post_mode?: string
          text_color?: string | null
        }
        Update: {
          attachments?: Json
          avatar_url?: string | null
          bg_color?: string | null
          content?: string
          created_at?: string
          device_id?: string
          display_name?: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          pinned?: boolean
          post_mode?: string
          text_color?: string | null
        }
        Relationships: []
      }
      comment_edits: {
        Row: {
          comment_id: string
          device_id: string
          edited_at: string
          id: string
          new_content: string
          previous_content: string
        }
        Insert: {
          comment_id: string
          device_id: string
          edited_at?: string
          id?: string
          new_content: string
          previous_content: string
        }
        Update: {
          comment_id?: string
          device_id?: string
          edited_at?: string
          id?: string
          new_content?: string
          previous_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_edits_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          anon_number: number | null
          author_avatar_url: string | null
          author_name: string | null
          bg_color: string | null
          content: string
          created_at: string
          device_id: string
          edited_at: string | null
          id: string
          is_admin: boolean
          parent_id: string | null
          post_id: string
          post_mode: string
          text_color: string | null
        }
        Insert: {
          anon_number?: number | null
          author_avatar_url?: string | null
          author_name?: string | null
          bg_color?: string | null
          content: string
          created_at?: string
          device_id: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          parent_id?: string | null
          post_id: string
          post_mode?: string
          text_color?: string | null
        }
        Update: {
          anon_number?: number | null
          author_avatar_url?: string | null
          author_name?: string | null
          bg_color?: string | null
          content?: string
          created_at?: string
          device_id?: string
          edited_at?: string | null
          id?: string
          is_admin?: boolean
          parent_id?: string | null
          post_id?: string
          post_mode?: string
          text_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      device_aliases: {
        Row: {
          created_at: string
          device_id: string
          number: number
        }
        Insert: {
          created_at?: string
          device_id: string
          number?: number
        }
        Update: {
          created_at?: string
          device_id?: string
          number?: number
        }
        Relationships: []
      }
      device_fingerprints: {
        Row: {
          device_id: string
          first_seen: string
          hits: number
          ip_hash: string
          last_seen: string
          ua_hash: string
        }
        Insert: {
          device_id: string
          first_seen?: string
          hits?: number
          ip_hash: string
          last_seen?: string
          ua_hash?: string
        }
        Update: {
          device_id?: string
          first_seen?: string
          hits?: number
          ip_hash?: string
          last_seen?: string
          ua_hash?: string
        }
        Relationships: []
      }
      device_notes: {
        Row: {
          device_id: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          device_id: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          device_id?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      device_presence: {
        Row: {
          device_id: string
          first_seen: string
          last_seen: string
          total_seconds: number
          visits: number
        }
        Insert: {
          device_id: string
          first_seen?: string
          last_seen?: string
          total_seconds?: number
          visits?: number
        }
        Update: {
          device_id?: string
          first_seen?: string
          last_seen?: string
          total_seconds?: number
          visits?: number
        }
        Relationships: []
      }
      post_edits: {
        Row: {
          device_id: string
          edited_at: string
          id: string
          new_content: string
          post_id: string
          previous_content: string
        }
        Insert: {
          device_id: string
          edited_at?: string
          id?: string
          new_content: string
          post_id: string
          previous_content: string
        }
        Update: {
          device_id?: string
          edited_at?: string
          id?: string
          new_content?: string
          post_id?: string
          previous_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_edits_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          device_id: string
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          anon_number: number | null
          attachments: Json
          author_avatar_url: string | null
          author_name: string | null
          bg_color: string | null
          content: string
          created_at: string
          device_id: string
          edited_at: string | null
          hidden: boolean
          id: string
          is_admin: boolean
          pinned: boolean
          post_mode: string
          status: string
          text_color: string | null
          user_id: string | null
        }
        Insert: {
          anon_number?: number | null
          attachments?: Json
          author_avatar_url?: string | null
          author_name?: string | null
          bg_color?: string | null
          content: string
          created_at?: string
          device_id: string
          edited_at?: string | null
          hidden?: boolean
          id?: string
          is_admin?: boolean
          pinned?: boolean
          post_mode?: string
          status?: string
          text_color?: string | null
          user_id?: string | null
        }
        Update: {
          anon_number?: number | null
          attachments?: Json
          author_avatar_url?: string | null
          author_name?: string | null
          bg_color?: string | null
          content?: string
          created_at?: string
          device_id?: string
          edited_at?: string | null
          hidden?: boolean
          id?: string
          is_admin?: boolean
          pinned?: boolean
          post_mode?: string
          status?: string
          text_color?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          content_id: string
          content_owner_device_id: string | null
          content_snapshot: string | null
          content_type: string
          created_at: string
          id: string
          reason_code: string
          reason_text: string | null
          reporter_device_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          content_id: string
          content_owner_device_id?: string | null
          content_snapshot?: string | null
          content_type: string
          created_at?: string
          id?: string
          reason_code: string
          reason_text?: string | null
          reporter_device_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          content_id?: string
          content_owner_device_id?: string | null
          content_snapshot?: string | null
          content_type?: string
          created_at?: string
          id?: string
          reason_code?: string
          reason_text?: string | null
          reporter_device_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          admin_comment_bg: string | null
          admin_comment_text: string | null
          admin_post_bg: string | null
          admin_post_text: string | null
          chat_mode_enabled: boolean
          id: number
          maintenance_message: string | null
          site_enabled: boolean
          site_reopen_at: string | null
          updated_at: string
        }
        Insert: {
          admin_comment_bg?: string | null
          admin_comment_text?: string | null
          admin_post_bg?: string | null
          admin_post_text?: string | null
          chat_mode_enabled?: boolean
          id?: number
          maintenance_message?: string | null
          site_enabled?: boolean
          site_reopen_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_comment_bg?: string | null
          admin_comment_text?: string | null
          admin_post_bg?: string | null
          admin_post_text?: string | null
          chat_mode_enabled?: boolean
          id?: number
          maintenance_message?: string | null
          site_enabled?: boolean
          site_reopen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ban_device: {
        Args: {
          p_device_id: string
          p_evidence_url: string
          p_evidence_visible: boolean
          p_expires_at: string
          p_reason: string
        }
        Returns: undefined
      }
      admin_resolve_report: {
        Args: { p_action: string; p_note: string; p_report_id: string }
        Returns: Json
      }
      admin_unban_device: { Args: { p_device_id: string }; Returns: undefined }
      assign_anon_number: { Args: { _device_id: string }; Returns: number }
      bypass_ban_with_code: {
        Args: { p_code: string; p_device_id: string }
        Returns: Json
      }
      check_visitor_banned: { Args: { p_device_id: string }; Returns: Json }
      edit_chat_comment: {
        Args: { p_content: string; p_device_id: string; p_id: string }
        Returns: undefined
      }
      edit_chat_post: {
        Args: { p_content: string; p_device_id: string; p_id: string }
        Returns: undefined
      }
      edit_comment: {
        Args: { p_content: string; p_device_id: string; p_id: string }
        Returns: undefined
      }
      edit_post: {
        Args: { p_content: string; p_device_id: string; p_id: string }
        Returns: undefined
      }
      get_device_dossier: { Args: { p_device_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_device: {
        Args: { p_device_id: string; p_seconds: number }
        Returns: undefined
      }
      record_visitor_fingerprint: {
        Args: { p_device_id: string; p_ip_hash: string; p_ua_hash: string }
        Returns: Json
      }
      set_device_label: {
        Args: { p_device_id: string; p_label: string }
        Returns: undefined
      }
      submit_report: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_reason_code: string
          p_reason_text: string
          p_reporter_device_id: string
        }
        Returns: Json
      }
      unlike_chat_post: {
        Args: { p_device_id: string; p_post_id: string }
        Returns: undefined
      }
      unlike_post: {
        Args: { p_device_id: string; p_post_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
