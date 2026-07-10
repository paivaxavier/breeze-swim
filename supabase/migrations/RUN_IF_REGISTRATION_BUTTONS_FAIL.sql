-- Run in Supabase SQL Editor — safe to run more than once.
-- Creates full payments schema (migration 004) if missing + registration button fixes.

-- ========== Types (from 004) ==========
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('due', 'paid', 'waived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('zelle', 'cash', 'square');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM (
      'announcement',
      'payment_due',
      'payment_received',
      'lesson_reminder',
      'custom'
    );
  END IF;
END
$do$;

-- ========== Tables (from 004) ==========
CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    swimmer_id uuid REFERENCES swimmers(id) ON DELETE SET NULL,
    due_date date NOT NULL,
    amount_cents int NOT NULL DEFAULT 9000,
    status payment_status NOT NULL DEFAULT 'due',
    method payment_method,
    paid_at timestamptz,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (family_id, due_date)
);

CREATE TABLE IF NOT EXISTS registration_fees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    swimmer_id uuid NOT NULL REFERENCES swimmers(id) ON DELETE CASCADE,
    fee_year int NOT NULL,
    amount_cents int NOT NULL DEFAULT 5000,
    status payment_status NOT NULL DEFAULT 'due',
    method payment_method,
    paid_at timestamptz,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (swimmer_id, fee_year)
);

CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid REFERENCES families(id) ON DELETE CASCADE,
    message_type message_type NOT NULL DEFAULT 'custom',
    subject text NOT NULL,
    body text NOT NULL,
    sent_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_family ON payments(family_id);
CREATE INDEX IF NOT EXISTS idx_payments_due ON payments(status, due_date);
CREATE INDEX IF NOT EXISTS idx_registration_swimmer ON registration_fees(swimmer_id);
CREATE INDEX IF NOT EXISTS idx_messages_family ON messages(family_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ========== RPCs ==========
CREATE OR REPLACE FUNCTION week_start_monday(p_date date DEFAULT current_date)
RETURNS date AS $$
    SELECT (p_date - ((extract(isodow FROM p_date)::int - 1) || ' days')::interval)::date;
$$ LANGUAGE sql IMMUTABLE;

GRANT EXECUTE ON FUNCTION week_start_monday(date) TO authenticated;

CREATE OR REPLACE FUNCTION generate_weekly_payments(p_week_start date DEFAULT week_start_monday(current_date))
RETURNS int AS $$
DECLARE
    inserted_count int := 0;
    rec record;
    new_id uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    FOR rec IN
        SELECT DISTINCT ON (f.id) f.id AS family_id, s.id AS swimmer_id
        FROM families f
        JOIN swimmers s ON s.family_id = f.id
        JOIN enrollments e ON e.swimmer_id = s.id
        WHERE s.status = 'active'
          AND (e.start_date IS NULL OR e.start_date <= p_week_start + 6)
          AND (e.end_date IS NULL OR e.end_date >= p_week_start)
        ORDER BY f.id, s.created_at
    LOOP
        new_id := NULL;
        INSERT INTO payments (family_id, swimmer_id, due_date, amount_cents, status)
        VALUES (rec.family_id, rec.swimmer_id, p_week_start, 9000, 'due')
        ON CONFLICT (family_id, due_date) DO NOTHING
        RETURNING id INTO new_id;

        IF new_id IS NOT NULL THEN
            inserted_count := inserted_count + 1;
        END IF;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_weekly_payments(date) TO authenticated;

CREATE OR REPLACE FUNCTION mark_payment_paid(
    p_payment_id uuid,
    p_method payment_method,
    p_note text DEFAULT NULL
)
RETURNS payments AS $$
DECLARE
    result payments;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE payments
    SET status = 'paid',
        method = p_method,
        paid_at = now(),
        note = p_note
    WHERE id = p_payment_id AND status = 'due'
    RETURNING * INTO result;

    IF result IS NULL THEN
        RAISE EXCEPTION 'Payment not found or already paid';
    END IF;

    BEGIN
        INSERT INTO messages (family_id, message_type, subject, body, sent_by)
        VALUES (
            result.family_id,
            'payment_received',
            'Payment received — Breeze Swim',
            format(
                'Thank you! We received your $%s payment for the week of %s via %s.',
                (result.amount_cents / 100.0)::text,
                to_char(result.due_date, 'Mon FMMonth FMDD'),
                initcap(p_method::text)
            ),
            auth.uid()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_payment_paid(uuid, payment_method, text) TO authenticated;

CREATE OR REPLACE FUNCTION ensure_registration_fee(
    p_swimmer_id uuid,
    p_year int DEFAULT extract(year FROM current_date)::int
)
RETURNS registration_fees AS $$
DECLARE
    result registration_fees;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO registration_fees (swimmer_id, fee_year, amount_cents, status)
    VALUES (p_swimmer_id, p_year, 5000, 'due')
    ON CONFLICT (swimmer_id, fee_year) DO NOTHING;

    SELECT * INTO result FROM registration_fees
    WHERE swimmer_id = p_swimmer_id AND fee_year = p_year;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION ensure_registration_fee(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION mark_registration_paid(
    p_registration_id uuid,
    p_method payment_method,
    p_note text DEFAULT NULL
)
RETURNS registration_fees AS $$
DECLARE
    result registration_fees;
    fam_id uuid;
    swimmer_name text;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE registration_fees
    SET status = 'paid',
        method = p_method,
        paid_at = now(),
        note = p_note
    WHERE id = p_registration_id AND status = 'due'
    RETURNING * INTO result;

    IF result IS NULL THEN
        SELECT * INTO result FROM registration_fees WHERE id = p_registration_id;
        IF result IS NULL THEN
            RAISE EXCEPTION 'Registration fee not found';
        END IF;
        IF result.status <> 'paid' THEN
            RAISE EXCEPTION 'Registration fee not found or already paid';
        END IF;
        RETURN result;
    END IF;

    BEGIN
        SELECT s.family_id, s.name INTO fam_id, swimmer_name
        FROM swimmers s WHERE s.id = result.swimmer_id;

        INSERT INTO messages (family_id, message_type, subject, body, sent_by)
        VALUES (
            fam_id,
            'payment_received',
            'Registration payment received — Breeze Swim',
            format(
                'Thank you! We received the $%s annual registration for %s (%s) via %s.',
                (result.amount_cents / 100.0)::text,
                swimmer_name,
                result.fee_year,
                initcap(p_method::text)
            ),
            auth.uid()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_registration_paid(uuid, payment_method, text) TO authenticated;

CREATE OR REPLACE FUNCTION mark_registration_due(p_registration_id uuid)
RETURNS registration_fees AS $$
DECLARE
    result registration_fees;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE registration_fees
    SET status = 'due',
        method = NULL,
        paid_at = NULL,
        note = NULL
    WHERE id = p_registration_id
    RETURNING * INTO result;

    IF result IS NULL THEN
        RAISE EXCEPTION 'Registration fee not found';
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_registration_due(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION send_family_message(
    p_family_id uuid,
    p_subject text,
    p_body text,
    p_message_type message_type DEFAULT 'custom'
)
RETURNS uuid AS $$
DECLARE
    msg_id uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO messages (family_id, message_type, subject, body, sent_by)
    VALUES (p_family_id, p_message_type, p_subject, p_body, auth.uid())
    RETURNING id INTO msg_id;

    RETURN msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION send_family_message(uuid, text, text, message_type) TO authenticated;

CREATE OR REPLACE FUNCTION broadcast_message(
    p_subject text,
    p_body text,
    p_message_type message_type DEFAULT 'announcement'
)
RETURNS int AS $$
DECLARE
    fam record;
    sent_count int := 0;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    FOR fam IN
        SELECT DISTINCT f.id
        FROM families f
        JOIN swimmers s ON s.family_id = f.id
        WHERE s.status = 'active'
    LOOP
        INSERT INTO messages (family_id, message_type, subject, body, sent_by)
        VALUES (fam.id, p_message_type, p_subject, p_body, auth.uid());
        sent_count := sent_count + 1;
    END LOOP;

    RETURN sent_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION broadcast_message(text, text, message_type) TO authenticated;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE admin_notifications SET read_at = now() WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_notification_read(uuid) TO authenticated;

-- ========== RLS ==========
DROP POLICY IF EXISTS payments_admin_all ON payments;

DROP POLICY IF EXISTS payments_admin_select ON payments;
CREATE POLICY payments_admin_select ON payments
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS payments_admin_insert ON payments;
CREATE POLICY payments_admin_insert ON payments
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS payments_admin_update ON payments;
CREATE POLICY payments_admin_update ON payments
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS payments_admin_delete ON payments;
CREATE POLICY payments_admin_delete ON payments
  FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS payments_parent_select ON payments;
CREATE POLICY payments_parent_select ON payments
  FOR SELECT TO authenticated
  USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO authenticated;

DROP POLICY IF EXISTS registration_admin_all ON registration_fees;

DROP POLICY IF EXISTS registration_admin_select ON registration_fees;
CREATE POLICY registration_admin_select ON registration_fees
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS registration_admin_insert ON registration_fees;
CREATE POLICY registration_admin_insert ON registration_fees
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS registration_admin_update ON registration_fees;
CREATE POLICY registration_admin_update ON registration_fees
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS registration_admin_delete ON registration_fees;
CREATE POLICY registration_admin_delete ON registration_fees
  FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS registration_parent_select ON registration_fees;
CREATE POLICY registration_parent_select ON registration_fees
  FOR SELECT TO authenticated
  USING (
    swimmer_id IN (
        SELECT s.id FROM swimmers s
        JOIN profiles p ON p.family_id = s.family_id
        WHERE p.id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON registration_fees TO authenticated;

DROP POLICY IF EXISTS messages_admin_all ON messages;
CREATE POLICY messages_admin_all ON messages
  FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS messages_parent_select ON messages;
CREATE POLICY messages_parent_select ON messages
  FOR SELECT TO authenticated
  USING (
    family_id IS NULL
    OR family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;

-- Reload PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
