import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** [[slug]] ve [[slug|etiket]] wiki bağlantılarını tıklanabilir hale getirir. */
const wikiLinks = (md: string, titles?: Record<string, string>) =>
  md.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_m, slug: string, label?: string) => {
    const s = slug.trim();
    return `[${label ?? titles?.[s] ?? s}](#wiki:${encodeURIComponent(s)})`;
  });

export function Markdown({
  children,
  className = '',
  onWikiLink,
  titles,
}: {
  children: string;
  className?: string;
  onWikiLink?: (slug: string) => void;
  titles?: Record<string, string>;
}) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, href, children: kids, ...props }) =>
            href?.startsWith('#wiki:') ? (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  onWikiLink?.(decodeURIComponent(href.slice(6)));
                }}
                className="wiki-link"
              >
                {kids}
              </a>
            ) : (
              <a href={href} {...props} target="_blank" rel="noreferrer">
                {kids}
              </a>
            ),
        }}
      >
        {wikiLinks(children, titles)}
      </ReactMarkdown>
    </div>
  );
}
