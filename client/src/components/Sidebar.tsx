import type { ChatSummary } from "../lib/api";
import { PanelIcon } from "./Icons";
import { Shuriken } from "./NinjaBuddy";

type Props = {
  chats: ChatSummary[];
  activeId: string | undefined;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onFold: () => void;
};

export default function Sidebar({ chats, activeId, open, onSelect, onNew, onFold }: Props) {
  return (
    // Folded, it stays in the page so it can slide back; CSS hides it from the keyboard too.
    <aside className={`sidebar${open ? "" : " folded"}`} aria-hidden={!open}>
      <div className="sidebar-top">
        <div className="sidebar-head">
          <span className="brand">
            <Shuriken />
            Ray
            <span className="moon" aria-hidden="true" />
          </span>
          <button className="icon-button" onClick={onFold} aria-label="Fold sidebar" title="Fold sidebar">
            <PanelIcon />
          </button>
        </div>
        <button className="new-chat" onClick={onNew}>
          + New chat
        </button>
      </div>

      <nav className="chat-list" aria-labelledby="recents-label">
        <h2 className="chat-list-label" id="recents-label">
          Recents
        </h2>
        {chats.length === 0 && <p className="chat-list-empty">No chats yet</p>}
        {chats.map((c) => (
          <button
            key={c.id}
            className={`chat-item${c.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(c.id)}
            title={c.title}
          >
            <span className="chat-item-title">{c.title}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
