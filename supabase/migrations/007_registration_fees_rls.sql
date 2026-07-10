-- Explicit RLS for registration_fees (admin CRUD was unreliable with FOR ALL policy)

drop policy if exists registration_admin_all on registration_fees;

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
