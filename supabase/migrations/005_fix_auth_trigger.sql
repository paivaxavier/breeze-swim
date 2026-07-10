-- Fix auth signup trigger (resolves "Database error creating new user")
-- Run in Supabase SQL Editor if admin user creation fails.

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, role)
    values (new.id, 'parent_primary'::public.user_role)
    on conflict (id) do nothing;

    if lower(coalesce(new.email, '')) = lower('breezeswimlessons@gmail.com') then
        update public.profiles
        set role = 'admin'::public.user_role
        where id = new.id;
    end if;

    return new;
exception when others then
    -- Don't block auth signup if profile insert fails
    raise warning 'handle_new_user: %', sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
