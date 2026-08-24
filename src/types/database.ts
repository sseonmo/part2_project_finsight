export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      csv_format_fingerprints: {
        Row: {
          header_hash: string
          mapping: Json
          user_id: string
        }
        Insert: {
          header_hash: string
          mapping: Json
          user_id: string
        }
        Update: {
          header_hash?: string
          mapping?: Json
          user_id?: string
        }
        Relationships: []
      }
      merchant_categories: {
        Row: {
          category: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized: string
        }
        Insert: {
          category: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized: string
        }
        Update: {
          category?: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          generated_at: string
          generation_started_at: string | null
          month: string
          narrative: string
          previous_total_expense: number | null
          total_expense: number | null
          transaction_count: number | null
          user_id: string
        }
        Insert: {
          generated_at?: string
          generation_started_at?: string | null
          month: string
          narrative: string
          previous_total_expense?: number | null
          total_expense?: number | null
          transaction_count?: number | null
          user_id: string
        }
        Update: {
          generated_at?: string
          generation_started_at?: string | null
          month?: string
          narrative?: string
          previous_total_expense?: number | null
          total_expense?: number | null
          transaction_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      processed_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          received_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          current_period_end: string | null
          polar_customer_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          trial_started_at: string
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          polar_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_started_at?: string
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          polar_customer_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spending_signals: {
        Row: {
          dismissed_at: string | null
          id: string
          impact: number | null
          narrative: string | null
          payload: Json
          period: string
          target_key: string
          type: Database["public"]["Enums"]["spending_signal_type"]
          upload_job_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          id?: string
          impact?: number | null
          narrative?: string | null
          payload: Json
          period: string
          target_key: string
          type: Database["public"]["Enums"]["spending_signal_type"]
          upload_job_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          id?: string
          impact?: number | null
          narrative?: string | null
          payload?: Json
          period?: string
          target_key?: string
          type?: Database["public"]["Enums"]["spending_signal_type"]
          upload_job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_signals_upload_job_id_fkey"
            columns: ["upload_job_id"]
            isOneToOne: false
            referencedRelation: "upload_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"] | null
          category_fallback: boolean
          dedupe_key: string
          id: string
          merchant_normalized: string
          merchant_raw: string
          transacted_on: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          upload_job_id: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["transaction_category"] | null
          category_fallback?: boolean
          dedupe_key: string
          id?: string
          merchant_normalized: string
          merchant_raw: string
          transacted_on: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          upload_job_id: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["transaction_category"] | null
          category_fallback?: boolean
          dedupe_key?: string
          id?: string
          merchant_normalized?: string
          merchant_raw?: string
          transacted_on?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          upload_job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_upload_job_id_fkey"
            columns: ["upload_job_id"]
            isOneToOne: false
            referencedRelation: "upload_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_jobs: {
        Row: {
          card_label: string
          card_label_mismatch_warning: string | null
          created_at: string
          date_format: string | null
          date_format_resolved_by: string | null
          duplicate_count: number
          failed_reason: string | null
          header_hash: string | null
          id: string
          inserted_count: number
          mapping: Json | null
          mapping_attempt_count: number
          original_filename: string
          skipped_rows: number
          status: Database["public"]["Enums"]["upload_job_status"]
          storage_key: string
          uncategorized_count: number
          user_id: string
        }
        Insert: {
          card_label: string
          card_label_mismatch_warning?: string | null
          created_at?: string
          date_format?: string | null
          date_format_resolved_by?: string | null
          duplicate_count?: number
          failed_reason?: string | null
          header_hash?: string | null
          id?: string
          inserted_count?: number
          mapping?: Json | null
          mapping_attempt_count?: number
          original_filename: string
          skipped_rows?: number
          status?: Database["public"]["Enums"]["upload_job_status"]
          storage_key: string
          uncategorized_count?: number
          user_id: string
        }
        Update: {
          card_label?: string
          card_label_mismatch_warning?: string | null
          created_at?: string
          date_format?: string | null
          date_format_resolved_by?: string | null
          duplicate_count?: number
          failed_reason?: string | null
          header_hash?: string | null
          id?: string
          inserted_count?: number
          mapping?: Json | null
          mapping_attempt_count?: number
          original_filename?: string
          skipped_rows?: number
          status?: Database["public"]["Enums"]["upload_job_status"]
          storage_key?: string
          uncategorized_count?: number
          user_id?: string
        }
        Relationships: []
      }
      user_category_overrides: {
        Row: {
          category: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_monthly_report_generation: {
        Args: { p_month: string; p_stale_after: string; p_user_id: string }
        Returns: boolean
      }
      get_category_amount_medians: {
        Args: { p_period: string; p_user_id: string }
        Returns: {
          category: Database["public"]["Enums"]["transaction_category"]
          median_amount: number
          period: string
        }[]
      }
      get_category_monthly_totals: {
        Args: { p_periods: string[]; p_user_id: string }
        Returns: {
          category: Database["public"]["Enums"]["transaction_category"]
          period: string
          total_amount: number
          transaction_count: number
        }[]
      }
      get_dashboard_category_breakdown: {
        Args: { p_period: string; p_user_id: string }
        Returns: {
          category: Database["public"]["Enums"]["transaction_category"]
          total_amount: number
          transaction_count: number
        }[]
      }
      get_dashboard_monthly_flow: {
        Args: { p_months: number; p_until_period: string; p_user_id: string }
        Returns: {
          period: string
          total_amount: number
        }[]
      }
      get_dashboard_summary: {
        Args: { p_period: string; p_through_day?: number; p_user_id: string }
        Returns: {
          active_days: number
          deposit_total: number
          refund_total: number
          top_category: Database["public"]["Enums"]["transaction_category"]
          top_category_amount: number
          total_expense: number
          transaction_count: number
        }[]
      }
      get_dashboard_top_merchants: {
        Args: { p_limit: number; p_period: string; p_user_id: string }
        Returns: {
          category: Database["public"]["Enums"]["transaction_category"]
          merchant_normalized: string
          total_amount: number
          transaction_count: number
        }[]
      }
      get_merchant_history: {
        Args: { p_until_period: string; p_user_id: string }
        Returns: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          id: string
          merchant_normalized: string
          period: string
          transacted_on: string
        }[]
      }
      get_period_transactions: {
        Args: { p_period: string; p_user_id: string }
        Returns: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          id: string
          merchant_normalized: string
          period: string
          transacted_on: string
        }[]
      }
      get_recurring_signals_latest: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          impact: number
          narrative: string
          payload: Json
          period: string
          target_key: string
          type: Database["public"]["Enums"]["spending_signal_type"]
        }[]
      }
      get_seen_merchants_before_period: {
        Args: { p_period: string; p_user_id: string }
        Returns: {
          merchant_normalized: string
        }[]
      }
      get_transaction_months: {
        Args: { p_user_id: string }
        Returns: {
          period: string
          transaction_count: number
        }[]
      }
      get_transactions_page: {
        Args: {
          p_categories?: Database["public"]["Enums"]["transaction_category"][]
          p_limit?: number
          p_offset?: number
          p_period: string
          p_search?: string
          p_user_id: string
        }
        Returns: {
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          category_overridden: boolean
          id: string
          merchant_normalized: string
          merchant_raw: string
          transacted_on: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }[]
      }
      get_transactions_summary: {
        Args: {
          p_categories?: Database["public"]["Enums"]["transaction_category"][]
          p_period: string
          p_search?: string
          p_user_id: string
        }
        Returns: {
          deposit_total: number
          expense_total: number
          refund_total: number
          transaction_count: number
        }[]
      }
    }
    Enums: {
      spending_signal_type:
        | "category_spike"
        | "new_merchant_large"
        | "outlier_transaction"
        | "recurring_payment"
        | "recurring_price_up"
      subscription_status: "trialing" | "active" | "canceled"
      transaction_category:
        | "식비"
        | "카페/간식"
        | "생활/마트"
        | "교통"
        | "주거/통신"
        | "쇼핑"
        | "의료/건강"
        | "문화/여가"
        | "금융/보험"
        | "기타"
      transaction_type: "expense" | "refund" | "deposit"
      upload_job_status:
        | "pending"
        | "parsing"
        | "needs_mapping"
        | "categorizing"
        | "completed"
        | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      spending_signal_type: [
        "category_spike",
        "new_merchant_large",
        "outlier_transaction",
        "recurring_payment",
        "recurring_price_up",
      ],
      subscription_status: ["trialing", "active", "canceled"],
      transaction_category: [
        "식비",
        "카페/간식",
        "생활/마트",
        "교통",
        "주거/통신",
        "쇼핑",
        "의료/건강",
        "문화/여가",
        "금융/보험",
        "기타",
      ],
      transaction_type: ["expense", "refund", "deposit"],
      upload_job_status: [
        "pending",
        "parsing",
        "needs_mapping",
        "categorizing",
        "completed",
        "failed",
      ],
    },
  },
} as const

