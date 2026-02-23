import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_ROBOTS = `User-agent: *
Disallow: /admin/
Disallow: /carrinho
Disallow: /checkout
Sitemap: https://vanessalima.lovable.app/sitemap.xml`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(DEFAULT_ROBOTS, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
