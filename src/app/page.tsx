"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MessageCircle, UserPlus, Plus, Sun, Moon } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import { useThemeStore } from "@/store/useThemeStore";
import { getSocket, disconnectSocket, setSocketToken } from "@/lib/socket";
import { createClient as createSupabaseBrowser } from "@/lib/supabase";
import { VoiceBridge } from "@/hooks/useVoice";
import { ServerRail } from "@/components/ServerRail";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { DMSidebar } from "@/components/DMSidebar";
import { ChatView } from "@/components/ChatView";
import { DMView } from "@/components/DMView";
import { Avatar } from "@/components/Avatar";
import {
  CreateServerModal,
  JoinServerModal,
  CreateChannelModal,
  InviteModal,
  AddFriendModal,
  NewDMModal,
  SettingsModal,
} from "@/components/Modals";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { BrowseServersModal } from "@/components/BrowseServersModal";
import { ProfileModal } from "@/components/ProfileModal";

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
  const [showBrowse, setShowBrowse] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const { theme, toggle: toggleTheme, apply: applyTheme } = useThemeStore();

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

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
    const onConnect = () => setSocketStatus("live");
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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("dm:notify", onDMNotify);
    socket.on("presence:updated", onPresence);
    socket.on("voice:channel:update", onVoiceUpdate);
    socket.on("server:updated", onServerUpdated);
    socket.on("server:kicked", onKicked);
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
    };
  }, [user]);

  const handleLogout = async () => {
    disconnectSocket();
    await logout();
    router.replace("/login");
  };

  const handleLeaveServer = useCallback(async () => {
    if (!activeServerId) return;
    const name = serverDetail?.name ?? "this server";
    if (!confirm(`Leave "${name}"?`)) return;
    await fetch(`/api/servers/${activeServerId}`, { method: "DELETE" });
    await refreshServers();
    setActiveServer(null);
    setView("home");
  }, [activeServerId, serverDetail, refreshServers, setActiveServer, setView]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-speakit-bg">
      <VoiceBridge />
      <ServerRail
        onAdd={() => setShowCreate(true)}
        onJoin={() => setShowJoin(true)}
        onBrowse={() => setShowBrowse(true)}
        onHome={() => {
          setActiveServer(null);
          setView("home");
        }}
      />

      {view === "server" && activeServerId ? (
        <ChannelSidebar
          onCreateChannel={openCreateChannel}
          onInvite={() => setShowInvite(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenServerSettings={() => setShowServerSettings(true)}
        />
      ) : (
        <DMSidebar onAddFriend={() => setShowAddFriend(true)} onOpenSettings={() => setShowSettings(true)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top status bar */}
        <div className="flex h-8 items-center justify-between bg-[#1e1f22] px-3 text-[11px] text-speakit-muted">
          <span>
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${socketStatus === "live" ? "bg-speakit-green" : "bg-yellow-500"}`} />
            {socketStatus === "live" ? "Connected" : "Connecting…"} • Speakit v1.0
          </span>
          <span className="flex items-center gap-2">
            <button onClick={toggleTheme} className="flex items-center gap-1 hover:text-white" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
            </button>
            {view === "server" && serverDetail && (
              <button onClick={handleLeaveServer} className="hover:text-red-400" title="Leave server">
                Leave {serverDetail.name}
              </button>
            )}
            <button onClick={handleLogout} className="flex items-center gap-1 hover:text-white" title="Log out">
              <LogOut size={12} /> @{user.username}
            </button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {view === "server" ? (
            activeChannelId ? (
              <ChatView key={activeChannelId} channelId={activeChannelId} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-speakit-muted">No channels yet — create one!</div>
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

      <CreateServerModal open={showCreate} onClose={() => setShowCreate(false)} />
      <JoinServerModal open={showJoin} onClose={() => setShowJoin(false)} />
      <CreateChannelModal open={showChannel} onClose={() => setShowChannel(false)} defaultType={channelType} categoryId={channelCategory} />
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
      <AddFriendModal open={showAddFriend} onClose={() => setShowAddFriend(false)} />
      <NewDMModal open={showNewDM} onClose={() => setShowNewDM(false)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <ServerSettingsModal open={showServerSettings} onClose={() => setShowServerSettings(false)} />
      <BrowseServersModal open={showBrowse} onClose={() => setShowBrowse(false)} />
      <ProfileModal />
    </div>
  );
}

function HomeDashboard({ onAddFriend, onNewDM, onOpenDM }: { onAddFriend: () => void; onNewDM: () => void; onOpenDM: (id: string) => void }) {
  const { friends, conversations, pendingIn } = useAppStore();
  const { user } = useAuthStore();

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-speakit-bg">
      <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4">
        <MessageCircle size={18} className="text-speakit-muted" />
        <span className="font-bold text-white">Friends</span>
        {pendingIn.length > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{pendingIn.length} pending</span>}
        <div className="flex-1" />
        <button onClick={onAddFriend} className="flex items-center gap-1 rounded bg-speakit-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a8a4a]">
          <UserPlus size={14} /> Add Friend
        </button>
        <button onClick={onNewDM} className="flex items-center gap-1 rounded bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
          <Plus size={14} /> New DM
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <div className="mb-6 rounded-xl bg-gradient-to-r from-[#5865f2] to-[#9b59b6] p-6">
          <h2 className="text-xl font-black text-white">Hey {user?.displayName} 👋 Welcome to Speakit</h2>
          <p className="mt-1 text-sm text-white/80">
            Create a server with the <b>+</b> button, join with an invite code, add friends, and jump into voice. Everything is real-time.
          </p>
        </div>

        <h3 className="mb-2 text-xs font-bold uppercase text-speakit-muted">Recent conversations</h3>
        {conversations.length === 0 && (
          <div className="mb-6 rounded-lg bg-[#2b2d31] p-4 text-sm text-speakit-muted">
            No DMs yet. Add a friend, then start a direct message.
          </div>
        )}
        <div className="mb-6 space-y-1">
          {conversations.map((c) => (
            <button key={c.id} onClick={() => onOpenDM(c.id)} className="flex w-full items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2.5 text-left hover:bg-[#35373c]">
              <Avatar name={c.other.displayName} color={c.other.avatarColor} src={c.other.avatarUrl || undefined} size={36} status={c.other.status} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{c.other.displayName}</div>
                <div className="truncate text-xs text-speakit-muted">{c.lastMessage || "No messages yet"}</div>
              </div>
            </button>
          ))}
        </div>

        <h3 className="mb-2 text-xs font-bold uppercase text-speakit-muted">All friends ({friends.length})</h3>
        <div className="space-y-1">
          {friends.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2.5">
              <Avatar name={f.displayName} color={f.avatarColor} src={f.avatarUrl || undefined} size={36} status={f.status} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{f.displayName}</div>
                <div className="text-xs text-speakit-muted">@{f.username}</div>
              </div>
            </div>
          ))}
          {friends.length === 0 && <div className="rounded-lg bg-[#2b2d31] p-4 text-sm text-speakit-muted">You haven&apos;t added friends yet.</div>}
        </div>
      </div>
    </div>
  );
}
