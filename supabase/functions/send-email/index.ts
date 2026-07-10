import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { breezeEmailHtml, requireAdmin, sendResendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { family_id, subject, body, message_type = "custom", send_email = true } = await req.json();
  if (!subject || !body) {
    return new Response(JSON.stringify({ error: "Missing subject or body" }), { status: 400 });
  }

  let familyIds: string[] = [];
  if (family_id === "all") {
    const { data: families } = await auth.supabase!
      .from("swimmers")
      .select("family_id")
      .eq("status", "active");
    familyIds = [...new Set((families || []).map((f) => f.family_id as string))];
  } else if (family_id) {
    familyIds = [family_id];
  } else {
    return new Response(JSON.stringify({ error: "Missing family_id" }), { status: 400 });
  }

  const emailed: string[] = [];
  const errors: string[] = [];

  for (const fid of familyIds) {
    await auth.userClient!.rpc("send_family_message", {
      p_family_id: fid,
      p_subject: subject,
      p_body: body,
      p_message_type: message_type,
    });

    if (!send_email) continue;

    const { data: family } = await auth.supabase!
      .from("families")
      .select("primary_email, primary_name")
      .eq("id", fid)
      .single();

    if (!family?.primary_email) continue;

    try {
      const html = breezeEmailHtml(
        `<p>Hi${family.primary_name ? ` ${family.primary_name.split(" ")[0]}` : ""},</p>
         <div style="font-size: 15px; line-height: 1.6;">${body.replace(/\n/g, "<br>")}</div>`,
      );
      await sendResendEmail(family.primary_email, subject, html);
      emailed.push(family.primary_email);
    } catch (e) {
      errors.push(`${family.primary_email}: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      families: familyIds.length,
      emailed: emailed.length,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
