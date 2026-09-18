-- Run this in the Supabase SQL editor after creating a project.
create type public.user_role as enum ('member', 'admin', 'suspended');
create type public.post_status as enum ('published', 'hidden', 'deleted');
create type public.report_status as enum ('open', 'reviewed', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 40),
  avatar_url text,
  bio text check (char_length(bio) <= 300),
  role public.user_role not null default 'member',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (id bigint generated always as identity primary key, name text not null unique, slug text not null unique, created_at timestamptz not null default now());
create table public.posts (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), guest_name text, guest_token uuid,
  category_id bigint not null references public.categories(id),
  title text not null check (char_length(title) between 3 and 140), content text not null check (char_length(content) <= 10000),
  status public.post_status not null default 'published', is_pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  constraint posts_author_check check ((user_id is not null and guest_name is null) or (user_id is null and char_length(trim(guest_name)) between 2 and 30))
);
create table public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id), guest_name text, guest_token uuid,
  parent_id uuid references public.comments(id) on delete cascade, content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (id <> parent_id),
  constraint comments_author_check check ((user_id is not null and guest_name is null) or (user_id is null and char_length(trim(guest_name)) between 2 and 30))
);
create table public.tags (id bigint generated always as identity primary key, name text not null unique, slug text not null unique);
create table public.post_tags (post_id uuid references public.posts(id) on delete cascade, tag_id bigint references public.tags(id) on delete cascade, primary key (post_id, tag_id));
create table public.likes (user_id uuid references public.profiles(id) on delete cascade, post_id uuid references public.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null, reason text not null check (char_length(reason) <= 1000), status public.report_status not null default 'open', created_at timestamptz not null default now()
);

create index posts_search_idx on public.posts using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));
create index comments_post_idx on public.comments(post_id, created_at);

alter table public.profiles enable row level security; alter table public.posts enable row level security; alter table public.comments enable row level security; alter table public.likes enable row level security; alter table public.categories enable row level security; alter table public.tags enable row level security; alter table public.post_tags enable row level security; alter table public.reports enable row level security;
create policy "public profiles visible" on public.profiles for select using (true);
create policy "members update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
create policy "published posts visible" on public.posts for select using (status = 'published' or auth.uid() = user_id);
create policy "members create posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "guests create posts" on public.posts for insert to anon with check (user_id is null and char_length(trim(guest_name)) between 2 and 30);
create policy "authors update posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authors delete posts" on public.posts for delete using (auth.uid() = user_id);
create policy "visible comments readable" on public.comments for select using (deleted_at is null);
create policy "members create comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "guests create comments" on public.comments for insert to anon with check (user_id is null and char_length(trim(guest_name)) between 2 and 30);
create policy "authors update comments" on public.comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "likes visible" on public.likes for select using (true);
create policy "members manage own likes" on public.likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories visible" on public.categories for select using (true);
create policy "tags visible" on public.tags for select using (true);
create policy "post tags visible" on public.post_tags for select using (true);
create policy "members create reports" on public.reports for insert with check (auth.uid() = reporter_id);

create or replace function public.update_guest_post(
  p_id uuid, p_token uuid, p_title text, p_content text, p_category_id bigint
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(p_title)) < 3 or char_length(trim(p_title)) > 140 then
    raise exception '標題需介於 3 到 140 個字';
  end if;
  update public.posts
  set title = trim(p_title), content = trim(p_content), category_id = p_category_id, updated_at = now()
  where id = p_id and user_id is null and guest_token = p_token and status = 'published';
  if not found then raise exception '找不到可編輯的文章'; end if;
end;
$$;

create or replace function public.delete_guest_post(p_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.posts
  set status = 'deleted', deleted_at = now(), updated_at = now()
  where id = p_id and user_id is null and guest_token = p_token and status = 'published';
  if not found then raise exception '找不到可刪除的文章'; end if;
end;
$$;

create or replace function public.can_manage_comment(p_id uuid, p_token uuid, p_guest_name text default null)
returns boolean language sql stable security definer set search_path = public as $$
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

create or replace function public.delete_guest_comment(p_id uuid, p_token uuid, p_guest_name text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_comment(p_id, p_token, p_guest_name) then
    raise exception '找不到可刪除的留言';
  end if;
  update public.comments
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.update_guest_post(uuid, uuid, text, text, bigint) to anon, authenticated;
grant execute on function public.delete_guest_post(uuid, uuid) to anon, authenticated;
grant execute on function public.can_manage_comment(uuid, uuid, text) to anon, authenticated;
grant execute on function public.delete_guest_comment(uuid, uuid, text) to anon, authenticated;

-- Never expose role changes to the browser. Promote the first admin manually in SQL:
-- update public.profiles set role = 'admin' where id = 'USER_UUID';
