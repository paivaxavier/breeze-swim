-- Mark a payment back to due (undo accidental mark-paid)

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

notify pgrst, 'reload schema';
