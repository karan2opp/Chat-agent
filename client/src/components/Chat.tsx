import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getChat } from "../lib/api";
import { streamChat } from "../lib/streamChat";
import Markdown from "./Markdown";
import NinjaBuddy, { Shuriken, type NinjaMood } from "./NinjaBuddy";

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
  // The message whose reply failed, so the error banner can offer to send it again.
  const [failedText, setFailedText] = useState<string | null>(null);
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

  // `retryText` is a message that failed earlier; the box is left alone so a new draft survives.
  async function send(retryText?: string) {
    const text = (retryText ?? input).trim();
    if (!text || streaming || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    if (retryText === undefined) setInput("");
    setError(null);
    setFailedText(null);
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
      // The server saves nothing when a reply fails, so take the question and any partial reply
      // back out of the list (a reload would not show them either), and hand the question back
      // so it can be edited or sent again. A draft typed in the meantime is not overwritten.
      setMessages((prev) => prev.slice(0, -2));
      setFailedText(text);
      setInput((current) => (current === "" ? text : current));
    } finally {
      setStreaming(false);
    }
  }

  // Waiting for the first words is "thinking"; once text streams in it is "typing".
  const lastMessage = messages[messages.length - 1];
  const mood: NinjaMood = streaming
    ? lastMessage?.content
      ? "typing"
      : "thinking"
    : error
      ? "oops"
      : input.trim()
        ? "listening"
        : "idle";

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
            {m.role === "assistant" && m.content ? (
              <Markdown text={m.content} />
            ) : (
              m.content || (streaming && i === messages.length - 1 ? "…" : "")
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="error">
          <span>{error}</span>
          {failedText && (
            <button onClick={() => void send(failedText)} disabled={streaming}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="composer">
        <NinjaBuddy mood={mood} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message (Enter to send, Shift+Enter for a new line)"
          rows={2}
        />
        <button className="send" onClick={() => void send()} disabled={streaming || loading || !input.trim()}>
          <Shuriken spinning={streaming} />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}
