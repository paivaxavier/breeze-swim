-- Breeze Swim — parent onboarding schema

create extension if not exists "pgcrypto";

create type user_role as enum ('admin', 'parent_primary', 'parent_guest');
create type swimmer_status as enum ('active', 'former', 'waitlist');
create type invite_role as enum ('primary', 'guest');
create type welcome_type as enum ('full', 'short');
create type pool_location as enum ('bunnell', 'client_pool');

create table families (
    id uuid primary key default gen_random_uuid(),
    primary_name text not null,
    primary_email text not null,
    primary_phone text,
    pool_address text,
    gate_instructions text,
    zelle_instructions text default 'Pay via Zelle — Brielle will share payment details at your first lesson.',
    is_returning boolean not null default false,
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
