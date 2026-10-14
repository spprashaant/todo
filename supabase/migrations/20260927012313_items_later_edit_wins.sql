-- A change made earlier than the one already stored (another device synced a newer edit in between)
-- is skipped, so the later edit wins even when two devices send at the same moment.
create or replace function public.items_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.modified_at < old.modified_at then
    return null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
