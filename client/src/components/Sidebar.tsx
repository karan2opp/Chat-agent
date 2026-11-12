import type { ChatSummary } from "../lib/api";
import { Shuriken } from "./NinjaBuddy";

type Props = {
  chats: ChatSummary[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Sidebar({ chats, activeId, onSelect, onNew }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <span className="brand">
          <Shuriken />
          minimi
          <span className="brand-ko" lang="ko">
            미니미
          </span>
        </span>
        <button className="new-chat" onClick={onNew}>
          + New chat
        </button>
      </div>

      <nav className="chat-list" aria-label="Previous chats">
        {chats.length === 0 && <p className="chat-list-empty">No chats yet</p>}
        {chats.map((c) => (
          <button
            key={c.id}
            className={`chat-item${c.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(c.id)}
            title={c.title}
          >
            <span className="chat-item-title">{c.title}</span>
            <span className="chat-item-date">{formatWhen(c.updatedAt)}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
