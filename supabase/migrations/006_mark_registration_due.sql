-- Allow admin to revert a registration fee back to due

create or replace function mark_registration_paid(
    p_registration_id uuid,
    p_method payment_method,
    p_note text default null
)
returns registration_fees as $$
declare
    result registration_fees;
    fam_id uuid;
    swimmer_name text;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    update registration_fees
    set status = 'paid',
        method = p_method,
        paid_at = now(),
        note = p_note
    where id = p_registration_id and status = 'due'
    returning * into result;

    if result is null then
        select * into result from registration_fees where id = p_registration_id;
        if result is null then
            raise exception 'Registration fee not found';
        end if;
        if result.status <> 'paid' then
            raise exception 'Registration fee not found or already paid';
        end if;
        return result;
    end if;

    begin
        select s.family_id, s.name into fam_id, swimmer_name
        from swimmers s where s.id = result.swimmer_id;

        insert into messages (family_id, message_type, subject, body, sent_by)
        values (
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
    exception when others then
        null;
    end;

    return result;
end;
$$ language plpgsql security definer;

create or replace function mark_registration_due(p_registration_id uuid)
returns registration_fees as $$
declare
    result registration_fees;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    update registration_fees
    set status = 'due',
        method = null,
        paid_at = null,
        note = null
    where id = p_registration_id
    returning * into result;

    if result is null then
        raise exception 'Registration fee not found';
    end if;

    return result;
end;
$$ language plpgsql security definer;

grant execute on function mark_registration_due(uuid) to authenticated;
