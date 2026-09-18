-- DESTRUCTIVE: clears every post, comment, like, tag relation and report.
-- Run this once in Supabase SQL Editor. It also enables guest posts and adds the learning category.
delete from public.reports;
delete from public.likes;
delete from public.post_tags;
delete from public.comments;
delete from public.posts;

alter table public.posts alter column user_id drop not null;
alter table public.posts add column if not exists guest_name text;
alter table public.posts drop constraint if exists posts_author_check;
alter table public.posts add constraint posts_author_check check (
  (user_id is not null and guest_name is null) or
  (user_id is null and char_length(trim(guest_name)) between 2 and 30)
);

drop policy if exists "guests create posts" on public.posts;
create policy "guests create posts" on public.posts
for insert to anon
with check (user_id is null and char_length(trim(guest_name)) between 2 and 30);

insert into public.categories (name, slug)
values ('想學什麼', 'want-to-learn')
on conflict (name) do nothing;
