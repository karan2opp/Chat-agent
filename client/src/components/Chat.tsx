import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getChat } from "../lib/api";
import { streamChat } from "../lib/streamChat";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  // Set when opening an existing chat; its saved turns are loaded on mount.
  chatId?: string;
  onChatCreated: (id: string) => void;
  onTurnSaved: () => void;
  onLoadFailed: () => void;
};

export default function Chat({ chatId: initialChatId, onChatCreated, onTurnSaved, onLoadFailed }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | undefined>(initialChatId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(Boolean(initialChatId));
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load the saved turns of an existing chat.
  useEffect(() => {
    if (!initialChatId) return;
    let cancelled = false;
    getChat(initialChatId)
      .then(({ turns }) => {
        if (cancelled) return;
        setMessages(
          turns.flatMap<ChatMessage>((t) => [
            { role: "user", content: t.userText },
            { role: "assistant", content: t.assistantText },
          ]),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load this chat.");
        setChatId(undefined);
        onLoadFailed();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Runs once per mount; App remounts Chat (new key) when a different chat is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || streaming || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      // No abort signal on purpose: if the user opens another chat mid-reply, the reply still
      // finishes and is saved by the server (it only saves completed replies).
      const id = await streamChat(chatId, text, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      });
      if (mounted.current && id && !chatId) {
        setChatId(id);
        onChatCreated(id);
      }
      onTurnSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Drop the empty assistant bubble if nothing streamed in.
      setMessages((prev) =>
        prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev,
      );
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="chat">
      <div className="messages">
        {loading && <p className="empty">Loading chat…</p>}
        {!loading && messages.length === 0 && (
          <p className="empty">Ask me anything. I can search the web.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message (Enter to send, Shift+Enter for a new line)"
          rows={2}
        />
        <button onClick={() => void send()} disabled={streaming || loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
