-- Breeze Swim — run once in Supabase SQL Editor (Dashboard → SQL → New query)
-- Combines migrations 001, 002, 003

-- ========== 001_onboarding_schema.sql ==========

create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'parent_primary', 'parent_guest');
create type swimmer_status as enum ('active', 'former', 'waitlist');
create type invite_role as enum ('primary', 'guest');
create type welcome_type as enum ('full', 'short');
create type pool_location as enum ('bunnell', 'client_pool');
create type billing_model as enum ('weekly', 'per_lesson', 'not_sure');

create table families (
    id uuid primary key default gen_random_uuid(),
    primary_name text not null,
    primary_email text not null,
    primary_phone text,
    pool_address text,
    gate_instructions text,
    zelle_instructions text default 'Pay via Zelle — Brielle will share payment details at your first lesson.',
    is_returning boolean not null default false,
    billing_model billing_model not null default 'weekly',
    notes_edit_pending boolean not null default false,
    admin_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table swimmers (
    id uuid primary key default gen_random_uuid(),
    family_id uuid not null references families(id) on delete cascade,
    name text not null,
    date_of_birth date,
    status swimmer_status not null default 'active',
    adaptive_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table enrollments (
    id uuid primary key default gen_random_uuid(),
    swimmer_id uuid not null references swimmers(id) on delete cascade,
    start_date date,
    end_date date,
    lesson_time time,
    location pool_location not null default 'bunnell',
    program_weeks int default 6,
    created_at timestamptz not null default now()
);

create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    role user_role not null default 'parent_primary',
    family_id uuid references families(id) on delete set null,
    full_name text,
    phone text,
    welcome_type welcome_type,
    welcome_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table family_invites (
    id uuid primary key default gen_random_uuid(),
    family_id uuid not null references families(id) on delete cascade,
    email text not null,
    token text not null unique default encode(gen_random_bytes(32), 'hex'),
    invite_role invite_role not null default 'primary',
    invited_by uuid references auth.users(id),
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);

create table welcome_progress (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    step_key text not null,
    completed_at timestamptz not null default now(),
    step_data jsonb default '{}',
    unique (profile_id, step_key)
);

create table admin_notifications (
    id uuid primary key default gen_random_uuid(),
    family_id uuid not null references families(id) on delete cascade,
    notification_type text not null,
    message text not null,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create index idx_swimmers_family on swimmers(family_id);
create index idx_enrollments_swimmer on enrollments(swimmer_id);
create index idx_profiles_family on profiles(family_id);
create index idx_family_invites_token on family_invites(token);
create index idx_family_invites_email on family_invites(email);
create index idx_admin_notifications_family on admin_notifications(family_id);

create or replace function set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger families_updated_at before update on families
    for each row execute function set_updated_at();
create trigger swimmers_updated_at before update on swimmers
    for each row execute function set_updated_at();
create trigger profiles_updated_at before update on profiles
    for each row execute function set_updated_at();

create or replace function is_admin()
returns boolean as $$
    select exists (
        select 1 from profiles where id = auth.uid() and role = 'admin'
    );
$$ language sql security definer stable;

-- ========== 002_rls_policies.sql ==========

alter table families enable row level security;
alter table swimmers enable row level security;
alter table enrollments enable row level security;
alter table profiles enable row level security;
alter table family_invites enable row level security;
alter table welcome_progress enable row level security;
alter table admin_notifications enable row level security;

create policy profiles_select_own on profiles for select using (
    id = auth.uid() or is_admin()
);
create policy profiles_update_own on profiles for update using (
    id = auth.uid() or is_admin()
);
create policy profiles_insert on profiles for insert with check (
    id = auth.uid() or is_admin()
);

create policy families_admin_all on families for all using (is_admin());
create policy families_parent_select on families for select using (
    id in (select family_id from profiles where id = auth.uid())
);
create policy families_parent_update on families for update using (
    id in (select family_id from profiles where id = auth.uid())
);

create policy swimmers_admin_all on swimmers for all using (is_admin());
create policy swimmers_parent_select on swimmers for select using (
    family_id in (select family_id from profiles where id = auth.uid())
);
create policy swimmers_parent_update on swimmers for update using (
    family_id in (select family_id from profiles where id = auth.uid())
);

create policy enrollments_admin_all on enrollments for all using (is_admin());
create policy enrollments_parent_select on enrollments for select using (
    swimmer_id in (
        select s.id from swimmers s
        join profiles p on p.family_id = s.family_id
        where p.id = auth.uid()
    )
);

create policy invites_admin_all on family_invites for all using (is_admin());

create policy welcome_admin_all on welcome_progress for all using (is_admin());
create policy welcome_own on welcome_progress for all using (
    profile_id = auth.uid()
);

create policy notifications_admin_all on admin_notifications for all using (is_admin());

create or replace function get_invite_by_token(invite_token text)
returns table (
    invite_id uuid,
    family_id uuid,
    email text,
    invite_role invite_role,
    accepted_at timestamptz,
    family_name text,
    is_returning boolean
) as $$
begin
    return query
    select
        fi.id,
        fi.family_id,
        fi.email,
        fi.invite_role,
        fi.accepted_at,
        f.primary_name,
        f.is_returning
    from family_invites fi
    join families f on f.id = fi.family_id
    where fi.token = invite_token;
end;
$$ language plpgsql security definer;

grant execute on function get_invite_by_token(text) to anon, authenticated;

create or replace function accept_family_invite(invite_token text)
returns jsonb as $$
declare
    inv record;
    mapped_role user_role;
begin
    select fi.*, f.is_returning into inv
    from family_invites fi
    join families f on f.id = fi.family_id
    where fi.token = invite_token;

    if inv is null then
        raise exception 'Invalid invite token';
    end if;

    if lower(inv.email) <> lower((select email from auth.users where id = auth.uid())) then
        raise exception 'Email does not match invite';
    end if;

    mapped_role := case inv.invite_role
        when 'primary' then 'parent_primary'::user_role
        else 'parent_guest'::user_role
    end;

    insert into profiles (id, role, family_id, welcome_type)
    values (
        auth.uid(),
        mapped_role,
        inv.family_id,
        case when inv.is_returning then 'short'::welcome_type else 'full'::welcome_type end
    )
    on conflict (id) do update set
        role = excluded.role,
        family_id = excluded.family_id,
        welcome_type = excluded.welcome_type,
        welcome_completed_at = null,
        updated_at = now();

    update family_invites set accepted_at = now() where id = inv.id;

    return jsonb_build_object(
        'family_id', inv.family_id,
        'role', mapped_role,
        'welcome_type', case when inv.is_returning then 'short' else 'full' end
    );
end;
$$ language plpgsql security definer;

grant execute on function accept_family_invite(text) to authenticated;

create or replace function complete_welcome_step(
    p_step_key text,
    p_step_data jsonb default '{}'
)
returns void as $$
begin
    insert into welcome_progress (profile_id, step_key, step_data)
    values (auth.uid(), p_step_key, p_step_data)
    on conflict (profile_id, step_key) do update set
        completed_at = now(),
        step_data = excluded.step_data;
end;
$$ language plpgsql security definer;

grant execute on function complete_welcome_step(text, jsonb) to authenticated;

create or replace function finish_welcome()
returns void as $$
begin
    update profiles set welcome_completed_at = now() where id = auth.uid();
end;
$$ language plpgsql security definer;

grant execute on function finish_welcome() to authenticated;

create or replace function update_swimmer_with_notification(
    p_swimmer_id uuid,
    p_adaptive_notes text
)
returns void as $$
declare
    fam_id uuid;
    old_notes text;
begin
    select family_id, adaptive_notes into fam_id, old_notes
    from swimmers where id = p_swimmer_id;

    if fam_id is null then
        raise exception 'Swimmer not found';
    end if;

    if fam_id not in (select family_id from profiles where id = auth.uid()) and not is_admin() then
        raise exception 'Not authorized';
    end if;

    update swimmers set adaptive_notes = p_adaptive_notes where id = p_swimmer_id;

    if old_notes is distinct from p_adaptive_notes and not is_admin() then
        update families set notes_edit_pending = true where id = fam_id;
        insert into admin_notifications (family_id, notification_type, message)
        values (
            fam_id,
            'swimmer_notes_edited',
            'A parent updated adaptive/safety notes for a swimmer. Please review the family profile.'
        );
    end if;
end;
$$ language plpgsql security definer;

grant execute on function update_swimmer_with_notification(uuid, text) to authenticated;

-- ========== 003_admin_bootstrap.sql ==========

create or replace function handle_new_user()
returns trigger as $$
begin
    insert into profiles (id, role)
    values (new.id, 'parent_primary')
    on conflict (id) do nothing;

    if lower(new.email) = lower('breezeswimlessons@gmail.com') then
        update profiles set role = 'admin' where id = new.id;
    end if;

    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- ========== 004_payments_messages.sql ==========

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

create policy registration_admin_select on registration_fees
  for select to authenticated
  using (is_admin());

create policy registration_admin_insert on registration_fees
  for insert to authenticated
  with check (is_admin());

create policy registration_admin_update on registration_fees
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy registration_admin_delete on registration_fees
  for delete to authenticated
  using (is_admin());

grant select, insert, update, delete on registration_fees to authenticated;

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
          and f.billing_model = 'weekly'
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

create or replace function mark_payment_due(p_payment_id uuid)
returns payments as $$
declare
    result payments;
begin
    if not is_admin() then
        raise exception 'Not authorized';
    end if;

    update payments
    set status = 'due',
        method = null,
        paid_at = null
    where id = p_payment_id and status = 'paid'
    returning * into result;

    if result is null then
        raise exception 'Payment not found or not paid';
    end if;

    return result;
end;
$$ language plpgsql security definer;

grant execute on function mark_payment_due(uuid) to authenticated;

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

grant execute on function mark_registration_paid(uuid, payment_method, text) to authenticated;

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
