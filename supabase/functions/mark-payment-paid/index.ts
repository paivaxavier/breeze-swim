import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { breezeEmailHtml, requireAdmin, sendResendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { payment_id, registration_id, method, note } = await req.json();

  if (payment_id) {
    const { data: payment, error } = await auth.userClient!.rpc("mark_payment_paid", {
      p_payment_id: payment_id,
      p_method: method,
      p_note: note || null,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    const { data: family } = await auth.supabase!
      .from("families")
      .select("primary_email, primary_name")
      .eq("id", payment.family_id)
      .single();

    let emailed = false;
    if (family?.primary_email) {
      try {
        const amount = (payment.amount_cents / 100).toFixed(0);
        const html = breezeEmailHtml(
          `<p>Hi${family.primary_name ? ` ${family.primary_name.split(" ")[0]}` : ""},</p>
           <p>Thank you! We received your <strong>$${amount}</strong> payment for the week of
           <strong>${payment.due_date}</strong> via <strong>${method}</strong>.</p>
           <p>See you at the pool!</p>`,
        );
        const result = await sendResendEmail(
          family.primary_email,
          "Payment received — Breeze Swim",
          html,
        );
        emailed = result.emailed;
      } catch {
        emailed = false;
      }
    }

    return new Response(JSON.stringify({ ok: true, payment, emailed }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (registration_id) {
    const { data: reg, error } = await auth.userClient!.rpc("mark_registration_paid", {
      p_registration_id: registration_id,
      p_method: method,
      p_note: note || null,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    const { data: swimmer } = await auth.supabase!
      .from("swimmers")
      .select("name, family_id, families(primary_email, primary_name)")
      .eq("id", reg.swimmer_id)
      .single();

    const family = swimmer?.families as { primary_email: string; primary_name: string } | null;
    let emailed = false;
    if (family?.primary_email) {
      try {
        const amount = (reg.amount_cents / 100).toFixed(0);
        const html = breezeEmailHtml(
          `<p>Hi${family.primary_name ? ` ${family.primary_name.split(" ")[0]}` : ""},</p>
           <p>Thank you! We received the <strong>$${amount}</strong> annual registration for
           <strong>${swimmer?.name}</strong> (${reg.fee_year}) via <strong>${method}</strong>.</p>`,
        );
        const result = await sendResendEmail(
          family.primary_email,
          "Registration payment received — Breeze Swim",
          html,
        );
        emailed = result.emailed;
      } catch {
        emailed = false;
      }
    }

    return new Response(JSON.stringify({ ok: true, registration: reg, emailed }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Missing payment_id or registration_id" }), {
    status: 400,
  });
});
