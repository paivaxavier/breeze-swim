import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { invite_id, invite_url } = await req.json();
  if (!invite_id || !invite_url) {
    return new Response(JSON.stringify({ error: "Missing invite_id or invite_url" }), {
      status: 400,
    });
  }

  const { data: invite } = await supabase
    .from("family_invites")
    .select("email, invite_role, family_id, families(primary_name, swimmers(name))")
    .eq("id", invite_id)
    .single();

  if (!invite) {
    return new Response(JSON.stringify({ error: "Invite not found" }), { status: 404 });
  }

  const family = invite.families as { primary_name: string; swimmers: { name: string }[] };
  const swimmerName = family?.swimmers?.[0]?.name || "your swimmer";
  const subject =
    invite.invite_role === "guest"
      ? `Breeze Swim caregiver portal invite`
      : `Your Breeze Swim client portal login`;

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <h1 style="color: #147a85; font-size: 24px;">Breeze Swim</h1>
      <p>Hi${family?.primary_name ? ` ${family.primary_name.split(" ")[0]}` : ""},</p>
      <p>You've been invited to the Breeze Swim client portal${invite.invite_role === "guest" ? " as a caregiver" : ""}.</p>
      <p>Lessons for <strong>${swimmerName}</strong> — schedule, location, and important info live here.</p>
      <p style="margin: 28px 0;">
        <a href="${invite_url}" style="background: #fb5b86; color: white; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: bold;">Open your portal invite</a>
      </p>
      <p style="font-size: 14px; color: #64748b;">Or copy this link: ${invite_url}</p>
      <p style="font-size: 14px; color: #64748b;">Questions? Reply to breezeswimlessons@gmail.com</p>
    </div>
  `;

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ ok: true, emailed: false, message: "RESEND_API_KEY not set; use invite link manually." }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Breeze Swim <onboarding@resend.dev>",
      to: [invite.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ ok: false, emailed: false, error: err }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, emailed: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
