-- RLS policies

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
