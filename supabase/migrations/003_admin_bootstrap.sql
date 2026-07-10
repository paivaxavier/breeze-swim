-- Auto-create profile on signup; promote breezeswimlessons@gmail.com to admin

create or replace function handle_new_user()
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
        update public.profiles set role = 'admin'::public.user_role where id = new.id;
    end if;

    return new;
exception when others then
    raise warning 'handle_new_user: %', sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();
