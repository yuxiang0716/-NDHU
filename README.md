# 程式接案社｜CODE × WORK

墨綠與米白主題的程式接案社群 MVP，已完成首頁、分類／標籤搜尋、排序、發文 Modal、按讚、貼文詳情與回覆介面，以及 RWD。

## 啟動

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。

## 接上 Supabase

1. 建立 Supabase 專案後，將 `.env.example` 複製為 `.env.local` 並填入網址與 publishable key。
2. 在 Supabase SQL Editor 依序執行 `supabase/schema.sql` 與 `supabase/setup-data.sql`。
3. 在 Authentication 開啟 Email、Google 或 GitHub 登入，並設定本機與 Netlify callback URL。
4. 下一步將 `app/page.tsx` 的 mock 資料替換成 `lib/supabase.ts` 查詢；敏感的管理、檢舉及限流操作放在 Edge Functions。

`schema.sql` 包含 profiles、文章、巢狀回覆、分類、標籤、按讚、檢舉、全文搜尋索引，以及基本 RLS。管理員升權只能在安全的伺服器端或 SQL Editor 進行。
