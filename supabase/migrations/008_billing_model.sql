-- Per-lesson vs weekly billing on family profiles

do $$ begin
  create type billing_model as enum ('weekly', 'per_lesson', 'not_sure');
exception
  when duplicate_object then null;
end $$;

alter table families
  add column if not exists billing_model billing_model not null default 'weekly';

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

notify pgrst, 'reload schema';
