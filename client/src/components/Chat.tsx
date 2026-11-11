import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { streamChat, type ChatMessage } from "../lib/streamChat";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      await streamChat(history, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      });
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
        {messages.length === 0 && (
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
        <button onClick={() => void send()} disabled={streaming || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
