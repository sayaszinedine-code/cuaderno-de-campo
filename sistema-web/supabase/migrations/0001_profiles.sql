-- Teacher accounts: registration data + approval status.
-- No pedagogical or children's data ever lives in Supabase.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_names text not null,
  last_names text not null,
  email text not null,
  institution text,
  ugel text,
  region text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  role text not null default 'teacher'
    check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz
);

create index profiles_status_idx on public.profiles (status);

alter table public.profiles enable row level security;

-- True when the current JWT user is an admin. SECURITY DEFINER so it reads
-- profiles as the owner and never recurses through the RLS policies below.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Create the profile when Supabase Auth creates the user. status/role always
-- take their defaults: never trust them from client-supplied metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, first_names, last_names, institution, ugel, region)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(meta ->> 'first_names', ''),
    coalesce(meta ->> 'last_names', ''),
    meta ->> 'institution',
    meta ->> 'ugel',
    meta ->> 'region'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- API callers (anon/authenticated) may change status/role only as admins.
-- Privileged roles (postgres via SQL editor, service_role) are trusted: that
-- is how the first admin is bootstrapped. Must stay SECURITY INVOKER so
-- current_user is the real caller.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.id is distinct from old.id
          or new.email is distinct from old.email
          or new.created_at is distinct from old.created_at) then
    raise exception 'profiles: id, email and created_at are read-only'
      using errcode = '42501';
  end if;

  if (new.status is distinct from old.status or new.role is distinct from old.role)
     and current_user in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'profiles: only an administrator can change status or role'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_update() from public, anon, authenticated;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Policies: read own row or any as admin; update own row (columns limited
-- by the trigger) or any as admin. No insert/delete from clients.
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
