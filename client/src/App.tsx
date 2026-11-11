import { useCallback, useEffect, useState } from "react";
import Chat from "./components/Chat";
import Sidebar from "./components/Sidebar";
import { listChats, type ChatSummary } from "./lib/api";

// The open chat is kept in the URL (?chat=<id>) so a page reload returns to it.
const idFromUrl = () => new URLSearchParams(window.location.search).get("chat") ?? undefined;

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(idFromUrl);
  // Changing `key` remounts Chat. It only changes when the user picks a chat or starts a new one,
  // never when a new chat gets its id, so a reply that is streaming is not interrupted.
  const [view, setView] = useState({ key: 0, chatId: idFromUrl() });

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

  function openChat(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setView((v) => ({ key: v.key + 1, chatId: id }));
  }

  function newChat() {
    setActiveId(undefined);
    setView((v) => ({ key: v.key + 1, chatId: undefined }));
  }

  const title = chats.find((c) => c.id === activeId)?.title ?? "New chat";

  return (
    <div className="layout">
      <Sidebar chats={chats} activeId={activeId} onSelect={openChat} onNew={newChat} />
      <main className="main">
        <header className="main-header">
          <span className="main-title">{title}</span>
          <button className="new-chat mobile-only" onClick={newChat}>
            + New chat
          </button>
        </header>
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
