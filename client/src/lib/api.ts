export type ChatSummary = { id: string; title: string; createdAt: string; updatedAt: string };

export type StoredTurn = {
  id: number;
  userText: string;
  assistantText: string;
  askedAt: string;
  answeredAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const listChats = () => getJson<ChatSummary[]>("/api/chats");

export const getChat = (id: string) =>
  getJson<{ chat: ChatSummary; turns: StoredTurn[] }>(`/api/chats/${id}`);
