 // Custom types for our e-commerce
 export interface Category {
   id: string;
   name: string;
   slug: string;
   description: string | null;
   image_url: string | null;
   display_order: number;
   is_active: boolean;
   created_at: string;
   updated_at: string;
 }
 
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  sale_price: number | null;
  cost: number | null;
  sku: string | null;
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  created_at: string;
  updated_at: string;
  // Google Merchant Center & Shipping fields
  weight: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  condition: string | null;
  google_product_category: string | null;
  age_group: string | null;
  gender: string | null;
  material: string | null;
  pattern: string | null;
  // SEO fields
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  // Relations
  category?: Category;
  images?: ProductImage[];
  variants?: ProductVariant[];
}
 
 export interface ProductImage {
   id: string;
   product_id: string;
   url: string;
   alt_text: string | null;
   display_order: number;
   is_primary: boolean;
   product_variant_id?: string | null;
   created_at: string;
 }
 
 export interface ProductVariant {
   id: string;
   product_id: string;
   size: string;
   color: string | null;
   color_hex: string | null;
   stock_quantity: number;
   price_modifier: number;
   base_price: number | null;
   sale_price: number | null;
   sku: string | null;
   is_active: boolean;
   created_at: string;
 }
 
export interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
 
 export interface Coupon {
   id: string;
   code: string;
   discount_type: 'percentage' | 'fixed';
   discount_value: number;
   min_purchase_amount: number;
   max_uses: number | null;
   uses_count: number;
   expiry_date: string | null;
   is_active: boolean;
   type?: 'standard' | 'free_shipping' | 'first_purchase' | null;
   applicable_category_id?: string | null;
   applicable_product_ids?: string[] | null;
   applicable_states?: string[] | null;
   applicable_zip_prefixes?: string[] | null;
   created_at: string;
   updated_at: string;
 }
 
 export interface Customer {
   id: string;
   user_id: string | null;
   email: string;
   full_name: string;
   phone: string | null;
   total_orders: number;
   total_spent: number;
   created_at: string;
   updated_at: string;
 }
 
 export interface Order {
   id: string;
   order_number: string;
   customer_id: string | null;
   user_id: string | null;
   subtotal: number;
   shipping_cost: number;
   discount_amount: number;
   total_amount: number;
   status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
   shipping_name: string;
   shipping_address: string;
   shipping_city: string;
   shipping_state: string;
   shipping_zip: string;
   shipping_phone: string | null;
   tracking_code: string | null;
   coupon_code: string | null;
   notes: string | null;
   created_at: string;
   updated_at: string;
   items?: OrderItem[];
   customer?: Customer;
 }
 
 export interface OrderItem {
   id: string;
   order_id: string;
   product_id: string | null;
   product_variant_id: string | null;
   product_name: string;
   variant_info: string | null;
   quantity: number;
   unit_price: number;
   total_price: number;
   created_at: string;
 }
 
  export interface StoreSettings {
    id: string;
    store_name: string;
    logo_url: string | null;
    header_logo_url?: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    contact_whatsapp: string | null;
    address: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
    free_shipping_threshold: number;
    max_installments: number;
    pix_discount: number | null;
    installments_without_interest: number | null;
    installment_interest_rate: number | null;
    min_installment_value: number | null;
    created_at: string;
    updated_at: string;
  }
 
 export interface CartItem {
   product: Product;
   variant: ProductVariant;
   quantity: number;
 }
 
 export interface ProductReview {
   id: string;
   product_id: string;
   user_id: string | null;
   customer_name: string;
   rating: number;
   title: string | null;
   comment: string | null;
   is_verified_purchase: boolean;
   is_approved: boolean;
   created_at: string;
   updated_at: string;
 }
 
 export interface ShippingOption {
   name: string;
   price: number;
   deadline: string;
   company: string;
 }