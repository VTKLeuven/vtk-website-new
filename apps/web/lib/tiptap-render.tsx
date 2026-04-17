import type { JSX, ReactNode } from "react";

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

function applyMarks(text: string, marks: Node["marks"]): ReactNode {
  if (!marks || marks.length === 0) return text;
  return marks.reduce<ReactNode>((acc, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{acc}</strong>;
      case "italic":
        return <em>{acc}</em>;
      case "underline":
        return <span className="underline">{acc}</span>;
      case "strike":
        return <s>{acc}</s>;
      case "code":
        return <code className="rounded bg-vtk-blue-soft px-1.5 py-0.5 text-sm text-vtk-blue">{acc}</code>;
      case "link": {
        const href = (mark.attrs?.href as string | undefined) || "#";
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {acc}
          </a>
        );
      }
      default:
        return acc;
    }
  }, text);
}

function renderNode(node: Node, key: string): ReactNode {
  const children = node.content?.map((c, i) => renderNode(c, `${key}.${i}`));

  switch (node.type) {
    case "doc":
      return <>{children}</>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = (node.attrs?.level as number | undefined) ?? 2;
      const Tag = (`h${Math.min(Math.max(level, 1), 6)}` as keyof JSX.IntrinsicElements);
      return <Tag key={key}>{children}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "codeBlock":
      return (
        <pre key={key} className="overflow-x-auto rounded-xl border border-vtk-blue/15 bg-vtk-blue p-4 text-sm text-white">
          <code>{children}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = (node.attrs?.src as string | undefined) ?? "";
      const alt = (node.attrs?.alt as string | undefined) ?? "";
      return <img key={key} src={src} alt={alt} />;
    }
    case "pdfEmbed": {
      const src = (node.attrs?.src as string | undefined) ?? "";
      const title = (node.attrs?.title as string | undefined) ?? "PDF";
      return (
        <div key={key} className="my-4">
          <iframe
            src={src}
            title={title}
            className="w-full h-[80vh] rounded border border-zinc-300"
          />
        </div>
      );
    }
    case "text":
      return <span key={key}>{applyMarks(node.text ?? "", node.marks)}</span>;
    default:
      return children ? <div key={key}>{children}</div> : null;
  }
}

export function renderTiptap(json: unknown): ReactNode {
  if (!json || typeof json !== "object") return null;
  return renderNode(json as Node, "root");
}
