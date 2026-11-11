// Sends one message to a chat (or starts a new chat when chatId is undefined) and calls
// onChunk with each piece of the reply as it arrives. Resolves to the chat's id.
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
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  return returnedId;
}
