import {
  corsHeaders,
  getServiceClient,
  requireAdmin,
  jsonResponse,
} from "../_shared/appmax.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();

  // Admin-only
  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof Response) return authResult;

  return jsonResponse({
    ok: true,
    now: new Date().toISOString(),
    message: "Healthcheck ping endpoint is reachable",
  });
});
