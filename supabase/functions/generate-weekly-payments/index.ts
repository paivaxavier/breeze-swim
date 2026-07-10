import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAdmin } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { week_start } = await req.json().catch(() => ({}));
  const { data: count, error } = await auth.userClient!.rpc("generate_weekly_payments", {
    p_week_start: week_start || null,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, created: count }), {
    headers: { "Content-Type": "application/json" },
  });
});
