-- Run this once in the Supabase SQL Editor after schema.sql.
-- It adds the categories used by the website and creates a profile for each new Auth user.

insert into public.categories (name, slug) values
  ('閒聊', 'chat'), ('接案', 'freelance'), ('案件需求', 'project-request'),
  ('找夥伴', 'partners'), ('技術', 'technology'), ('資源', 'resources'), ('公告', 'announcement')
on conflict (name) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
