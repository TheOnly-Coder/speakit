"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LogOut, MessageCircle, UserPlus, Plus, Sun, Moon, Bell, BellOff, Menu, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useLocalAppearance } from "@/store/useLocalAppearance";
import { getSocket, disconnectSocket, setSocketToken } from "@/lib/socket";
import { createClient as createSupabaseBrowser } from "@/lib/supabase";
import { VoiceBridge } from "@/hooks/useVoice";
import { useAutoIdle } from "@/hooks/useAutoIdle";
import { ServerRail } from "@/components/ServerRail";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { DMSidebar } from "@/components/DMSidebar";
import { ChatView } from "@/components/ChatView";
import { DMView } from "@/components/DMView";
import { Avatar } from "@/components/Avatar";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { ContextMenuHost } from "@/components/ContextMenu";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MobileTabBar, type MobileTab } from "@/components/MobileTabBar";
import { MobileInbox } from "@/components/MobileInbox";
import { usePwaInstall } from "@/components/PwaRegister";
import {
  CreateServerModal,
  JoinServerModal,
  CreateChannelModal,
  InviteModal,
  AddFriendModal,
  NewDMModal,
} from "@/components/Modals";
import { previewForMessage } from "@/lib/messagePreview";

// Heavy dialogs split out so first paint stays fast (Discord-like instant shell).
const SettingsModal = dynamic(() => import("@/components/Modals").then((m) => m.SettingsModal), { ssr: false });
const ServerSettingsModal = dynamic(() => import("@/components/ServerSettingsModal").then((m) => m.ServerSettingsModal), { ssr: false });
const ChannelSettingsModal = dynamic(() => import("@/components/ChannelSettingsModal").then((m) => m.ChannelSettingsModal), { ssr: false });
const BrowseServersModal = dynamic(() => import("@/components/BrowseServersModal").then((m) => m.BrowseServersModal), { ssr: false });
const ProfileModal = dynamic(() => import("@/components/ProfileModal").then((m) => m.ProfileModal), { ssr: false });

export default function HomePage() {
  const { user, loading, fetchMe, logout } = useAuthStore();
  const {
    view,
    setView,
    servers,
    activeServerId,
    setActiveServer,
    serverDetail,
    activeChannelId,
    activeDMId,
    setActiveDM,
    refreshServers,
    refreshServerDetail,
    refreshFriends,
    refreshDMs,
    friends,
    conversations,
  } = useAppStore();

  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showChannel, setShowChannel] = useState(false);
  const [channelType, setChannelType] = useState<"TEXT" | "VOICE">("TEXT");
  const [channelCategory, setChannelCategory] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chats");
  const [mobileNav, setMobileNav] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const { theme, toggle: toggleTheme, apply: applyTheme } = useThemeStore();

  // Discord-style auto-away: idle after 5 min with the tab open, restore on return.
  useAutoIdle();

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  // Global Discord-style shortcuts: Ctrl/⌘+K quick switcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowQuick((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer once navigation actually happens (selecting a
  // server/channel/DM), instead of closing on any tap inside the drawer —
  // the latter broke dropdowns and menus on touch devices.
  useEffect(() => {
    setMobileNav(false);
  }, [activeChannelId, activeDMId, view]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void refreshServers();
    void refreshFriends();
    void refreshDMs();
    void useAppStore.getState().refreshMyEmojis();
    void useAppStore.getState().refreshMutes();
    void useAppStore.getState().refreshMentions();
  }, [user, refreshServers, refreshFriends, refreshDMs]);

  // Auto-select first server/channel or home
  useEffect(() => {
    if (!user || servers.length === 0) return;
    if (!activeServerId && view === "server") return;
    // Don't auto-switch if user already picked something
  }, [servers, user, activeServerId, view]);

  useEffect(() => {
    if (!activeServerId) return;
    void refreshServerDetail(activeServerId);
    getSocket().emit("server:join", { serverId: activeServerId });
  }, [activeServerId, refreshServerDetail]);

  // Socket lifecycle (authenticated with the Supabase access token)
  useEffect(() => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSocketToken(data.session.access_token);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        disconnectSocket();
        return;
      }
      setSocketToken(session.access_token);
    });
    const socket = getSocket();
    const onConnect = () => {
      setSocketStatus("live");
      // Reconnects lose all room memberships: rejoin + resync everything.
      const st = useAppStore.getState();
      if (st.activeServerId) socket.emit("server:join", { serverId: st.activeServerId });
      void st.refreshServers();
      void st.refreshFriends();
      void st.refreshDMs();
      void st.refreshMutes();
      void st.refreshMentions();
      void st.refreshMyEmojis();
      if (st.activeServerId) void st.refreshServerDetail(st.activeServerId);
      try {
        window.dispatchEvent(new Event("speakit:resync"));
      } catch {
        /* ignore */
      }
    };
    const onDisconnect = () => setSocketStatus("reconnecting");
    const onDMNotify = () => {
      void useAppStore.getState().refreshDMs();
    };
    const onPresence = ({ userId, status }: { userId: string; status: string }) => {
      const st = useAppStore.getState();
      if (st.serverDetail) {
        st.setServerDetail({
          ...st.serverDetail,
          members: st.serverDetail.members.map((m) => (m.id === userId ? { ...m, status } : m)),
        });
      }
      // Friends + DMs go grey/green live too — no refresh needed.
      useAppStore.setState((s) => ({
        friends: s.friends.map((f) => (f.id === userId ? { ...f, status } : f)),
        conversations: s.conversations.map((c) =>
          c.other.id === userId ? { ...c, other: { ...c.other, status } } : c
        ),
      }));
    };
    const onVoiceUpdate = () => {
      // Could show voice occupancy badges — refresh detail lightly (debounced by server events)
    };
    const onServerUpdated = ({ serverId }: { serverId: string }) => {
      const st = useAppStore.getState();
      if (st.activeServerId === serverId) void st.refreshServerDetail(serverId);
      void st.refreshServers();
    };
    const onKicked = ({ serverId }: { serverId: string }) => {
      const st = useAppStore.getState();
      void st.refreshServers();
      if (st.activeServerId === serverId) {
        st.setActiveServer(null);
        st.setView("home");
      }
    };
    const onFriendUpdated = () => {
      const st = useAppStore.getState();
      void st.refreshFriends();
      void st.refreshDMs();
    };
    const onMention = (p: { channelId?: string; conversationId?: string }) => {
      const st = useAppStore.getState();
      void st.refreshMentions();
      // Discord-like: desktop ping + subtle sound for real pings.
      try {
        if (useLocalAppearance.getState().desktopSounds) playPing();
      } catch {
        /* ignore */
      }
      try {
        if (typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted") {
          const where = p.channelId
            ? `#${st.serverDetail?.channels.find((c) => c.id === p.channelId)?.name ?? "a channel"}`
            : "your DMs";
          new Notification("Speakit — you were mentioned", { body: `Someone pinged you in ${where}.` });
        }
      } catch {
        /* ignore */
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("dm:notify", onDMNotify);
    socket.on("presence:updated", onPresence);
    socket.on("voice:channel:update", onVoiceUpdate);
    socket.on("server:updated", onServerUpdated);
    socket.on("server:kicked", onKicked);
    socket.on("friend:updated", onFriendUpdated);
    socket.on("mention:new", onMention);
    if (socket.connected) setSocketStatus("live");

    return () => {
      subscription.unsubscribe();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("dm:notify", onDMNotify);
      socket.off("presence:updated", onPresence);
      socket.off("voice:channel:update", onVoiceUpdate);
      socket.off("server:updated", onServerUpdated);
      socket.off("server:kicked", onKicked);
      socket.off("friend:updated", onFriendUpdated);
      socket.off("mention:new", onMention);
    };
  }, [user]);

  const handleLogout = async () => {
    disconnectSocket();
    await logout();
    router.replace("/login");
  };

  // UserArea / ServerMenu dispatch these so sidebars stay decoupled.
  useEffect(() => {
    const onLogout = () => void handleLogout();
    const onLeave = () => void handleLeaveServer();
    const onDelete = () => void handleDeleteServer();
    window.addEventListener("speakit:logout", onLogout);
    window.addEventListener("speakit:leave-server", onLeave);
    window.addEventListener("speakit:delete-server", onDelete);
    return () => {
      window.removeEventListener("speakit:logout", onLogout);
      window.removeEventListener("speakit:leave-server", onLeave);
      window.removeEventListener("speakit:delete-server", onDelete);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, serverDetail]);

  const handleLeaveServer = useCallback(async () => {
    if (!activeServerId) return;
    const st = useAppStore.getState();
    const name = st.serverDetail?.name ?? "this server";
    const isOwner = st.serverDetail?.ownerId === user?.id;
    if (isOwner) {
      alert("You own this server — delete it from Server Settings instead of leaving.");
      return;
    }
    if (!confirm(`Leave "${name}"?`)) return;
    await fetch(`/api/servers/${activeServerId}`, { method: "DELETE" });
    await refreshServers();
    setActiveServer(null);
    setView("home");
  }, [activeServerId, refreshServers, setActiveServer, setView, user?.id]);
  const handleDeleteServer = useCallback(async () => {
    if (!activeServerId) return;
    const st = useAppStore.getState();
    const name = st.serverDetail?.name ?? "this server";
    if (st.serverDetail?.ownerId !== user?.id) {
      alert("Only the server owner can delete it.");
      return;
    }
    if (!confirm(`Delete "${name}" permanently? This cannot be undone.`)) return;
    setShowServerSettings(false);
    const res = await fetch(`/api/servers/${activeServerId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to delete server");
      return;
    }
    await refreshServers();
    setActiveServer(null);
    setView("home");
  }, [activeServerId, refreshServers, setActiveServer, setView, user?.id]);

  const openCreateChannel = (type: "TEXT" | "VOICE", categoryId?: string | null) => {
    setChannelType(type);
    setChannelCategory(categoryId ?? null);
    setShowChannel(true);
  };

  // Discord-mobile tabs: Friends jumps to the friends dashboard…
  const goFriends = useCallback(() => {
    setActiveServer(null);
    setView("home");
    setActiveDM(null);
    setMobileTab("friends");
    setMobileNav(false);
  }, [setActiveServer, setView, setActiveDM]);

  // …and opening any chat drops you back on the Home/Chats tab.
  const openDM = useCallback(
    (id: string) => {
      setActiveDM(id);
      setMobileTab("chats");
    },
    [setActiveDM]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-speakit-bg">
        <div className="animate-fade-up text-center">
          <div className="brand-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl font-black text-white shadow-glow">S</div>
          <div className="flex items-center justify-center gap-1.5 text-sm text-speakit-muted">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-speakit-blurple" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-speakit-blurple" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-speakit-blurple" />
            <span className="ml-1">Loading Speakit…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const sidebar = view === "server" && activeServerId ? (
    <ChannelSidebar
      onCreateChannel={openCreateChannel}
      onInvite={() => setShowInvite(true)}
      onOpenSettings={() => setShowSettings(true)}
      onOpenServerSettings={() => setShowServerSettings(true)}
      onOpenChannelSettings={(id) => {
        setChannelSettingsId(id);
        setShowChannelSettings(true);
      }}
    />
  ) : (
    <DMSidebar
      onAddFriend={() => setShowAddFriend(true)}
      onOpenSettings={() => setShowSettings(true)}
      onShowFriends={goFriends}
      onNewDM={() => setShowNewDM(true)}
    />
  );

  return (
    <div className="speakit-shell-in flex h-dvh overflow-hidden bg-speakit-bg">
      <VoiceBridge />
      <ContextMenuHost />
      {/* Desktop rail */}
      <div className="hidden shrink-0 sm:flex sm:min-h-0">
        <ServerRail
          onAdd={() => setShowCreate(true)}
          onJoin={() => setShowJoin(true)}
          onBrowse={() => setShowBrowse(true)}
          onHome={() => {
            setActiveServer(null);
            setView("home");
          }}
        />
      </div>
      {/* Desktop sidebar */}
      <div className="hidden shrink-0 sm:flex sm:min-h-0">{sidebar}</div>

      {/* Mobile drawer (Discord-like slide-over) */}
      {mobileNav && (
        <div className="fixed inset-0 z-[70] flex sm:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileNav(false)} />
          <div className="drawer-in relative flex max-h-full max-w-[92vw] shrink-0 overflow-hidden rounded-r-2xl">
            <ServerRail
              onAdd={() => { setMobileNav(false); setShowCreate(true); }}
              onJoin={() => { setMobileNav(false); setShowJoin(true); }}
              onBrowse={() => { setMobileNav(false); setShowBrowse(true); }}
              onHome={() => {
                setMobileNav(false);
                setActiveServer(null);
                setView("home");
              }}
            />
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top status bar */}
        <div className="flex h-12 items-center gap-2 border-b border-white/[0.06] bg-speakit-rail/80 px-2 text-[11px] text-speakit-muted backdrop-blur-xl sm:px-3">
          <button onClick={() => setMobileNav(true)} className="rounded-xl p-2 transition hover:bg-white/10 hover:text-white sm:hidden" title="Servers & channels">
            <Menu size={16} />
          </button>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 sm:flex">
            <span className={`inline-block h-2 w-2 rounded-full ${socketStatus === "live" ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_1px_rgb(52_211_153/0.8)]" : "bg-amber-400"}`} />
            <span className="font-semibold">{socketStatus === "live" ? "Connected" : "Connecting…"}</span>
          </span>
          {/* Discord-style global search */}
          <button
            onClick={() => setShowQuick(true)}
            className="topbar-search mx-auto flex w-full max-w-md flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-left text-xs text-speakit-muted shadow-inner transition hover:border-speakit-blurple/40 hover:bg-white/[0.08] hover:text-speakit-text hover:shadow-glow sm:mx-2"
            title="Quick Switcher (Ctrl+K)"
          >
            <Search size={13} className="shrink-0" />
            <span className="flex-1 truncate font-medium">Find or start a conversation</span>
            <kbd className="hidden shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold sm:block">Ctrl K</kbd>
          </button>
          <span className="flex shrink-0 items-center gap-1">
            <span className="hidden md:block"><InstallCompact /></span>
            <NotifyBell />
            <button onClick={toggleTheme} className="rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {view === "server" && serverDetail && (
              <button onClick={() => void handleLeaveServer()} className="hidden rounded-lg px-2 py-1.5 font-semibold transition hover:bg-rose-500/20 hover:text-rose-300 lg:block" title="Leave server">
                Leave
              </button>
            )}
            <button onClick={() => void handleLogout()} className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5 font-semibold transition hover:border-white/20 hover:bg-white/10 hover:text-white sm:flex" title="Log out">
              <LogOut size={12} /> @{user.username}
            </button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {mobileTab === "friends" ? (
            <HomeDashboard
              onAddFriend={() => setShowAddFriend(true)}
              onNewDM={() => setShowNewDM(true)}
              onOpenDM={openDM}
            />
          ) : view === "server" ? (
            activeChannelId ? (
              <ChatView key={activeChannelId} channelId={activeChannelId} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <div className="animate-fade-up max-w-sm">
                  <div className="brand-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-2xl text-white shadow-glow">#</div>
                  <div className="mb-1 text-lg font-extrabold tracking-tight text-white">No channels yet</div>
                  <div className="mb-4 text-sm text-speakit-muted">Create your first channel to start talking.</div>
                  <button onClick={() => openCreateChannel("TEXT")} className="brand-gradient rounded-full px-6 py-2.5 text-sm font-extrabold text-white shadow-glow transition hover:brightness-110 active:scale-95">Create Channel</button>
                </div>
              </div>
            )
          ) : activeDMId ? (
            <DMView key={activeDMId} conversationId={activeDMId} />
          ) : (
            <HomeDashboard
              onAddFriend={() => setShowAddFriend(true)}
              onNewDM={() => setShowNewDM(true)}
              onOpenDM={openDM}
            />
          )}
        </div>

        {/* Discord-mobile bottom tabs (phones only) */}
        <MobileTabBar
          tab={mobileTab}
          onChats={() => {
            setMobileTab("chats");
            setMobileNav(false);
          }}
          onFriends={goFriends}
          onSearch={() => setShowQuick(true)}
          onInbox={() => setShowInbox(true)}
          onYou={() => setShowSettings(true)}
        />
      </div>

      <QuickSwitcher open={showQuick} onClose={() => setShowQuick(false)} />
      <MobileInbox open={showInbox} onClose={() => setShowInbox(false)} />
      <CreateServerModal open={showCreate} onClose={() => setShowCreate(false)} />
      <JoinServerModal open={showJoin} onClose={() => setShowJoin(false)} />
      <CreateChannelModal open={showChannel} onClose={() => setShowChannel(false)} defaultType={channelType} categoryId={channelCategory} />
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
      <AddFriendModal open={showAddFriend} onClose={() => setShowAddFriend(false)} />
      <NewDMModal open={showNewDM} onClose={() => setShowNewDM(false)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <ServerSettingsModal open={showServerSettings} onClose={() => setShowServerSettings(false)} />
      <ChannelSettingsModal open={showChannelSettings} onClose={() => { setShowChannelSettings(false); setChannelSettingsId(null); }} channelId={channelSettingsId} />
      <BrowseServersModal open={showBrowse} onClose={() => setShowBrowse(false)} />
      <ProfileModal />
    </div>
  );
}

function InstallCompact() {
  const { canInstall, isStandalone, install } = usePwaInstall();
  if (isStandalone || (!canInstall && typeof window !== "undefined" && !/iPad|iPhone|iPod/.test(navigator.userAgent))) return null;
  return (
    <button
      onClick={() => void install()}
      className="brand-gradient rounded-full px-3 py-1 text-[11px] font-extrabold text-white shadow-glow transition hover:brightness-110"
      title="Install Speakit to your home screen"
    >
      Install
    </button>
  );
}

/** Tiny Discord-like "bloop" using WebAudio — no asset download needed. */
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => void ctx.close().catch(() => {}), 500);
  } catch {
    /* autoplay blocked / unsupported — ignore */
  }
}

function NotifyBell() {  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const click = async () => {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        setPerm("granted");
        return;
      }
      const result = await Notification.requestPermission();
      setPerm(result);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      onClick={() => void click()}
      className="relative rounded-lg p-1.5 transition hover:bg-white/10 hover:text-white"
      title={
        perm === "granted"
          ? "Desktop pings ON (mentions while tab is hidden)"
          : perm === "denied"
            ? "Desktop pings blocked by browser settings"
            : "Enable desktop pings for @mentions"
      }
    >
      {perm === "granted" ? <Bell size={14} /> : <BellOff size={14} className="opacity-70" />}
      {perm === "granted" && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
    </button>
  );
}

function HomeDashboard({ onAddFriend, onNewDM, onOpenDM }: { onAddFriend: () => void; onNewDM: () => void; onOpenDM: (id: string) => void }) {
  const { friends, conversations, pendingIn, pendingOut } = useAppStore();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"online" | "all" | "pending">("online");
  const [q, setQ] = useState("");

  const online = friends.filter((f) => f.status === "online");
  const shown = (tab === "online" ? online : tab === "all" ? friends : []).filter(
    (f) => !q || f.displayName.toLowerCase().includes(q.toLowerCase()) || f.username.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-speakit-bg/80 px-3 backdrop-blur sm:px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
          <MessageCircle size={16} className="text-speakit-accent" />
        </span>
        <span className="hidden font-extrabold tracking-tight text-white sm:block">Friends</span>
        <div className="flex gap-1 rounded-full border border-white/[0.06] bg-black/20 p-1">
          {(["online", "all", "pending"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-bold capitalize transition-all ${tab === t ? "bg-white text-black shadow" : "text-speakit-muted hover:bg-white/10 hover:text-white"}`}
            >
              {t} {t === "pending" && pendingIn.length > 0 ? `(${pendingIn.length})` : t === "online" ? `(${online.length})` : ""}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={onAddFriend} className="hidden items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 hover:shadow-emerald-400/30 active:scale-95 sm:flex">
          <UserPlus size={14} /> Add Friend
        </button>
        <button onClick={onNewDM} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white transition hover:bg-white/[0.12] sm:px-4">
          <Plus size={14} /> <span className="hidden sm:inline">New DM</span>
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-fade-up on-brand relative mb-4 overflow-hidden rounded-3xl border border-white/10 p-6 shadow-pop sm:p-7" style={{ background: "linear-gradient(135deg,#4c1d95 0%,#6d28d9 30%,#6c6cf5 65%,#0ea5e9 130%)" }}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
          <h2 className="relative text-xl font-black tracking-tight text-white sm:text-2xl">Hey {user?.displayName} 👋</h2>
          <p className="relative mt-1.5 max-w-lg text-sm leading-relaxed text-white/85">
            Press <kbd className="rounded-md bg-black/30 px-1.5 py-0.5 font-bold">Ctrl K</kbd> to jump anywhere, type <b>@</b> to mention someone, <b>/</b> for bot commands.
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <button onClick={onAddFriend} className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#5b21b6] shadow-lg transition hover:scale-[1.03] hover:bg-white/95 active:scale-95">Add friends</button>
            <button onClick={onNewDM} className="rounded-full bg-black/30 px-4 py-2 text-xs font-extrabold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-black/45">Start a DM</button>
          </div>
        </div>

        <div className="mb-4"><InstallPrompt /></div>

        <div className="mb-3 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="w-full rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white shadow-inner outline-none transition placeholder:text-speakit-muted/70 focus:border-speakit-blurple/60 focus:ring-2 focus:ring-speakit-blurple/30" />
        </div>

        {tab === "pending" ? (
          <div className="space-y-1.5">
            {pendingIn.length === 0 && pendingOut.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-speakit-muted">No pending requests. New requests land here.</div>}
            {pendingIn.map((p) => (
              <PendingHomeRow key={p.id} id={p.id} displayName={p.user.displayName} username={p.user.username} incoming />
            ))}
            {pendingOut.map((p) => (
              <PendingHomeRow key={p.id} id={p.id} displayName={p.user.displayName} username={p.user.username} incoming={false} />
            ))}
          </div>
        ) : (
          <>
            <h3 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-speakit-muted/80">{tab === "online" ? `Online — ${shown.length}` : `All friends — ${shown.length}`}</h3>
            <div className="mb-6 space-y-1.5">
              {shown.map((f) => (
                <FriendHomeRow key={f.id} f={f} />
              ))}
              {shown.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-speakit-muted">{tab === "online" ? "Nobody online right now." : "No friends yet — add someone to get started."}</div>}
            </div>

            <h3 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-speakit-muted/80">Recent conversations</h3>
            {conversations.length === 0 && (
              <div className="mb-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-speakit-muted">
                No DMs yet. Add a friend, then start a direct message.
              </div>
            )}
            <div className="mb-6 space-y-1.5">
              {conversations.slice(0, 8).map((c) => {
                const isAI = !!(c.isAI || (c.other as { isAI?: boolean }).isAI || c.other.username?.toLowerCase() === "ai");
                return (
                <div key={c.id} className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left shadow-card transition hover:border-white/[0.12] hover:bg-white/[0.06]">
                  <button onClick={() => onOpenDM(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar name={c.other.displayName} color={c.other.avatarColor} src={c.other.avatarUrl || undefined} size={40} status={c.other.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white">{c.other.displayName}{isAI ? " ✨" : ""}</div>
                      <div className="truncate text-xs text-speakit-muted">{previewForMessage(c.lastMessage, c.attachments ?? []) || "No messages yet"}</div>
                    </div>
                  </button>
                  {!isAI && (
                  <button
                    title="Close conversation"
                    onClick={async () => {
                      if (!confirm("Close this conversation? (Messages are deleted)")) return;
                      const res = await fetch(`/api/dms/${c.id}`, { method: "DELETE" });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) alert(data.error ?? "Couldn't close conversation");
                      await useAppStore.getState().refreshDMs();
                    }}
                    className="hidden rounded p-1 text-xs text-speakit-muted hover:text-red-400 group-hover:block"
                  >
                    ✕
                  </button>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FriendHomeRow({ f }: { f: { id: string; friendshipId: string; displayName: string; username: string; avatarColor: string; avatarUrl?: string; status: string } }) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.06]">
      <Avatar name={f.displayName} color={f.avatarColor} src={f.avatarUrl || undefined} size={40} status={f.status} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{f.displayName}</div>
        <div className="text-xs text-speakit-muted">@{f.username}</div>
      </div>
      <button
        title="Remove friend"
        onClick={async () => {
          if (!confirm(`Remove ${f.displayName} as a friend?`)) return;
          const res = await fetch(`/api/friends/${f.friendshipId}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          try {
            const { getSocket } = await import("@/lib/socket");
            if (data.otherUserId) getSocket().emit("friend:refresh", { userIds: [data.otherUserId] });
          } catch {
            /* ignore */
          }
          await useAppStore.getState().refreshFriends();
          await useAppStore.getState().refreshDMs();
        }}
        className="hidden rounded px-2 py-1 text-[11px] text-speakit-muted hover:text-red-400 group-hover:block"
      >
        Remove
      </button>
    </div>
  );
}

function PendingHomeRow({ id, displayName, username, incoming }: { id: string; displayName: string; username: string; incoming: boolean }) {
  const act = async (action: string) => {
    await fetch(`/api/friends/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    await useAppStore.getState().refreshFriends();
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{displayName}</div>
        <div className="text-xs text-speakit-muted">@{username}</div>
      </div>
      {incoming ? (
        <div className="flex gap-1.5">
          <button onClick={() => void act("accept")} className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-95">Accept</button>
          <button onClick={() => void act("decline")} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.12]">Decline</button>
        </div>
      ) : (
        <button onClick={() => void act("cancel")} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white/[0.12]">Cancel</button>
      )}
    </div>
  );
}
