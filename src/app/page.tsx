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
import { ServerRail } from "@/components/ServerRail";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { DMSidebar } from "@/components/DMSidebar";
import { ChatView } from "@/components/ChatView";
import { DMView } from "@/components/DMView";
import { Avatar } from "@/components/Avatar";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { ContextMenuHost } from "@/components/ContextMenu";
import { InstallPrompt } from "@/components/InstallPrompt";
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
  const [mobileNav, setMobileNav] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const { theme, toggle: toggleTheme, apply: applyTheme } = useThemeStore();

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
    window.addEventListener("speakit:logout", onLogout);
    window.addEventListener("speakit:leave-server", onLeave);
    return () => {
      window.removeEventListener("speakit:logout", onLogout);
      window.removeEventListener("speakit:leave-server", onLeave);
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

  const openCreateChannel = (type: "TEXT" | "VOICE", categoryId?: string | null) => {
    setChannelType(type);
    setChannelCategory(categoryId ?? null);
    setShowChannel(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e1f22]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-speakit-blurple text-3xl font-black text-white">S</div>
          <div className="text-sm text-speakit-muted">Loading Speakit…</div>
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
    <DMSidebar onAddFriend={() => setShowAddFriend(true)} onOpenSettings={() => setShowSettings(true)} />
  );

  return (
    <div className="speakit-shell-in flex h-dvh overflow-hidden bg-speakit-bg">
      <VoiceBridge />
      <ContextMenuHost />
      {/* Desktop rail */}
      <div className="hidden sm:block">
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
      <div className="hidden sm:flex">{sidebar}</div>

      {/* Mobile drawer (Discord-like slide-over) */}
      {mobileNav && (
        <div className="fixed inset-0 z-[70] flex sm:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileNav(false)} />
          <div className="relative flex max-w-[92vw] shrink-0 overflow-hidden rounded-r-2xl">
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
        <div className="flex h-9 items-center gap-2 bg-[#1e1f22] px-2 text-[11px] text-speakit-muted sm:px-3">
          <button onClick={() => setMobileNav(true)} className="rounded p-1.5 hover:bg-white/10 hover:text-white sm:hidden" title="Servers & channels">
            <Menu size={16} />
          </button>
          <span className="hidden items-center sm:flex">
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${socketStatus === "live" ? "bg-speakit-green" : "bg-yellow-500"}`} />
            {socketStatus === "live" ? "Connected" : "Connecting…"}
          </span>
          {/* Discord-style global search */}
          <button
            onClick={() => setShowQuick(true)}
            className="mx-auto flex w-full max-w-md flex-1 items-center gap-2 rounded-md bg-black/30 px-3 py-1.5 text-left text-xs text-speakit-muted hover:bg-black/50 hover:text-speakit-text sm:mx-2"
            title="Quick Switcher (Ctrl+K)"
          >
            <Search size={12} className="shrink-0" />
            <span className="flex-1 truncate">Find or start a conversation</span>
            <kbd className="hidden shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] sm:block">Ctrl K</kbd>
          </button>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden md:block"><InstallCompact /></span>
            <NotifyBell />
            <button onClick={toggleTheme} className="flex items-center gap-1 hover:text-white" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
            </button>
            {view === "server" && serverDetail && (
              <button onClick={() => void handleLeaveServer()} className="hidden hover:text-red-400 lg:block" title="Leave server">
                Leave
              </button>
            )}
            <button onClick={() => void handleLogout()} className="hidden items-center gap-1 hover:text-white sm:flex" title="Log out">
              <LogOut size={12} /> @{user.username}
            </button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {view === "server" ? (
            activeChannelId ? (
              <ChatView key={activeChannelId} channelId={activeChannelId} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-speakit-muted">
                <div>
                  <div className="mb-2 text-lg font-bold text-white">No channels yet</div>
                  <div className="mb-3">Create your first channel to start talking — just like Discord.</div>
                  <button onClick={() => openCreateChannel("TEXT")} className="rounded-md bg-speakit-blurple px-4 py-2 text-sm font-semibold text-white">Create Channel</button>
                </div>
              </div>
            )
          ) : activeDMId ? (
            <DMView key={activeDMId} conversationId={activeDMId} />
          ) : (
            <HomeDashboard
              onAddFriend={() => setShowAddFriend(true)}
              onNewDM={() => setShowNewDM(true)}
              onOpenDM={(id) => setActiveDM(id)}
            />
          )}
        </div>
      </div>

      <QuickSwitcher open={showQuick} onClose={() => setShowQuick(false)} />
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
      className="rounded bg-speakit-blurple/20 px-2 py-1 text-[11px] font-bold text-[#b5bdff] hover:bg-speakit-blurple hover:text-white"
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
      className="flex items-center gap-1 hover:text-white"
      title={
        perm === "granted"
          ? "Desktop pings ON (mentions while tab is hidden)"
          : perm === "denied"
            ? "Desktop pings blocked by browser settings"
            : "Enable desktop pings for @mentions"
      }
    >
      {perm === "granted" ? <Bell size={12} /> : <BellOff size={12} />}
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
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-3 sm:px-4">
        <MessageCircle size={18} className="shrink-0 text-speakit-muted" />
        <span className="hidden font-bold text-white sm:block">Friends</span>
        <div className="flex gap-1">
          {(["online", "all", "pending"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 text-xs font-semibold capitalize ${tab === t ? "bg-white/10 text-white" : "text-speakit-muted hover:bg-white/5"}`}
            >
              {t} {t === "pending" && pendingIn.length > 0 ? `(${pendingIn.length})` : t === "online" ? `(${online.length})` : ""}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={onAddFriend} className="hidden items-center gap-1 rounded bg-speakit-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a8a4a] sm:flex">
          <UserPlus size={14} /> Add Friend
        </button>
        <button onClick={onNewDM} className="flex items-center gap-1 rounded bg-white/10 px-2 py-1.5 text-xs font-semibold text-white hover:bg-white/20 sm:px-3">
          <Plus size={14} /> <span className="hidden sm:inline">New DM</span>
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 rounded-xl bg-gradient-to-r from-[#5865f2] to-[#9b59b6] p-5 sm:p-6">
          <h2 className="text-lg font-black text-white sm:text-xl">Hey {user?.displayName} 👋 Welcome to Speakit</h2>
          <p className="mt-1 text-sm text-white/80">
            Discord-style: press <b>Ctrl K</b> to jump anywhere, right-click anything for more, and set your background + theme in User Settings (gear, bottom-left).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onAddFriend} className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#5865f2]">Add friends</button>
            <button onClick={onNewDM} className="rounded-md bg-black/30 px-3 py-1.5 text-xs font-bold text-white">Start a DM</button>
          </div>
        </div>

        <div className="mb-4"><InstallPrompt /></div>

        <div className="mb-3 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="w-full rounded-md bg-black/30 px-3 py-1.5 text-sm text-white outline-none placeholder:text-speakit-muted focus:ring-2 focus:ring-speakit-blurple" />
        </div>

        {tab === "pending" ? (
          <div className="space-y-1">
            {pendingIn.length === 0 && pendingOut.length === 0 && <div className="rounded-lg bg-[#2b2d31] p-4 text-sm text-speakit-muted">No pending requests. New requests land here.</div>}
            {pendingIn.map((p) => (
              <PendingHomeRow key={p.id} id={p.id} displayName={p.user.displayName} username={p.user.username} incoming />
            ))}
            {pendingOut.map((p) => (
              <PendingHomeRow key={p.id} id={p.id} displayName={p.user.displayName} username={p.user.username} incoming={false} />
            ))}
          </div>
        ) : (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase text-speakit-muted">{tab === "online" ? `Online — ${shown.length}` : `All friends — ${shown.length}`}</h3>
            <div className="mb-6 space-y-1">
              {shown.map((f) => (
                <FriendHomeRow key={f.id} f={f} />
              ))}
              {shown.length === 0 && <div className="rounded-lg bg-[#2b2d31] p-4 text-sm text-speakit-muted">{tab === "online" ? "Nobody online right now." : "No friends yet — add someone to get started."}</div>}
            </div>

            <h3 className="mb-2 text-xs font-bold uppercase text-speakit-muted">Recent conversations</h3>
            {conversations.length === 0 && (
              <div className="mb-6 rounded-lg bg-[#2b2d31] p-4 text-sm text-speakit-muted">
                No DMs yet. Add a friend, then start a direct message.
              </div>
            )}
            <div className="mb-6 space-y-1">
              {conversations.slice(0, 8).map((c) => (
                <div key={c.id} className="group flex w-full items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2.5 text-left hover:bg-[#35373c]">
                  <button onClick={() => onOpenDM(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar name={c.other.displayName} color={c.other.avatarColor} src={c.other.avatarUrl || undefined} size={36} status={c.other.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">{c.other.displayName}</div>
                      <div className="truncate text-xs text-speakit-muted">{previewForMessage(c.lastMessage, c.attachments ?? []) || "No messages yet"}</div>
                    </div>
                  </button>
                  <button
                    title="Close conversation"
                    onClick={async () => {
                      if (!confirm("Close this conversation? (Messages are deleted)")) return;
                      await fetch(`/api/dms/${c.id}`, { method: "DELETE" });
                      await useAppStore.getState().refreshDMs();
                    }}
                    className="hidden rounded p-1 text-xs text-speakit-muted hover:text-red-400 group-hover:block"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FriendHomeRow({ f }: { f: { id: string; friendshipId: string; displayName: string; username: string; avatarColor: string; avatarUrl?: string; status: string } }) {
  return (
    <div className="group flex items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2.5">
      <Avatar name={f.displayName} color={f.avatarColor} src={f.avatarUrl || undefined} size={36} status={f.status} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{f.displayName}</div>
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
    <div className="flex items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{displayName}</div>
        <div className="text-xs text-speakit-muted">@{username}</div>
      </div>
      {incoming ? (
        <div className="flex gap-1.5">
          <button onClick={() => void act("accept")} className="rounded bg-speakit-green px-3 py-1 text-xs font-semibold text-white">Accept</button>
          <button onClick={() => void act("decline")} className="rounded bg-white/10 px-3 py-1 text-xs text-white">Decline</button>
        </div>
      ) : (
        <button onClick={() => void act("cancel")} className="rounded bg-white/10 px-3 py-1 text-xs text-white">Cancel</button>
      )}
    </div>
  );
}
