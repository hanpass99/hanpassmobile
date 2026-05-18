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
      call_logs: {
        Row: {
          call_date: string
          created_at: string
          customer_id: string
          duration_sec: number
          id: string
          is_activation: boolean
          notes: string | null
          result: Database["public"]["Enums"]["call_result"]
          staff_id: string
        }
        Insert: {
          call_date?: string
          created_at?: string
          customer_id: string
          duration_sec?: number
          id?: string
          is_activation?: boolean
          notes?: string | null
          result: Database["public"]["Enums"]["call_result"]
          staff_id: string
        }
        Update: {
          call_date?: string
          created_at?: string
          customer_id?: string
          duration_sec?: number
          id?: string
          is_activation?: boolean
          notes?: string | null
          result?: Database["public"]["Enums"]["call_result"]
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_ko: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_ko: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_ko?: string
        }
        Relationships: []
      }
      customer_call_rounds: {
        Row: {
          call_date: string
          created_at: string
          customer_id: string
          id: string
          round: number
          staff_id: string
          updated_at: string
        }
        Insert: {
          call_date?: string
          created_at?: string
          customer_id: string
          id?: string
          round: number
          staff_id: string
          updated_at?: string
        }
        Update: {
          call_date?: string
          created_at?: string
          customer_id?: string
          id?: string
          round?: number
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_call_rounds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          activation_date: string | null
          application_date: string | null
          assigned_to: string | null
          call_round: number | null
          carrier_plan: string | null
          channel_id: string | null
          charge_amount: number | null
          charge_date: string | null
          charge_phone: string | null
          country_id: string | null
          created_at: string
          email: string | null
          id: string
          imported_at: string
          name: string
          notes: string | null
          phone: string
          pool: Database["public"]["Enums"]["customer_pool"]
          requested_plan: string | null
          signup_date: string
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
        }
        Insert: {
          activation_date?: string | null
          application_date?: string | null
          assigned_to?: string | null
          call_round?: number | null
          carrier_plan?: string | null
          channel_id?: string | null
          charge_amount?: number | null
          charge_date?: string | null
          charge_phone?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          imported_at?: string
          name: string
          notes?: string | null
          phone: string
          pool?: Database["public"]["Enums"]["customer_pool"]
          requested_plan?: string | null
          signup_date?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Update: {
          activation_date?: string | null
          application_date?: string | null
          assigned_to?: string | null
          call_round?: number | null
          carrier_plan?: string | null
          channel_id?: string | null
          charge_amount?: number | null
          charge_date?: string | null
          charge_phone?: string | null
          country_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          imported_at?: string
          name?: string
          notes?: string | null
          phone?: string
          pool?: Database["public"]["Enums"]["customer_pool"]
          requested_plan?: string | null
          signup_date?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_countries: {
        Row: {
          country_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          country_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country_id: string | null
          created_at: string
          department: string | null
          display_name: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country_id?: string | null
          created_at?: string
          department?: string | null
          display_name: string
          id: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country_id?: string | null
          created_at?: string
          department?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          aligo_msg_id: string | null
          aligo_response: Json | null
          cost: number | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          message: string
          msg_type: string
          receiver_name: string | null
          receiver_phone: string
          sent_at: string
          staff_id: string
          status: string
          title: string | null
        }
        Insert: {
          aligo_msg_id?: string | null
          aligo_response?: Json | null
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message: string
          msg_type?: string
          receiver_name?: string | null
          receiver_phone: string
          sent_at?: string
          staff_id: string
          status?: string
          title?: string | null
        }
        Update: {
          aligo_msg_id?: string | null
          aligo_response?: Json | null
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          message?: string
          msg_type?: string
          receiver_name?: string | null
          receiver_phone?: string
          sent_at?: string
          staff_id?: string
          status?: string
          title?: string | null
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_shared: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_shared?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_shared?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_attendance: {
        Row: {
          attendance_date: string
          created_at: string
          id: string
          note: string | null
          set_by: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_date?: string
          created_at?: string
          id?: string
          note?: string | null
          set_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          id?: string
          note?: string | null
          set_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          activation_target: number
          call_target: number
          created_at: string
          id: string
          month: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          activation_target?: number
          call_target?: number
          created_at?: string
          id?: string
          month: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          activation_target?: number
          call_target?: number
          created_at?: string
          id?: string
          month?: number
          updated_at?: string
          user_id?: string
          year?: number
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
      admin_set_profile_active: {
        Args: { _active: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_profile_countries: {
        Args: { _country_ids: string[]; _user_id: string }
        Returns: undefined
      }
      admin_set_profile_country: {
        Args: { _country_id: string; _user_id: string }
        Returns: undefined
      }
      admin_set_profile_sort_order: {
        Args: { _sort_order: number; _user_id: string }
        Returns: undefined
      }
      admin_set_profile_sort_orders: {
        Args: { _user_ids: string[] }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      current_user_countries: { Args: never; Returns: string[] }
      current_user_country: { Args: never; Returns: string }
      customer_pool_counts: {
        Args: never
        Returns: {
          cnt: number
          pool: string
        }[]
      }
      customers_existing_phones: {
        Args: {
          _phones: string[]
          _pool: Database["public"]["Enums"]["customer_pool"]
        }
        Returns: {
          phone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_customers:
        | {
            Args: {
              _assigned_country?: string
              _assigned_to?: string
              _call_round?: number
              _country_id?: string
              _date_from?: string
              _date_to?: string
              _page?: number
              _page_size?: number
              _pool?: Database["public"]["Enums"]["customer_pool"]
              _search?: string
              _sort_dir?: string
              _sort_key?: string
              _status?: Database["public"]["Enums"]["customer_status"]
            }
            Returns: {
              data: Json
              total_count: number
            }[]
          }
        | {
            Args: {
              _assigned_country?: string
              _assigned_to?: string
              _call_completed?: boolean
              _call_round?: number
              _country_id?: string
              _date_from?: string
              _date_to?: string
              _page?: number
              _page_size?: number
              _pool?: Database["public"]["Enums"]["customer_pool"]
              _search?: string
              _sort_dir?: string
              _sort_key?: string
              _status?: Database["public"]["Enums"]["customer_status"]
            }
            Returns: {
              data: Json
              total_count: number
            }[]
          }
      set_staff_attendance: {
        Args: {
          _date: string
          _note?: string
          _status: Database["public"]["Enums"]["attendance_status"]
          _user_id: string
        }
        Returns: undefined
      }
      stats_attendance_summary: {
        Args: { _date?: string }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      stats_by_channel: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: {
          channel_id: string
          name: string
          status_counts: Json
          total: number
        }[]
      }
      stats_by_country: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: {
          code: string
          country_id: string
          name_ko: string
          status_counts: Json
          total: number
        }[]
      }
      stats_by_staff: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: {
          display_name: string
          status_counts: Json
          total: number
          user_id: string
        }[]
      }
      stats_call_completed: {
        Args: {
          _country_id?: string
          _date_from?: string
          _date_to?: string
          _pool?: Database["public"]["Enums"]["customer_pool"]
        }
        Returns: number
      }
      stats_channel_summary:
        | {
            Args: { _country_id?: string }
            Returns: {
              activations: number
              channel_id: string
              customers: number
              name: string
            }[]
          }
        | {
            Args: {
              _country_id?: string
              _date_from?: string
              _date_to?: string
              _pool?: Database["public"]["Enums"]["customer_pool"]
            }
            Returns: {
              activations: number
              channel_id: string
              customers: number
              name: string
            }[]
          }
      stats_country_activated:
        | {
            Args: never
            Returns: {
              activated: number
              code: string
              country_id: string
            }[]
          }
        | {
            Args: {
              _country_id?: string
              _date_from?: string
              _date_to?: string
              _pool?: Database["public"]["Enums"]["customer_pool"]
            }
            Returns: {
              activated: number
              code: string
              country_id: string
            }[]
          }
      stats_daily_calls:
        | {
            Args: { _country_id?: string; _date_from: string; _date_to: string }
            Returns: {
              activations: number
              calls: number
              day: string
            }[]
          }
        | {
            Args: {
              _country_id?: string
              _date_from: string
              _date_to: string
              _pool?: Database["public"]["Enums"]["customer_pool"]
            }
            Returns: {
              activations: number
              calls: number
              day: string
            }[]
          }
      stats_dashboard_summary: {
        Args: {
          _country_id?: string
          _date_from: string
          _date_to: string
          _month: number
          _pool?: Database["public"]["Enums"]["customer_pool"]
          _year: number
        }
        Returns: Json
      }
      stats_staff_ranking: {
        Args: {
          _attendance_date?: string
          _country_id?: string
          _date_from: string
          _date_to: string
          _month: number
          _year: number
        }
        Returns: {
          activated: number
          activation_target: number
          attendance: string
          display_name: string
          total_calls: number
          user_id: string
        }[]
      }
      stats_status_counts: {
        Args: {
          _country_id?: string
          _date_from?: string
          _date_to?: string
          _pool?: Database["public"]["Enums"]["customer_pool"]
        }
        Returns: {
          cnt: number
          status: string
        }[]
      }
      stats_totals:
        | {
            Args: {
              _country_id?: string
              _date_from: string
              _date_to: string
              _month: number
              _year: number
            }
            Returns: {
              monthly_target_total: number
              total_calls: number
              total_customers: number
            }[]
          }
        | {
            Args: {
              _country_id?: string
              _date_from: string
              _date_to: string
              _month: number
              _pool?: Database["public"]["Enums"]["customer_pool"]
              _year: number
            }
            Returns: {
              monthly_target_total: number
              total_calls: number
              total_customers: number
            }[]
          }
    }
    Enums: {
      app_role: "admin" | "staff"
      attendance_status:
        | "present"
        | "day_off"
        | "annual_leave"
        | "half_day"
        | "training"
        | "sick_leave"
      call_result:
        | "no_answer"
        | "wrong_number"
        | "callback"
        | "not_interested"
        | "interested"
        | "activated"
        | "failed"
      customer_pool:
        | "existing"
        | "new_signup"
        | "prepaid"
        | "activation_request"
      customer_status:
        | "new"
        | "in_progress"
        | "no_answer"
        | "not_interested"
        | "callback"
        | "activated"
        | "stay_expired"
        | "delinquent"
        | "line_exceeded"
        | "minor"
        | "wrong_application"
        | "seasonal_worker"
        | "suspended_number"
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
      app_role: ["admin", "staff"],
      attendance_status: [
        "present",
        "day_off",
        "annual_leave",
        "half_day",
        "training",
        "sick_leave",
      ],
      call_result: [
        "no_answer",
        "wrong_number",
        "callback",
        "not_interested",
        "interested",
        "activated",
        "failed",
      ],
      customer_pool: [
        "existing",
        "new_signup",
        "prepaid",
        "activation_request",
      ],
      customer_status: [
        "new",
        "in_progress",
        "no_answer",
        "not_interested",
        "callback",
        "activated",
        "stay_expired",
        "delinquent",
        "line_exceeded",
        "minor",
        "wrong_application",
        "seasonal_worker",
        "suspended_number",
      ],
    },
  },
} as const
