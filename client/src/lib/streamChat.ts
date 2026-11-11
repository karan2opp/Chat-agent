// The server writes this character followed by the message when a reply fails after text has
// already been sent. Same value as in the server's chat routes.
const STREAM_ERROR_MARKER = "\u001e";

// Sends one message to a chat (or starts a new chat when chatId is undefined) and calls
// onChunk with each piece of the reply as it arrives. Resolves to the chat's id. Throws if the
// request fails, or if the reply is cut off partway (the server saves nothing in that case).
export async function streamChat(
  chatId: string | undefined,
  message: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The browser's time zone lets the server work out what "yesterday" means for this user.
    body: JSON.stringify({ chatId, message, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    signal,
  });

  if (!res.ok || !res.body) {
    let errorMessage = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) errorMessage = data.error;
    } catch {
      // keep the generic message
    }
    throw new Error(errorMessage);
  }

  const returnedId = res.headers.get("X-Chat-Id") ?? chatId;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let failure: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (failure !== undefined) {
      failure += text;
      continue;
    }
    const at = text.indexOf(STREAM_ERROR_MARKER);
    if (at === -1) {
      onChunk(text);
    } else {
      if (at > 0) onChunk(text.slice(0, at));
      failure = text.slice(at + 1);
    }
  }
  if (failure !== undefined) throw new Error(failure || "The reply was cut off");
  return returnedId;
}
