-- Every to-do, area, project and tag, one row each. The app keeps its own copy in the browser
-- (localStorage) and syncs rows both ways; a deleted item stays as a row with deleted = true so the
-- deletion reaches every device.
create table public.items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('todo', 'area', 'project', 'tag')),
  id text not null,
  data jsonb,
  position double precision not null default 0,
  deleted boolean not null default false,
  modified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

comment on column public.items.data is 'The item exactly as the app stores it (null once deleted).';
comment on column public.items.position is 'Display order within its kind (ascending).';
comment on column public.items.modified_at is 'When the change was made on the device. The later edit wins a conflict.';
comment on column public.items.updated_at is 'When the server received the change. Devices pull what changed since they last looked.';

create index items_user_updated_idx on public.items (user_id, updated_at);

create function public.items_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger items_touch
before insert or update on public.items
for each row execute function public.items_touch();

alter table public.items enable row level security;

create policy "Own items: read" on public.items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own items: add" on public.items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own items: change" on public.items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own items: remove" on public.items
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;
revoke execute on function public.items_touch() from public, anon, authenticated;

-- Live updates: devices hear about changes to their own rows (Realtime applies the policies above).
alter publication supabase_realtime add table public.items;
