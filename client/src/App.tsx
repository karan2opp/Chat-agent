import { useCallback, useEffect, useState } from "react";
import Chat from "./components/Chat";
import { NewChatIcon, PanelIcon } from "./components/Icons";
import Sidebar from "./components/Sidebar";
import { listChats, type ChatSummary } from "./lib/api";

// The open chat is kept in the URL (?chat=<id>) so a page reload returns to it.
const idFromUrl = () => new URLSearchParams(window.location.search).get("chat") ?? undefined;

// On narrow screens the sidebar is a drawer over the chat, closed until asked for.
const isNarrow = () => window.matchMedia("(max-width: 720px)").matches;

// Whether the sidebar was left open or folded is remembered in this browser (wide screens only).
const SIDEBAR_KEY = "minimi.sidebarOpen";

function initialSidebarOpen(): boolean {
  if (isNarrow()) return false;
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "false";
  } catch {
    return true;
  }
}

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(idFromUrl);
  // Changing `key` remounts Chat. It only changes when the user picks a chat or starts a new one,
  // never when a new chat gets its id, so a reply that is streaming is not interrupted.
  const [view, setView] = useState({ key: 0, chatId: idFromUrl() });
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);

  const refresh = useCallback(() => {
    listChats()
      .then(setChats)
      .catch(() => {
        // The list is a convenience; a failed refresh should not break the chat.
      });
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("chat", activeId);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url);
  }, [activeId]);

  function toggleSidebar(open: boolean) {
    setSidebarOpen(open);
    if (isNarrow()) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, String(open));
    } catch {
      // Not remembered; it still works for this visit.
    }
  }

  // On a phone the drawer gets out of the way once a chat is chosen.
  function closeDrawer() {
    if (isNarrow()) setSidebarOpen(false);
  }

  function openChat(id: string) {
    closeDrawer();
    if (id === activeId) return;
    setActiveId(id);
    setView((v) => ({ key: v.key + 1, chatId: id }));
  }

  function newChat() {
    closeDrawer();
    setActiveId(undefined);
    setView((v) => ({ key: v.key + 1, chatId: undefined }));
  }

  return (
    <div className={`layout${sidebarOpen ? "" : " sidebar-folded"}`}>
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        onSelect={openChat}
        onNew={newChat}
        onFold={() => toggleSidebar(false)}
      />
      {sidebarOpen && <div className="drawer-backdrop" onClick={() => toggleSidebar(false)} />}

      <main className="main">
        {!sidebarOpen && (
          <div className="floating-controls">
            <button className="icon-button" onClick={() => toggleSidebar(true)} aria-label="Open sidebar" title="Open sidebar">
              <PanelIcon />
            </button>
            <button className="icon-button" onClick={newChat} aria-label="New chat" title="New chat">
              <NewChatIcon />
            </button>
          </div>
        )}
        <Chat
          key={view.key}
          chatId={view.chatId}
          onChatCreated={setActiveId}
          onTurnSaved={refresh}
          onLoadFailed={() => setActiveId(undefined)}
        />
      </main>
    </div>
  );
}
