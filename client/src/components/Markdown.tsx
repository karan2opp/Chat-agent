import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// The search tool adds tracking to the links it cites; the address works without it.
function cleanHref(href: string | undefined): string | undefined {
  if (!href) return href;
  try {
    const url = new URL(href);
    url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return href;
  }
}

const components: Components = {
  // Links open in a new tab and cannot reach back into this page.
  a: ({ href, children }) => (
    <a href={cleanHref(href)} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Wide tables scroll sideways inside the message instead of stretching the page.
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

// Renders an assistant reply as Markdown (lists, bold, code, tables, links). Raw HTML in the text
// is not rendered, so a reply cannot inject markup into the page.
export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
