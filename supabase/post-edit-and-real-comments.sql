-- Re-run this in the Supabase SQL Editor (safe to run again).
-- Fixes delete/edit for guest posts created before guest_token existed.

alter table public.posts add column if not exists guest_token uuid;
alter table public.comments add column if not exists guest_token uuid;

alter table public.comments alter column user_id drop not null;
alter table public.comments add column if not exists guest_name text;
alter table public.comments drop constraint if exists comments_author_check;
alter table public.comments add constraint comments_author_check check (
  (user_id is not null and guest_name is null) or
  (user_id is null and char_length(trim(guest_name)) between 2 and 30)
);

drop policy if exists "guests create comments" on public.comments;
create policy "guests create comments" on public.comments
for insert to anon
with check (user_id is null and char_length(trim(guest_name)) between 2 and 30);

drop policy if exists "authors delete posts" on public.posts;
create policy "authors delete posts" on public.posts
for delete using (auth.uid() = user_id);

drop function if exists public.update_guest_post(uuid, uuid, text, text, bigint);
drop function if exists public.update_guest_post(uuid, uuid, text, text, bigint, text);
drop function if exists public.delete_guest_post(uuid, uuid);
drop function if exists public.delete_guest_post(uuid, uuid, text);
drop function if exists public.can_manage_post(uuid, uuid, text);
drop function if exists public.can_manage_comment(uuid, uuid);
drop function if exists public.can_manage_comment(uuid, uuid, text);
drop function if exists public.delete_guest_comment(uuid, uuid);
drop function if exists public.delete_guest_comment(uuid, uuid, text);

create or replace function public.can_manage_post(p_id uuid, p_token uuid, p_guest_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts
    where id = p_id
      and status = 'published'
      and (
        (user_id is not null and user_id = auth.uid())
        or (user_id is null and p_token is not null and guest_token = p_token)
        or (user_id is null and guest_token is null and p_guest_name is not null and trim(guest_name) = trim(p_guest_name) and char_length(trim(p_guest_name)) between 2 and 30)
      )
  );
$$;

create or replace function public.update_guest_post(
  p_id uuid,
  p_token uuid,
  p_title text,
  p_content text,
  p_category_id bigint,
  p_guest_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(p_title)) < 3 or char_length(trim(p_title)) > 140 then
    raise exception '標題需介於 3 到 140 個字';
  end if;
  if not public.can_manage_post(p_id, p_token, p_guest_name) then
    raise exception '找不到可編輯的文章';
  end if;
  update public.posts
  set title = trim(p_title),
      content = trim(p_content),
      category_id = p_category_id,
      updated_at = now(),
      guest_token = coalesce(guest_token, p_token)
  where id = p_id and status = 'published';
end;
$$;

create or replace function public.delete_guest_post(
  p_id uuid,
  p_token uuid,
  p_guest_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_post(p_id, p_token, p_guest_name) then
    raise exception '找不到可刪除的文章';
  end if;
  update public.posts
  set status = 'deleted',
      deleted_at = now(),
      updated_at = now()
  where id = p_id and status = 'published';
end;
$$;

create or replace function public.can_manage_comment(
  p_id uuid,
  p_token uuid,
  p_guest_name text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.comments
    where id = p_id
      and deleted_at is null
      and (
        (user_id is not null and user_id = auth.uid())
        or (user_id is null and p_token is not null and guest_token = p_token)
        or (user_id is null and guest_token is null and p_guest_name is not null and trim(guest_name) = trim(p_guest_name) and char_length(trim(p_guest_name)) between 2 and 30)
      )
  );
$$;

create or replace function public.delete_guest_comment(
  p_id uuid,
  p_token uuid,
  p_guest_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_comment(p_id, p_token, p_guest_name) then
    raise exception '找不到可刪除的留言';
  end if;
  update public.comments
  set deleted_at = now(),
      updated_at = now()
  where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.can_manage_post(uuid, uuid, text) to anon, authenticated;
grant execute on function public.update_guest_post(uuid, uuid, text, text, bigint, text) to anon, authenticated;
grant execute on function public.delete_guest_post(uuid, uuid, text) to anon, authenticated;
grant execute on function public.can_manage_comment(uuid, uuid, text) to anon, authenticated;
grant execute on function public.delete_guest_comment(uuid, uuid, text) to anon, authenticated;
