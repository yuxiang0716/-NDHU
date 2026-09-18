-- ================================================================
-- admin-rls.sql
-- 在 Supabase SQL Editor 執行此檔案以啟用管理員功能。
-- 執行前請先確認已執行過 schema.sql 與 post-edit-and-real-comments.sql。
-- ================================================================

-- ── 1. Admin helper function ──────────────────────────────────
-- 判斷目前登入者是否為 admin（在所有 RLS 與 security definer 函式中使用）
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ── 2. Posts：允許 admin 更新（含軟刪除）任何文章 ─────────────
drop policy if exists "admin update any post" on public.posts;
create policy "admin update any post" on public.posts
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. Comments：允許 admin 更新（含軟刪除）任何留言 ──────────
drop policy if exists "admin update any comment" on public.comments;
create policy "admin update any comment" on public.comments
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. Comments：使用者可編輯自己的留言 ───────────────────────
-- （update 時只允許更新 content，deleted_at 仍受保護）
drop policy if exists "authors update comments" on public.comments;
create policy "authors update comments" on public.comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 5. Admin 刪除文章的 security definer function ─────────────
create or replace function public.admin_delete_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '無管理員權限';
  end if;
  update public.posts
  set status = 'deleted', deleted_at = now(), updated_at = now()
  where id = p_id and status = 'published';
  if not found then
    raise exception '找不到此文章';
  end if;
end;
$$;

grant execute on function public.admin_delete_post(uuid) to authenticated;

-- ── 6. Admin 編輯任何文章 ─────────────────────────────────────
create or replace function public.admin_update_post(
  p_id uuid,
  p_title text,
  p_content text,
  p_category_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '無管理員權限';
  end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_title)) > 140 then
    raise exception '標題需介於 3 到 140 個字';
  end if;
  update public.posts
  set title = trim(p_title),
      content = trim(p_content),
      category_id = p_category_id,
      updated_at = now()
  where id = p_id and status = 'published';
  if not found then
    raise exception '找不到此文章';
  end if;
end;
$$;

grant execute on function public.admin_update_post(uuid, text, text, bigint) to authenticated;

-- ── 7. Admin 刪除留言 ─────────────────────────────────────────
create or replace function public.admin_delete_comment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '無管理員權限';
  end if;
  update public.comments
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then
    raise exception '找不到此留言';
  end if;
end;
$$;

grant execute on function public.admin_delete_comment(uuid) to authenticated;

-- ── 8. 使用者編輯自己的留言 ───────────────────────────────────
create or replace function public.update_own_comment(
  p_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 5000 then
    raise exception '留言內容需介於 1 到 5000 個字';
  end if;
  update public.comments
  set content = trim(p_content), updated_at = now()
  where id = p_id
    and user_id = auth.uid()
    and deleted_at is null;
  if not found then
    raise exception '找不到可編輯的留言';
  end if;
end;
$$;

grant execute on function public.update_own_comment(uuid, text) to authenticated;

-- ── 9. Admin 編輯任何留言 ─────────────────────────────────────
create or replace function public.admin_update_comment(
  p_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '無管理員權限';
  end if;
  if char_length(trim(p_content)) < 1 or char_length(trim(p_content)) > 5000 then
    raise exception '留言內容需介於 1 到 5000 個字';
  end if;
  update public.comments
  set content = trim(p_content), updated_at = now()
  where id = p_id and deleted_at is null;
  if not found then
    raise exception '找不到此留言';
  end if;
end;
$$;

grant execute on function public.admin_update_comment(uuid, text) to authenticated;

-- ── 完成！請執行以下指令將您自己的帳號設為 admin ─────────────
-- 在 Supabase Dashboard > Authentication > Users 找到您的帳號 UUID 後執行：
--
-- update public.profiles set role = 'admin' where id = '你的USER_UUID';
--
-- 例如：
-- update public.profiles set role = 'admin' where id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
