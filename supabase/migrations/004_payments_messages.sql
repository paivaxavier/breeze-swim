-- Payments, registration fees, messages + admin RPCs

create type payment_status as enum ('due', 'paid', 'waived');
create type payment_method as enum ('zelle', 'cash', 'square');
create type message_type as enum (
    'announcement',
    'payment_due',
    'payment_received',
    'lesson_reminder',
    'custom'
);

create table payments (
    id uuid primary key default gen_random_uuid(),
    family_id uuid not null references families(id) on delete cascade,
    swimmer_id uuid references swimmers(id) on delete set null,
    due_date date not null,
    amount_cents int not null default 9000,
    status payment_status not null default 'due',
    method payment_method,
    paid_at timestamptz,
    note text,
    created_at timestamptz not null default now(),
    unique (family_id, due_date)
);

create table registration_fees (
    id uuid primary key default gen_random_uuid(),
    swimmer_id uuid not null references swimmers(id) on delete cascade,
    fee_year int not null,
    amount_cents int not null default 5000,
    status payment_status not null default 'due',
    method payment_method,
    paid_at timestamptz,
    note text,
    created_at timestamptz not null default now(),
    unique (swimmer_id, fee_year)
);

create table messages (
    id uuid primary key default gen_random_uuid(),
    family_id uuid references families(id) on delete cascade,
    message_type message_type not null default 'custom',
    subject text not null,
    body text not null,
    sent_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create index idx_payments_family on payments(family_id);
create index idx_payments_due on payments(status, due_date);
create index idx_registration_swimmer on registration_fees(swimmer_id);
create index idx_messages_family on messages(family_id);
create index idx_messages_created on messages(created_at desc);

alter table payments enable row level security;
alter table registration_fees enable row level security;
alter table messages enable row level security;

create policy payments_admin_all on payments for all using (is_admin());
create policy payments_parent_select on payments for select using (
    family_id in (select family_id from profiles where id = auth.uid())
);

create policy registration_admin_all on registration_fees for all using (is_admin());
create policy registration_parent_select on registration_fees for select using (
    swimmer_id in (
        select s.id from swimmers s
        join profiles p on p.family_id = s.family_id
        where p.id = auth.uid()
    )
);

create policy messages_admin_all on messages for all using (is_admin());
create policy messages_parent_select on messages for select using (
    family_id is null
    or family_id in (select family_id from profiles where id = auth.uid())
);

-- Monday of the week containing p_date (ISO week, Monday start)
create or replace function week_start_monday(p_date date default current_date)
returns date as $$
    select (p_date - ((extract(isodow from p_date)::int - 1) || ' days')::interval)::date;
$$ language sql immutable;

create or replace function generate_weekly_payments(p_week_start date default week_start_monday(current_date))
returns int as $$
declare
    inserted_count int := 0;
    rec record;
    new_id uuid;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    for rec in
        select distinct on (f.id) f.id as family_id, s.id as swimmer_id
        from families f
        join swimmers s on s.family_id = f.id
        join enrollments e on e.swimmer_id = s.id
        where s.status = 'active'
          and (e.start_date is null or e.start_date <= p_week_start + 6)
          and (e.end_date is null or e.end_date >= p_week_start)
        order by f.id, s.created_at
    loop
        new_id := null;
        insert into payments (family_id, swimmer_id, due_date, amount_cents, status)
        values (rec.family_id, rec.swimmer_id, p_week_start, 9000, 'due')
        on conflict (family_id, due_date) do nothing
        returning id into new_id;

        if new_id is not null then
            inserted_count := inserted_count + 1;
        end if;
    end loop;

    return inserted_count;
end;
$$ language plpgsql security definer;

grant execute on function generate_weekly_payments(date) to authenticated;
grant execute on function week_start_monday(date) to authenticated;

create or replace function mark_payment_paid(
    p_payment_id uuid,
    p_method payment_method,
    p_note text default null
)
returns payments as $$
declare
    result payments;
    fam record;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    update payments
    set status = 'paid',
        method = p_method,
        paid_at = now(),
        note = p_note
    where id = p_payment_id and status = 'due'
    returning * into result;

    if result is null then
        raise exception 'Payment not found or already paid';
    end if;

    select primary_name, primary_email into fam
    from families where id = result.family_id;

    insert into messages (family_id, message_type, subject, body, sent_by)
    values (
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

    return result;
end;
$$ language plpgsql security definer;

grant execute on function mark_payment_paid(uuid, payment_method, text) to authenticated;

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
        raise exception 'Registration fee not found or already paid';
    end if;

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

    return result;
end;
$$ language plpgsql security definer;

grant execute on function mark_registration_paid(uuid, payment_method, text) to authenticated;

create or replace function ensure_registration_fee(p_swimmer_id uuid, p_year int default extract(year from current_date)::int)
returns registration_fees as $$
declare
    result registration_fees;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    insert into registration_fees (swimmer_id, fee_year, amount_cents, status)
    values (p_swimmer_id, p_year, 5000, 'due')
    on conflict (swimmer_id, fee_year) do nothing;

    select * into result from registration_fees
    where swimmer_id = p_swimmer_id and fee_year = p_year;

    return result;
end;
$$ language plpgsql security definer;

grant execute on function ensure_registration_fee(uuid, int) to authenticated;

create or replace function send_family_message(
    p_family_id uuid,
    p_subject text,
    p_body text,
    p_message_type message_type default 'custom'
)
returns uuid as $$
declare
    msg_id uuid;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    insert into messages (family_id, message_type, subject, body, sent_by)
    values (p_family_id, p_message_type, p_subject, p_body, auth.uid())
    returning id into msg_id;

    return msg_id;
end;
$$ language plpgsql security definer;

grant execute on function send_family_message(uuid, text, text, message_type) to authenticated;

create or replace function broadcast_message(
    p_subject text,
    p_body text,
    p_message_type message_type default 'announcement'
)
returns int as $$
declare
    fam record;
    sent_count int := 0;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    for fam in
        select distinct f.id
        from families f
        join swimmers s on s.family_id = f.id
        where s.status = 'active'
    loop
        insert into messages (family_id, message_type, subject, body, sent_by)
        values (fam.id, p_message_type, p_subject, p_body, auth.uid());
        sent_count := sent_count + 1;
    end loop;

    return sent_count;
end;
$$ language plpgsql security definer;

grant execute on function broadcast_message(text, text, message_type) to authenticated;

create or replace function mark_notification_read(p_notification_id uuid)
returns void as $$
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    update admin_notifications set read_at = now() where id = p_notification_id;
end;
$$ language plpgsql security definer;

grant execute on function mark_notification_read(uuid) to authenticated;
