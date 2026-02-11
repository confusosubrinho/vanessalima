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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_data: Json
          contacted_at: string | null
          contacted_via: string | null
          created_at: string
          customer_name: string | null
          email: string | null
          id: string
          page_url: string | null
          phone: string | null
          recovered: boolean | null
          recovered_at: string | null
          session_id: string
          subtotal: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          cart_data?: Json
          contacted_at?: string | null
          contacted_via?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          page_url?: string | null
          phone?: string | null
          recovered?: boolean | null
          recovered_at?: string | null
          session_id: string
          subtotal?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          cart_data?: Json
          contacted_at?: string | null
          contacted_via?: string | null
          created_at?: string
          customer_name?: string | null
          email?: string | null
          id?: string
          page_url?: string | null
          phone?: string | null
          recovered?: boolean | null
          recovered_at?: string | null
          session_id?: string
          subtotal?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          cta_text: string | null
          cta_url: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          mobile_image_url: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      buy_together_products: {
        Row: {
          created_at: string
          discount_percent: number | null
          display_order: number | null
          id: string
          is_active: boolean | null
          product_id: string
          related_product_id: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          product_id: string
          related_product_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          product_id?: string
          related_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buy_together_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_together_products_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          banner_image_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          parent_category_id: string | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          banner_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          parent_category_id?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          banner_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          parent_category_id?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expiry_date: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_purchase_amount: number | null
          updated_at: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_purchase_amount?: number | null
          updated_at?: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_purchase_amount?: number | null
          updated_at?: string
          uses_count?: number | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          birthday: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birthday?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_automation_logs: {
        Row: {
          automation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "email_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automations: {
        Row: {
          automation_type: string
          created_at: string
          delay_minutes: number | null
          email_body: string
          email_subject: string
          id: string
          is_active: boolean | null
          trigger_event: string
          updated_at: string
        }
        Insert: {
          automation_type: string
          created_at?: string
          delay_minutes?: number | null
          email_body: string
          email_subject: string
          id?: string
          is_active?: boolean | null
          trigger_event: string
          updated_at?: string
        }
        Update: {
          automation_type?: string
          created_at?: string
          delay_minutes?: number | null
          email_body?: string
          email_subject?: string
          id?: string
          is_active?: boolean | null
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          error_context: Json | null
          error_message: string
          error_stack: string | null
          error_type: string
          id: string
          is_resolved: boolean | null
          page_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_context?: Json | null
          error_message: string
          error_stack?: string | null
          error_type: string
          id?: string
          is_resolved?: boolean | null
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_context?: Json | null
          error_message?: string
          error_stack?: string | null
          error_type?: string
          id?: string
          is_resolved?: boolean | null
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      features_bar: {
        Row: {
          created_at: string
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      highlight_banners: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      home_sections: {
        Row: {
          card_bg: boolean | null
          category_id: string | null
          created_at: string
          dark_bg: boolean | null
          display_order: number | null
          id: string
          is_active: boolean | null
          max_items: number | null
          product_ids: string[] | null
          section_type: string
          show_view_all: boolean | null
          sort_order: string | null
          source_type: string
          subtitle: string | null
          title: string
          updated_at: string
          view_all_link: string | null
        }
        Insert: {
          card_bg?: boolean | null
          category_id?: string | null
          created_at?: string
          dark_bg?: boolean | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          product_ids?: string[] | null
          section_type?: string
          show_view_all?: boolean | null
          sort_order?: string | null
          source_type?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          view_all_link?: string | null
        }
        Update: {
          card_bg?: boolean | null
          category_id?: string | null
          created_at?: string
          dark_bg?: boolean | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_items?: number | null
          product_ids?: string[] | null
          section_type?: string
          show_view_all?: boolean | null
          sort_order?: string | null
          source_type?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          view_all_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_sections_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_videos: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          product_id: string | null
          thumbnail_url: string | null
          updated_at: string
          username: string | null
          video_url: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          product_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          username?: string | null
          video_url: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          product_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          username?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_hash: string | null
          success: boolean | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          success?: boolean | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          success?: boolean | null
        }
        Relationships: []
      }
      order_events: {
        Row: {
          appmax_order_id: string | null
          event_hash: string
          event_type: string
          id: number
          order_id: string | null
          payload: Json
          received_at: string | null
        }
        Insert: {
          appmax_order_id?: string | null
          event_hash: string
          event_type: string
          id?: number
          order_id?: string | null
          payload: Json
          received_at?: string | null
        }
        Update: {
          appmax_order_id?: string | null
          event_hash?: string
          event_type?: string
          id?: number
          order_id?: string | null
          payload?: Json
          received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          product_variant_id: string | null
          quantity: number
          total_price: number
          unit_price: number
          variant_info: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          product_variant_id?: string | null
          quantity: number
          total_price: number
          unit_price: number
          variant_info?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_variant_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
          variant_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          appmax_customer_id: string | null
          appmax_order_id: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number | null
          id: string
          last_webhook_event: string | null
          notes: string | null
          order_number: string
          payment_method: string | null
          shipping_address: string
          shipping_city: string
          shipping_cost: number | null
          shipping_name: string
          shipping_phone: string | null
          shipping_state: string
          shipping_zip: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          tracking_code: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          appmax_customer_id?: string | null
          appmax_order_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          id?: string
          last_webhook_event?: string | null
          notes?: string | null
          order_number: string
          payment_method?: string | null
          shipping_address: string
          shipping_city: string
          shipping_cost?: number | null
          shipping_name: string
          shipping_phone?: string | null
          shipping_state: string
          shipping_zip: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          tracking_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          appmax_customer_id?: string | null
          appmax_order_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number | null
          id?: string
          last_webhook_event?: string | null
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          shipping_address?: string
          shipping_city?: string
          shipping_cost?: number | null
          shipping_name?: string
          shipping_phone?: string | null
          shipping_state?: string
          shipping_zip?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total_amount?: number
          tracking_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      page_contents: {
        Row: {
          content: string | null
          created_at: string
          id: string
          meta_description: string | null
          page_slug: string
          page_title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          page_slug: string
          page_title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          page_slug?: string
          page_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods_display: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_characteristics: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          name: string
          product_id: string
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          name: string
          product_id: string
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          name?: string
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_characteristics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number | null
          id: string
          is_primary: boolean | null
          media_type: string | null
          product_id: string
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type?: string | null
          product_id: string
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type?: string | null
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          is_approved: boolean | null
          is_verified_purchase: boolean | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_name: string
          id?: string
          is_approved?: boolean | null
          is_verified_purchase?: boolean | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          is_approved?: boolean | null
          is_verified_purchase?: boolean | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          bling_variant_id: number | null
          color: string | null
          color_hex: string | null
          created_at: string
          id: string
          is_active: boolean | null
          price_modifier: number | null
          product_id: string
          size: string
          sku: string | null
          stock_quantity: number
        }
        Insert: {
          bling_variant_id?: number | null
          color?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          price_modifier?: number | null
          product_id: string
          size: string
          sku?: string | null
          stock_quantity?: number
        }
        Update: {
          bling_variant_id?: number | null
          color?: string | null
          color_hex?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          price_modifier?: number | null
          product_id?: string
          size?: string
          sku?: string | null
          stock_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          age_group: string | null
          base_price: number
          bling_product_id: number | null
          brand: string | null
          category_id: string | null
          condition: string | null
          cost: number | null
          created_at: string
          depth: number | null
          description: string | null
          gender: string | null
          google_product_category: string | null
          gtin: string | null
          height: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_new: boolean | null
          material: string | null
          mpn: string | null
          name: string
          pattern: string | null
          sale_price: number | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          sku: string | null
          slug: string
          updated_at: string
          video_url: string | null
          weight: number | null
          width: number | null
        }
        Insert: {
          age_group?: string | null
          base_price: number
          bling_product_id?: number | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cost?: number | null
          created_at?: string
          depth?: number | null
          description?: string | null
          gender?: string | null
          google_product_category?: string | null
          gtin?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          material?: string | null
          mpn?: string | null
          name: string
          pattern?: string | null
          sale_price?: number | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          sku?: string | null
          slug: string
          updated_at?: string
          video_url?: string | null
          weight?: number | null
          width?: number | null
        }
        Update: {
          age_group?: string | null
          base_price?: number
          bling_product_id?: number | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cost?: number | null
          created_at?: string
          depth?: number | null
          description?: string | null
          gender?: string | null
          google_product_category?: string | null
          gtin?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_new?: boolean | null
          material?: string | null
          mpn?: string | null
          name?: string
          pattern?: string | null
          sale_price?: number | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          sku?: string | null
          slug?: string
          updated_at?: string
          video_url?: string | null
          weight?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      security_seals: {
        Row: {
          created_at: string
          display_order: number | null
          html_code: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          address: string | null
          app_version: string | null
          appmax_access_token: string | null
          appmax_environment: string | null
          bling_access_token: string | null
          bling_client_id: string | null
          bling_client_secret: string | null
          bling_refresh_token: string | null
          bling_store_id: string | null
          bling_token_expires_at: string | null
          body_code: string | null
          cash_discount: number | null
          cnpj: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string
          facebook_pixel_id: string | null
          facebook_url: string | null
          free_shipping_threshold: number | null
          full_address: string | null
          google_analytics_id: string | null
          head_code: string | null
          id: string
          instagram_url: string | null
          installment_interest_rate: number | null
          installments_without_interest: number | null
          logo_url: string | null
          max_installments: number | null
          melhor_envio_sandbox: boolean | null
          melhor_envio_token: string | null
          min_installment_value: number | null
          pix_discount: number | null
          rede_environment: string | null
          rede_merchant_id: string | null
          rede_merchant_key: string | null
          shipping_allowed_services: Json | null
          shipping_free_enabled: boolean | null
          shipping_free_label: string | null
          shipping_free_min_value: number | null
          shipping_regions: Json | null
          shipping_store_pickup_address: string | null
          shipping_store_pickup_enabled: boolean | null
          shipping_store_pickup_label: string | null
          store_name: string | null
          tiktok_pixel_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          app_version?: string | null
          appmax_access_token?: string | null
          appmax_environment?: string | null
          bling_access_token?: string | null
          bling_client_id?: string | null
          bling_client_secret?: string | null
          bling_refresh_token?: string | null
          bling_store_id?: string | null
          bling_token_expires_at?: string | null
          body_code?: string | null
          cash_discount?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          facebook_pixel_id?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          full_address?: string | null
          google_analytics_id?: string | null
          head_code?: string | null
          id?: string
          instagram_url?: string | null
          installment_interest_rate?: number | null
          installments_without_interest?: number | null
          logo_url?: string | null
          max_installments?: number | null
          melhor_envio_sandbox?: boolean | null
          melhor_envio_token?: string | null
          min_installment_value?: number | null
          pix_discount?: number | null
          rede_environment?: string | null
          rede_merchant_id?: string | null
          rede_merchant_key?: string | null
          shipping_allowed_services?: Json | null
          shipping_free_enabled?: boolean | null
          shipping_free_label?: string | null
          shipping_free_min_value?: number | null
          shipping_regions?: Json | null
          shipping_store_pickup_address?: string | null
          shipping_store_pickup_enabled?: boolean | null
          shipping_store_pickup_label?: string | null
          store_name?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          app_version?: string | null
          appmax_access_token?: string | null
          appmax_environment?: string | null
          bling_access_token?: string | null
          bling_client_id?: string | null
          bling_client_secret?: string | null
          bling_refresh_token?: string | null
          bling_store_id?: string | null
          bling_token_expires_at?: string | null
          body_code?: string | null
          cash_discount?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          facebook_pixel_id?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          full_address?: string | null
          google_analytics_id?: string | null
          head_code?: string | null
          id?: string
          instagram_url?: string | null
          installment_interest_rate?: number | null
          installments_without_interest?: number | null
          logo_url?: string | null
          max_installments?: number | null
          melhor_envio_sandbox?: boolean | null
          melhor_envio_token?: string | null
          min_installment_value?: number | null
          pix_discount?: number | null
          rede_environment?: string | null
          rede_merchant_id?: string | null
          rede_merchant_key?: string | null
          shipping_allowed_services?: Json | null
          shipping_free_enabled?: boolean | null
          shipping_free_label?: string | null
          shipping_free_min_value?: number | null
          shipping_regions?: Json | null
          shipping_store_pickup_address?: string | null
          shipping_store_pickup_enabled?: boolean | null
          shipping_store_pickup_label?: string | null
          store_name?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      traffic_sessions: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          ip_hash: string | null
          landing_page: string | null
          referrer: string | null
          session_id: string
          traffic_type: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          session_id: string
          traffic_type?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          referrer?: string | null
          session_id?: string
          traffic_type?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      store_settings_public: {
        Row: {
          address: string | null
          app_version: string | null
          appmax_environment: string | null
          body_code: string | null
          cash_discount: number | null
          cnpj: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string | null
          facebook_pixel_id: string | null
          facebook_url: string | null
          free_shipping_threshold: number | null
          full_address: string | null
          google_analytics_id: string | null
          head_code: string | null
          id: string | null
          instagram_url: string | null
          installment_interest_rate: number | null
          installments_without_interest: number | null
          logo_url: string | null
          max_installments: number | null
          min_installment_value: number | null
          pix_discount: number | null
          shipping_free_enabled: boolean | null
          shipping_free_label: string | null
          shipping_free_min_value: number | null
          shipping_regions: Json | null
          shipping_store_pickup_address: string | null
          shipping_store_pickup_enabled: boolean | null
          shipping_store_pickup_label: string | null
          store_name: string | null
          tiktok_pixel_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          app_version?: string | null
          appmax_environment?: string | null
          body_code?: string | null
          cash_discount?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          facebook_pixel_id?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          full_address?: string | null
          google_analytics_id?: string | null
          head_code?: string | null
          id?: string | null
          instagram_url?: string | null
          installment_interest_rate?: number | null
          installments_without_interest?: number | null
          logo_url?: string | null
          max_installments?: number | null
          min_installment_value?: number | null
          pix_discount?: number | null
          shipping_free_enabled?: boolean | null
          shipping_free_label?: string | null
          shipping_free_min_value?: number | null
          shipping_regions?: Json | null
          shipping_store_pickup_address?: string | null
          shipping_store_pickup_enabled?: boolean | null
          shipping_store_pickup_label?: string | null
          store_name?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          app_version?: string | null
          appmax_environment?: string | null
          body_code?: string | null
          cash_discount?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          facebook_pixel_id?: string | null
          facebook_url?: string | null
          free_shipping_threshold?: number | null
          full_address?: string | null
          google_analytics_id?: string | null
          head_code?: string | null
          id?: string | null
          instagram_url?: string | null
          installment_interest_rate?: number | null
          installments_without_interest?: number | null
          logo_url?: string | null
          max_installments?: number | null
          min_installment_value?: number | null
          pix_discount?: number | null
          shipping_free_enabled?: boolean | null
          shipping_free_label?: string | null
          shipping_free_min_value?: number | null
          shipping_regions?: Json | null
          shipping_store_pickup_address?: string | null
          shipping_store_pickup_enabled?: boolean | null
          shipping_store_pickup_label?: string | null
          store_name?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_login_rate_limit: { Args: { p_email: string }; Returns: boolean }
      decrement_stock: {
        Args: { p_quantity: number; p_variant_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_uses: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      discount_type: "percentage" | "fixed"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
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
      app_role: ["admin", "user"],
      discount_type: ["percentage", "fixed"],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
