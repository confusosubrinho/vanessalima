/**
 * Seed QA: garante 1 categoria, 1 produto ativo com 1 variante (estoque >= 10) e 1 usuário admin para E2E.
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-qa.mjs
 * Ou: npm run seed:qa (carrega .env se existir)
 *
 * Admin E2E: credenciais padrão qa-admin@example.com / qa-admin-e2e-secure (ou E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(url, key);

const CATEGORY_SLUG = 'qa-e2e-cat';
const PRODUCT_SLUG = 'qa-prod-e2e';
const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'qa-admin@example.com';
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'qa-admin-e2e-secure';

async function ensureAdminUser() {
  const { data: existing } = await supabase.from('user_roles').select('user_id').eq('role', 'admin').limit(1).maybeSingle();
  if (existing?.user_id) {
    const { data: usr } = await supabase.auth.admin.getUserById(existing.user_id);
    if (usr?.user?.email === E2E_ADMIN_EMAIL) {
      console.log('Admin E2E já existe:', E2E_ADMIN_EMAIL);
      return;
    }
  }

  const { data: authData, error: createError } = await supabase.auth.admin.createUser({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (createError) {
    if (createError.message?.includes('already been registered') || createError.message?.includes('already registered')) {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const user = list?.users?.find((u) => u.email === E2E_ADMIN_EMAIL);
      if (user) {
        const { error: roleErr } = await supabase.from('user_roles').upsert(
          { user_id: user.id, role: 'admin' },
          { onConflict: 'user_id,role' }
        );
        if (roleErr) console.error('Erro ao inserir user_roles admin:', roleErr.message);
        else console.log('Admin E2E: user_roles inserido para', E2E_ADMIN_EMAIL);
        return;
      }
    }
    console.error('Erro ao criar admin E2E:', createError.message);
    return;
  }

  if (authData?.user?.id) {
    const { error: roleErr } = await supabase.from('user_roles').insert({ user_id: authData.user.id, role: 'admin' });
    if (roleErr) console.error('Erro ao inserir user_roles admin:', roleErr.message);
    else console.log('Admin E2E criado:', E2E_ADMIN_EMAIL);
  }
}

async function run() {
  await ensureAdminUser();

  let categoryId = (await supabase.from('categories').select('id').eq('slug', CATEGORY_SLUG).maybeSingle()).data?.id;
  if (!categoryId) {
    const { data: inserted, error } = await supabase.from('categories').insert({
      name: 'QA E2E',
      slug: CATEGORY_SLUG,
      is_active: true,
      display_order: 0,
    }).select('id').single();
    if (error) {
      console.error('Erro ao criar categoria:', error.message);
      process.exit(1);
    }
    categoryId = inserted.id;
    console.log('Categoria criada:', categoryId);
  }

  let productId = (await supabase.from('products').select('id').eq('slug', PRODUCT_SLUG).maybeSingle()).data?.id;
  if (!productId) {
    const { data: inserted, error } = await supabase.from('products').insert({
      name: 'Produto QA E2E',
      slug: PRODUCT_SLUG,
      description: 'Para testes E2E',
      base_price: 99.99,
      sale_price: 79.99,
      category_id: categoryId,
      is_active: true,
      is_featured: true,
      is_new: true,
    }).select('id').single();
    if (error) {
      console.error('Erro ao criar produto:', error.message);
      process.exit(1);
    }
    productId = inserted.id;
    console.log('Produto criado:', productId);
  }

  const { data: variants } = await supabase.from('product_variants').select('id, stock_quantity').eq('product_id', productId);
  let variantId = variants?.[0]?.id;
  if (!variantId) {
    const { data: inserted, error } = await supabase.from('product_variants').insert({
      product_id: productId,
      size: '38',
      color: 'Preto',
      stock_quantity: 10,
      price_modifier: 0,
      sku: 'QA-E2E-38',
      is_active: true,
    }).select('id').single();
    if (error) {
      console.error('Erro ao criar variante:', error.message);
      process.exit(1);
    }
    variantId = inserted.id;
    console.log('Variante criada:', variantId, 'estoque 10');
  } else {
    await supabase.from('product_variants').update({ stock_quantity: 10, is_active: true }).eq('id', variantId);
    console.log('Variante existente atualizada: estoque 10');
  }

  const { data: imgs } = await supabase.from('product_images').select('id').eq('product_id', productId).limit(1);
  if (!imgs?.length) {
    await supabase.from('product_images').insert({
      product_id: productId,
      url: 'https://placehold.co/400x400?text=QA',
      alt_text: 'QA',
      display_order: 0,
      is_primary: true,
    });
    console.log('Imagem do produto criada');
  }

  console.log('Seed QA concluído. Slug produto:', PRODUCT_SLUG, '| Categoria:', CATEGORY_SLUG);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
