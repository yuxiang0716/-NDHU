"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, Code2, Heart, LayoutPanelTop, Menu, MessageCircle, Pencil, Plus, Search, Send, Shield, Star, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Category = "全部" | "閒聊" | "接案" | "案件需求" | "找夥伴" | "技術" | "資源" | "想學什麼" | "公告";
type PostCategory = Exclude<Category, "全部">;
type Post = {
  id: string;
  userId: string | null;
  author: string;
  initials: string;
  role: string;
  category: PostCategory;
  title: string;
  content: string;
  tags: string[];
  likes: number;
  replies: number;
  time: string;
};
type Comment = { id: string; userId: string | null; author: string; initials: string; content: string; time: string };
type PostDraft = { category: PostCategory; title: string; content: string; tags: string[]; guestName: string };

const OWNED_POSTS_KEY = "codework-owned-posts";
const OWNED_COMMENTS_KEY = "codework-owned-comments";
const GUEST_NAME_KEY = "codework-guest-name";
const STARRED_POSTS_KEY = "codework-starred-posts";
const categories: Category[] = ["全部", "閒聊", "接案", "案件需求", "找夥伴", "技術", "資源", "想學什麼", "公告"];
const categoryStyle: Record<PostCategory, string> = { "閒聊": "chat", "接案": "work", "案件需求": "demand", "找夥伴": "partner", "技術": "tech", "資源": "resource", "想學什麼": "learn", "公告": "notice" };
const formatTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(value));

const readOwnedPosts = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(OWNED_POSTS_KEY) || "{}"); } catch { return {}; }
};
const rememberOwnedPost = (id: string, token: string) => {
  const next = { ...readOwnedPosts(), [id]: token };
  localStorage.setItem(OWNED_POSTS_KEY, JSON.stringify(next));
};
const readOwnedComments = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(OWNED_COMMENTS_KEY) || "{}"); } catch { return {}; }
};
const rememberOwnedComment = (id: string, token: string) => {
  const next = { ...readOwnedComments(), [id]: token };
  localStorage.setItem(OWNED_COMMENTS_KEY, JSON.stringify(next));
};
const readGuestName = () => {
  try { return localStorage.getItem(GUEST_NAME_KEY) || ""; } catch { return ""; }
};
const rememberGuestName = (name: string) => {
  const value = name.trim();
  if (!value) return;
  localStorage.setItem(GUEST_NAME_KEY, value);
};
const readStarredPosts = () => { try { return JSON.parse(localStorage.getItem(STARRED_POSTS_KEY) || "[]") as string[]; } catch { return []; } };
const saveStarredPosts = (ids: string[]) => localStorage.setItem(STARRED_POSTS_KEY, JSON.stringify(ids));

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState<Category>("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("最新");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [liked, setLiked] = useState<Array<string>>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openPostMenu, setOpenPostMenu] = useState<string | null>(null);
  const [ownedPosts, setOwnedPosts] = useState<Record<string, string>>({});
  const [ownedComments, setOwnedComments] = useState<Record<string, string>>({});
  const [databaseMessage, setDatabaseMessage] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string; username?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myPostsOnly, setMyPostsOnly] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [wallView, setWallView] = useState<"all" | "starred">("all");
  const [starredPosts, setStarredPosts] = useState<string[]>([]);

  const loadPosts = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("posts").select("id,user_id,title,content,created_at,guest_name,profiles!posts_user_id_fkey(username),categories(name),post_tags(tags(name)),likes(count),comments(count)").eq("status", "published").order("created_at", { ascending: false });
    if (error) { setDatabaseMessage("無法讀取資料庫，請確認 Supabase schema 與 RLS 設定。"); return; }
    const mapped = (data ?? []).map((item: any): Post => {
      const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
      const dbCategory = Array.isArray(item.categories) ? item.categories[0] : item.categories;
      const author = profile?.username || item.guest_name || "社團成員";
      return { id: item.id, userId: item.user_id ?? null, author, initials: author.slice(0, 2).toUpperCase(), role: "社團成員", category: (dbCategory?.name || "閒聊") as PostCategory, title: item.title, content: item.content, tags: (item.post_tags ?? []).map((row: any) => row.tags?.name).filter(Boolean), likes: item.likes?.[0]?.count ?? 0, replies: item.comments?.[0]?.count ?? 0, time: formatTime(item.created_at) };
    });
    setPosts(mapped);
    setSelected((current) => current ? mapped.find((post) => post.id === current.id) ?? null : null);
  };

  // 載入目前使用者的 role（判斷是否為 admin）
  const loadUserRole = async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
    setIsAdmin(data?.role === "admin");
  };

  useEffect(() => { void loadPosts(); setOwnedPosts(readOwnedPosts()); setOwnedComments(readOwnedComments()); setStarredPosts(readStarredPosts()); }, []);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser({ id: data.user.id, email: data.user.email, username: data.user.user_metadata?.username });
        void loadUserRole(data.user.id);
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({ id: session.user.id, email: session.user.email, username: session.user.user_metadata?.username });
        void loadUserRole(session.user.id);
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setMyPostsOnly(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (databaseMessage) window.alert(databaseMessage); }, [databaseMessage]);

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const haystack = `${post.author} ${post.title} ${post.content} ${post.tags.join(" ")}`.toLowerCase();
    const categoryMatch = category === "全部" || post.category === category;
    const queryMatch = haystack.includes(query.toLowerCase());
    const myPostsMatch = !myPostsOnly || (currentUser && post.userId === currentUser.id);
    return categoryMatch && queryMatch && myPostsMatch;
  }).sort((a, b) => sort === "最熱門" ? b.likes - a.likes : sort === "最多回覆" ? b.replies - a.replies : 0), [posts, category, query, sort, myPostsOnly, currentUser]);

  const hotTags = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [posts]);

  // admin 可管理所有文章；一般使用者只能管理自己的
  const canManage = (post: Post) => Boolean(isAdmin || (currentUser && post.userId === currentUser.id) || ownedPosts[post.id]);
  const toggleLike = (id: string) => setLiked((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  const toggleStar = (id: string) => setStarredPosts((current) => { const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]; saveStarredPosts(next); return next; });

  const savePost = async (data: PostDraft) => {
    if (!supabase) { setDatabaseMessage("尚未設定 Supabase 連線。請確認 .env.local。"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && !editing && data.guestName.trim().length < 2) { setDatabaseMessage("訪客發文請填寫至少兩個字的暱稱。"); return; }
    const title = data.title.trim();
    const content = data.content.trim();
    if (title.length < 3 || title.length > 140) { setDatabaseMessage("標題需介於 3 到 140 個字。"); return; }
    const { data: categoryRow, error: categoryError } = await supabase.from("categories").select("id").eq("name", data.category).single();
    if (categoryError || !categoryRow) { setDatabaseMessage("找不到此分類，請先執行預設分類 SQL。"); return; }

    if (editing) {
      // admin 可透過 RPC 編輯任何文章
      if (isAdmin && !(user && editing.userId === user.id)) {
        const { error } = await supabase.rpc("admin_update_post", { p_id: editing.id, p_title: title, p_content: content, p_category_id: categoryRow.id });
        if (error) { setDatabaseMessage(`更新失敗：${error.message}`); return; }
      } else if (user && editing.userId === user.id) {
        const { error } = await supabase.from("posts").update({ title, content, category_id: categoryRow.id, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (error) { setDatabaseMessage(`更新失敗：${error.message}`); return; }
      } else {
        const token = ownedPosts[editing.id] || null;
        const { error } = await supabase.rpc("update_guest_post", { p_id: editing.id, p_token: token, p_title: title, p_content: content, p_category_id: categoryRow.id, p_guest_name: editing.author });
        if (error) { setDatabaseMessage(`更新失敗：${error.message}`); return; }
      }
      setEditing(null); setModalOpen(false); setDatabaseMessage("文章已更新。"); await loadPosts();
      return;
    }

    const guestToken = user ? null : crypto.randomUUID();
    const payload: Record<string, unknown> = { user_id: user?.id ?? null, guest_name: user ? null : data.guestName.trim(), category_id: categoryRow.id, title, content };
    if (guestToken) payload.guest_token = guestToken;
    let { data: created, error } = await supabase.from("posts").insert(payload).select("id").single();
    if (error && guestToken && /guest_token/.test(error.message)) {
      delete payload.guest_token;
      ({ data: created, error } = await supabase.from("posts").insert(payload).select("id").single());
    }
    if (error) { setDatabaseMessage(`發文失敗：${error.message}`); return; }
    if (!user) rememberGuestName(data.guestName);
    if (created?.id && guestToken) { rememberOwnedPost(created.id, guestToken); setOwnedPosts(readOwnedPosts()); }
    setModalOpen(false); setCategory("全部"); setDatabaseMessage("文章已發表。"); await loadPosts();
  };

  const deletePost = async (post: Post) => {
    if (!supabase || !window.confirm("確定要刪除這篇文章嗎？")) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (isAdmin && !(user && post.userId === user.id)) {
      // admin 刪除別人的文章
      const { error } = await supabase.rpc("admin_delete_post", { p_id: post.id });
      if (error) { setDatabaseMessage(`刪除失敗：${error.message}`); return; }
    } else if (user && post.userId === user.id) {
      const { error } = await supabase.from("posts").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", post.id);
      if (error) { setDatabaseMessage(`刪除失敗：${error.message}`); return; }
    } else {
      const token = ownedPosts[post.id] || null;
      const { error } = await supabase.rpc("delete_guest_post", { p_id: post.id, p_token: token, p_guest_name: post.author });
      if (error) { setDatabaseMessage(`刪除失敗：${error.message}`); return; }
    }
    setSelected(null); setOpenPostMenu(null); setDatabaseMessage("文章已刪除。"); await loadPosts();
  };

  const displayName = currentUser?.username || currentUser?.email?.split("@")[0] || "社員";
  return <main>
    <header className="navbar"><a className="brand" href="#top"><span className="brand-mark"><Code2 size={17}/></span><span>CODE <i>×</i> WORK</span></a><nav><a className="active" href="#top">首頁</a><a href="#posts">案件</a><a href="#posts">技術</a><a href="#posts">社群</a><button className="wall-nav" onClick={() => { setWallView("all"); setWallOpen(true); }}><LayoutPanelTop size={15}/> 互動牆</button></nav><div className="nav-actions"><button className="mobile-wall" onClick={() => { setWallView("all"); setWallOpen(true); }}><LayoutPanelTop size={17}/><span>互動牆</span></button><button className="icon-button"><Bell size={19}/></button>{currentUser ? <button className="profile-button" onClick={() => setMenuOpen(!menuOpen)}><span className="avatar small">{displayName.slice(0, 2).toUpperCase()}</span><span>{displayName}</span>{isAdmin && <span className="admin-badge"><Shield size={12}/> 管理員</span>}<ChevronDown size={15}/></button> : <button className="login-button" onClick={() => setAuthModalOpen(true)}>登入 / 註冊</button>}<button className="mobile-menu"><Menu size={22}/></button>{menuOpen && <div className="user-menu"><b>{displayName}</b>{isAdmin && <span className="admin-role-tag"><Shield size={12}/> 管理員</span>}<span>{currentUser?.email}</span><hr/><button>個人檔案</button><button>我的留言</button><button>設定</button><button className="danger" onClick={() => { void supabase?.auth.signOut(); setMenuOpen(false); }}>登出</button></div>}</div></header>

    <section className="hero" id="top"><div className="hero-copy"><span className="eyebrow">CODING · FREELANCE · COMMUNITY</span><h1>程式接案社</h1><p>找到夥伴、交流技術，把每個好點子變成下一個專案。</p><button className="primary-button" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={19}/> 發表留言</button></div><div className="hero-art"><div className="orb one"></div><div className="orb two"></div><div className="code-window"><div className="window-top"><span></span><span></span><span></span><b>community.ts</b></div><code><em>const</em> community = &#123;<br/>&nbsp;&nbsp;ideas: <strong>"welcome"</strong>,<br/>&nbsp;&nbsp;people: <strong>"together"</strong><br/>&#125;;</code></div></div></section>

    <div className="page-shell"><aside className="sidebar"><p className="side-label">探索討論</p>{categories.map((item) => <button key={item} className={category === item ? "category active" : "category"} onClick={() => setCategory(item)}><span>{item === "全部" ? "◈" : item === "接案" ? "◌" : item === "技術" ? "⌘" : item === "找夥伴" ? "♢" : item === "資源" ? "▤" : item === "公告" ? "●" : "▣"}</span>{item}</button>)}<div className="side-card"><span>NEW HERE?</span><b>一起開始接案旅程</b><p>分享問題、尋找夥伴，讓技能成為實際成果。</p><button onClick={() => { setEditing(null); setModalOpen(true); }}>發布第一篇留言 →</button></div></aside>
      <section className="feed" id="posts"><div className="feed-head"><div><span className="eyebrow">COMMUNITY FEED</span><h2>最新討論</h2></div><button className="compact-post" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={17}/> 發表</button></div><div className="tools"><label className="search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋留言、作者或標籤..."/></label><label className="sort">排序：<select value={sort} onChange={(event) => setSort(event.target.value)}><option>最新</option><option>最熱門</option><option>最多回覆</option></select></label>{currentUser && <button className={myPostsOnly ? "my-posts-toggle active" : "my-posts-toggle"} onClick={() => setMyPostsOnly(!myPostsOnly)}>👤 {myPostsOnly ? "我的文章" : "我的文章"}</button>}</div><div className="mobile-tabs">{categories.slice(0, 5).map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="result-label">{myPostsOnly ? "我的文章" : category === "全部" ? "所有討論" : category} <span>{visiblePosts.length} 篇</span></div><div className="post-list">{visiblePosts.map((post) => <article className="post-card" key={post.id}><div className="post-author"><span className={`avatar ${post.category === "公告" ? "admin" : ""}`}>{post.initials}</span><div><b>{post.author}</b><span>{post.role} · {post.time}</span></div>{canManage(post) && <div className="post-menu"><button className="more" onClick={() => setOpenPostMenu(openPostMenu === post.id ? null : post.id)}>•••</button>{openPostMenu === post.id && <div className="post-menu-list">{(isAdmin || (currentUser && post.userId === currentUser.id)) && <button onClick={() => { setEditing(post); setModalOpen(true); setOpenPostMenu(null); }}><Pencil size={14}/> 編輯</button>}<button className="danger" onClick={() => { void deletePost(post); }}><Trash2 size={14}/> 刪除{isAdmin && !(currentUser && post.userId === currentUser.id) ? "（管理員）" : ""}</button></div>}</div>}</div><button className="post-content" onClick={() => setSelected(post)}><span className={`pill ${categoryStyle[post.category]}`}>{post.category}</span><h3>{post.title}</h3><p>{post.content}</p></button><div className="tag-row">{post.tags.map((tag) => <button key={tag} onClick={() => setQuery(tag)}>#{tag}</button>)}</div><div className="post-foot"><button className={liked.includes(post.id) ? "reaction liked" : "reaction"} onClick={() => toggleLike(post.id)}><Heart size={17} fill={liked.includes(post.id) ? "currentColor" : "none"}/>{post.likes + (liked.includes(post.id) ? 1 : 0)}</button><button className="reaction" onClick={() => setSelected(post)}><MessageCircle size={17}/>{post.replies}</button><span>{post.time}</span></div></article>)}</div>{visiblePosts.length === 0 && <div className="empty"><Search size={28}/><b>{myPostsOnly ? "你還沒有發表過文章" : "沒有找到符合的留言"}</b><p>{myPostsOnly ? "點擊「發表留言」開始第一篇！" : "試試其他關鍵字或分類。"}</p></div>}</section>
      <aside className="rightbar"><div className="right-title"><h3>熱門標籤</h3></div><div className="hot-tags">{hotTags.length ? hotTags.map(([tag, count]) => <button key={tag} onClick={() => setQuery(tag)}><span>#{tag}</span><small>{count} 篇</small></button>) : <p className="hot-empty">文章加上標籤後會顯示在這裡。</p>}</div></aside></div>
    {modalOpen && <PostModal loggedIn={Boolean(currentUser)} initial={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSubmit={savePost}/>} {selected && <PostDetail post={selected} liked={liked.includes(selected.id)} canManage={canManage(selected)} isAdmin={isAdmin} loggedIn={Boolean(currentUser)} currentUserId={currentUser?.id ?? null} currentName={displayName} ownedComments={ownedComments} onCommentOwnershipChanged={() => setOwnedComments(readOwnedComments())} onLike={() => toggleLike(selected.id)} onEdit={() => { setEditing(selected); setModalOpen(true); }} onDelete={() => { void deletePost(selected); }} onCommented={() => { void loadPosts(); }} onClose={() => setSelected(null)}/> } {wallOpen && <InteractionWall posts={posts} hotTags={hotTags.map(([tag]) => tag)} starredPosts={starredPosts} view={wallView} onViewChange={setWallView} onClose={() => setWallOpen(false)} onToggleStar={toggleStar} onEdit={(post) => { setWallOpen(false); setEditing(post); setModalOpen(true); }} onDelete={deletePost} canManage={canManage}/>} {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)}/>}</main>;
}

function InteractionWall({ posts, hotTags, starredPosts, view, onViewChange, onClose, onToggleStar, onEdit, onDelete, canManage }: { posts: Post[]; hotTags: string[]; starredPosts: string[]; view: "all" | "starred"; onViewChange: (view: "all" | "starred") => void; onClose: () => void; onToggleStar: (id: string) => void; onEdit: (post: Post) => void; onDelete: (post: Post) => void; canManage: (post: Post) => boolean }) {
  const [tag, setTag] = useState("");
  const [contextPost, setContextPost] = useState<Post | null>(null);
  const [expandedPost, setExpandedPost] = useState<Post | null>(null);
  const shown = posts.filter((post) => (view === "all" || starredPosts.includes(post.id)) && (!tag || post.tags.includes(tag)));
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") expandedPost ? setExpandedPost(null) : onClose(); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [expandedPost, onClose]);
  return <div className="wall-overlay" onMouseDown={() => { setContextPost(null); }}><section className="interaction-wall" onMouseDown={(event) => event.stopPropagation()}><header className="wall-head"><div><span className="eyebrow">LIVE IDEA SPACE</span><h2>互動牆 <small>{shown.length} 張想法</small></h2></div><div className="wall-actions"><button className={view === "all" ? "wall-tab active" : "wall-tab"} onClick={() => onViewChange("all")}>全部留言</button><button className={view === "starred" ? "wall-tab active" : "wall-tab"} onClick={() => onViewChange("starred")}><Star size={15} fill={view === "starred" ? "currentColor" : "none"}/> 已保留 {starredPosts.length}</button><button className="wall-close" aria-label="關閉互動牆" onClick={onClose}><X size={21}/></button></div></header><div className="wall-guide"><span>左鍵點擊便利貼可展開內容</span><span>右鍵可保留、編輯或刪除</span><span>按 Esc 也能關閉</span></div>{hotTags.length > 0 && <div className="wall-tags"><button className={!tag ? "active" : ""} onClick={() => setTag("")}>所有標籤</button>{hotTags.map((item) => <button className={tag === item ? "active" : ""} key={item} onClick={() => setTag(item)}>#{item}</button>)}</div>}<div className="wall-canvas">{shown.map((post, index) => <article className={`wall-note note-${index % 6} ${starredPosts.includes(post.id) ? "starred" : ""}`} key={post.id} onClick={() => setExpandedPost(post)} onContextMenu={(event) => { event.preventDefault(); setContextPost(post); }}><div className="note-top"><span className={`pill ${categoryStyle[post.category]}`}>{post.category}</span>{starredPosts.includes(post.id) && <Star className="note-star" size={15} fill="currentColor"/>}</div><h3>{post.title}</h3><p>{post.content}</p><footer><span>{post.author}</span><span>{post.tags.slice(0, 2).map((item) => `#${item}`).join(" ")}</span></footer></article>)}{shown.length === 0 && <div className="wall-empty"><Star size={30}/><b>{view === "starred" ? "還沒有保留的想法" : "沒有符合的想法"}</b><p>右鍵任何便利貼後選擇「加上星號」，就會留在這裡。</p></div>}</div>{contextPost && <div className="wall-context"><b>{contextPost.title}</b><button onClick={() => { onToggleStar(contextPost.id); setContextPost(null); }}><Star size={14} fill={starredPosts.includes(contextPost.id) ? "currentColor" : "none"}/>{starredPosts.includes(contextPost.id) ? "取消星號" : "加上星號"}</button>{canManage(contextPost) && <><button onClick={() => onEdit(contextPost)}><Pencil size={14}/> 編輯</button><button className="danger" onClick={() => { void onDelete(contextPost); }}><Trash2 size={14}/> 刪除</button></>}</div>}{expandedPost && <div className="wall-preview-backdrop" onMouseDown={() => setExpandedPost(null)}><article className="wall-preview" onMouseDown={(event) => event.stopPropagation()}><button className="wall-preview-close" onClick={() => setExpandedPost(null)}><X size={19}/></button><span className={`pill ${categoryStyle[expandedPost.category]}`}>{expandedPost.category}</span><h3>{expandedPost.title}</h3><p>{expandedPost.content}</p><div className="tag-row">{expandedPost.tags.map((item) => <span key={item}>#{item}</span>)}</div><footer>{expandedPost.author} · {expandedPost.time}</footer></article></div>}</section></div>;
}

function PostModal({ loggedIn, initial, onClose, onSubmit }: { loggedIn: boolean; initial: Post | null; onClose: () => void; onSubmit: (value: PostDraft) => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [postCategory, setPostCategory] = useState<PostCategory>(initial?.category ?? "接案");
  const [tagText, setTagText] = useState(initial?.tags.map((tag) => `#${tag}`).join(" ") ?? "");
  const [guestName, setGuestName] = useState("");
  useEffect(() => { if (!loggedIn && !initial) setGuestName(readGuestName()); }, [loggedIn, initial]);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (title.trim().length >= 3 && content.trim()) onSubmit({ category: postCategory, title: title.trim(), content: content.trim(), guestName, tags: tagText.split(/\s+/).filter(Boolean).map((tag) => tag.replace(/^#/, "")) }); }}><div className="modal-head"><div><span className="eyebrow">{initial ? "EDIT POST" : "CREATE A POST"}</span><h2>{initial ? "編輯文章" : "發表留言"}</h2></div><button type="button" onClick={onClose}><X/></button></div>{!loggedIn && !initial && <label>你的暱稱 <small>不想註冊也能留言</small><input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="例如：Alex" minLength={2} required/></label>}<label>分類<select value={postCategory} onChange={(event) => setPostCategory(event.target.value as PostCategory)}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label>標題 <small>至少 3 個字</small><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：想找人一起開發 Discord Bot" minLength={3} maxLength={140} required/></label><label>內容<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="分享你的想法、需求或遇到的問題…" required/></label><label>標籤 <small>以空格分隔</small><input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="#React #接案 #合作"/></label><div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>取消</button><button className="primary-button" type="submit"><Send size={16}/> {initial ? "儲存變更" : "發表留言"}</button></div></form></div>;
}

function PostDetail({ post, liked, canManage, isAdmin, loggedIn, currentUserId, currentName, ownedComments, onCommentOwnershipChanged, onLike, onEdit, onDelete, onCommented, onClose }: { post: Post; liked: boolean; canManage: boolean; isAdmin: boolean; loggedIn: boolean; currentUserId: string | null; currentName: string; ownedComments: Record<string, string>; onCommentOwnershipChanged: () => void; onLike: () => void; onEdit: () => void; onDelete: () => void; onCommented: () => void; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const guestIdentity = guestName.trim();

  const loadComments = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("comments").select("id,user_id,content,created_at,guest_name,profiles(username)").eq("post_id", post.id).is("deleted_at", null).order("created_at", { ascending: true });
    if (error) return;
    setComments((data ?? []).map((item: any) => {
      const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
      const author = profile?.username || item.guest_name || "社員";
      return { id: item.id, userId: item.user_id ?? null, author, initials: author.slice(0, 2).toUpperCase(), content: item.content, time: formatTime(item.created_at) };
    }));
  };
  useEffect(() => { void loadComments(); }, [post.id]);
  useEffect(() => { if (!loggedIn) setGuestName(readGuestName()); }, [loggedIn]);

  const submitComment = async () => {
    if (!supabase) { window.alert("尚未設定 Supabase 連線。"); return; }
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user && guestName.trim().length < 2) { setBusy(false); window.alert("訪客回覆請填寫至少兩個字的暱稱。"); return; }
    const guestToken = user ? null : crypto.randomUUID();
    const payload: Record<string, unknown> = { post_id: post.id, user_id: user?.id ?? null, guest_name: user ? null : guestName.trim(), content };
    if (guestToken) payload.guest_token = guestToken;
    const { data: created, error } = await supabase.from("comments").insert(payload).select("id").single();
    setBusy(false);
    if (error) { window.alert(`回覆失敗：${error.message}。請先在 Supabase 執行 post-edit-and-real-comments.sql 更新留言結構。`); return; }
    if (!user) rememberGuestName(guestName);
    if (created?.id && guestToken) { rememberOwnedComment(created.id, guestToken); onCommentOwnershipChanged(); }
    setDraft(""); await loadComments(); onCommented();
  };

  // 判斷是否可管理留言（作者或 admin）
  const canManageComment = (comment: Comment) => Boolean(
    isAdmin ||
    (currentUserId && comment.userId === currentUserId) ||
    ownedComments[comment.id] ||
    (!currentUserId && guestIdentity.length >= 2 && comment.author.trim() === guestIdentity)
  );

  // 判斷是否可「編輯」留言（只有登入的作者或 admin 可以編輯；訪客只能刪除）
  const canEditComment = (comment: Comment) => Boolean(
    (currentUserId && comment.userId === currentUserId) ||
    (isAdmin && comment.userId !== null)  // admin 只能編輯登入用戶的留言（訪客留言 admin 只刪不改）
  );

  const deleteComment = async (comment: Comment) => {
    if (!supabase || !window.confirm("確定要刪除這則回覆嗎？")) return;
    const { data: { user } } = await supabase.auth.getUser();
    let error;
    if (isAdmin && !(user && comment.userId === user.id)) {
      // admin 刪除任何留言
      ({ error } = await supabase.rpc("admin_delete_comment", { p_id: comment.id }));
    } else if (user && comment.userId === user.id) {
      ({ error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", comment.id));
    } else {
      ({ error } = await supabase.rpc("delete_guest_comment", { p_id: comment.id, p_token: ownedComments[comment.id] || null, p_guest_name: guestIdentity || comment.author }));
    }
    if (error) { window.alert(`刪除失敗：${error.message}。請先在 Supabase 執行 post-edit-and-real-comments.sql 更新留言刪除權限。`); return; }
    await loadComments();
    onCommented();
  };

  const startEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentContent(comment.content);
  };

  const saveEditComment = async (comment: Comment) => {
    if (!supabase) return;
    const content = editingCommentContent.trim();
    if (!content) return;
    const { data: { user } } = await supabase.auth.getUser();
    let error;
    if (isAdmin && !(user && comment.userId === user.id)) {
      ({ error } = await supabase.rpc("admin_update_comment", { p_id: comment.id, p_content: content }));
    } else {
      ({ error } = await supabase.rpc("update_own_comment", { p_id: comment.id, p_content: content }));
    }
    if (error) { window.alert(`編輯失敗：${error.message}`); return; }
    setEditingCommentId(null);
    setEditingCommentContent("");
    await loadComments();
  };

  return <div className="modal-backdrop detail-backdrop" onMouseDown={onClose}><div className="detail modal" onMouseDown={(event) => event.stopPropagation()}><div className="detail-nav"><button onClick={onClose}>← 返回留言板</button><div className="detail-tools">{canManage && <><button type="button" onClick={onEdit}><Pencil size={15}/> 編輯</button><button type="button" className="danger" onClick={onDelete}><Trash2 size={15}/> 刪除{isAdmin ? "（管理員）" : ""}</button></>}<button onClick={onClose}><X size={19}/></button></div></div><div className="post-author"><span className="avatar">{post.initials}</span><div><b>{post.author}</b><span>{post.role} · {post.time}</span></div></div><span className={`pill ${categoryStyle[post.category]}`}>{post.category}</span><h2>{post.title}</h2><p className="detail-body">{post.content}</p><div className="tag-row">{post.tags.map((tag) => <button key={tag}>#{tag}</button>)}</div><button className={liked ? "reaction liked" : "reaction"} onClick={onLike}><Heart size={17} fill={liked ? "currentColor" : "none"}/>{post.likes + (liked ? 1 : 0)}</button><hr/><h3>{comments.length} 則回覆</h3>{comments.length === 0 && <p className="comment-empty">還沒有人回覆，成為第一個留言的人。</p>}{comments.map((comment) => <div className="comment" key={comment.id}><span className="avatar small">{comment.initials}</span><div className="comment-body"><div className="comment-head"><b>{comment.author}</b><div className="comment-actions">{canEditComment(comment) && editingCommentId !== comment.id && <button type="button" className="comment-edit" onClick={() => startEditComment(comment)}><Pencil size={13}/> 編輯</button>}{canManageComment(comment) && editingCommentId !== comment.id && <button type="button" className="comment-delete" onClick={() => { void deleteComment(comment); }}><Trash2 size={13}/> 刪除</button>}</div></div>{editingCommentId === comment.id ? <div className="comment-edit-box"><textarea value={editingCommentContent} onChange={(e) => setEditingCommentContent(e.target.value)} rows={3}/><div className="comment-edit-actions"><button type="button" className="cancel" onClick={() => { setEditingCommentId(null); setEditingCommentContent(""); }}>取消</button><button type="button" className="primary-button" onClick={() => { void saveEditComment(comment); }}><Send size={13}/> 儲存</button></div></div> : <p>{comment.content}</p>}<small>{comment.time}</small></div></div>)}<div className="comment-box">{!loggedIn && <input className="guest-reply" value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="你的暱稱" minLength={2}/>}<div className="comment-input"><span className="avatar small">{(loggedIn ? currentName : guestName.trim() || "訪客").slice(0, 2).toUpperCase()}</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitComment(); }} placeholder="輸入回覆..."/><button type="button" disabled={busy} onClick={() => { void submitComment(); }}><Send size={17}/></button></div></div></div></div>;
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login"); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [username, setUsername] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!supabase) { setMessage("找不到 Supabase 連線設定。"); return; } setBusy(true); setMessage(""); const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() || email.split("@")[0] } } }); setBusy(false); if (result.error) { setMessage(result.error.message); return; } if (mode === "signup" && !result.data.session) { setMessage("註冊成功，請到 Email 信箱點擊驗證連結後再登入。"); return; } onClose(); };
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal auth-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">WELCOME TO CODE × WORK</span><h2>{mode === "login" ? "登入社群" : "建立帳號"}</h2></div><button type="button" onClick={onClose}><X/></button></div>{mode === "signup" && <label>暱稱<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如：Alex Chen" required/></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required/></label><label>密碼<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 個字元" minLength={6} required/></label>{message && <p className="auth-message">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "處理中…" : mode === "login" ? "登入" : "建立帳號"}</button><p className="auth-switch">{mode === "login" ? "還沒有帳號？" : "已經有帳號？"}<button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "立即註冊" : "前往登入"}</button></p></form></div>;
}
