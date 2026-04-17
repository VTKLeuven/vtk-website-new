"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import { PdfEmbed } from "./PdfEmbed";

type Props = {
  value: unknown;
  onChange: (json: unknown) => void;
  uploadEndpoint?: string;
};

export function WysiwygEditor({ value, onChange, uploadEndpoint = "/api/admin/upload" }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: false }),
      PdfEmbed,
    ],
    content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class: "prose-vtk min-h-[16rem] p-4 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Avoid resetting content on every parent re-render; only update if prop changes externally.
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(value) && value) {
      editor.commands.setContent(value as never, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  async function uploadFile(file: File, kind: "image" | "pdf" | "file"): Promise<{ url: string; key: string } | null> {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch(uploadEndpoint, { method: "POST", body: form });
    if (!res.ok) return null;
    return (await res.json()) as { url: string; key: string };
  }

  async function onUploadImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      const uploaded = await uploadFile(file, "image");
      if (uploaded) editor.chain().focus().setImage({ src: uploaded.url }).run();
    };
    input.click();
  }

  async function onEmbedPdf() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      const uploaded = await uploadFile(file, "pdf");
      if (uploaded) editor.chain().focus().setPdfEmbed({ src: uploaded.url, title: file.name }).run();
    };
    input.click();
  }

  function onSetLink() {
    if (!editor) return;
    const href = window.prompt("URL (https://...)");
    if (!href) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 bg-vtk-blue-muted/50 p-2 text-sm">
        <TbBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </TbBtn>
        <TbBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </TbBtn>
        <TbBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </TbBtn>
        <TbBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </TbBtn>
        <TbBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          •
        </TbBtn>
        <TbBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </TbBtn>
        <TbBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          ❝
        </TbBtn>
        <TbBtn onClick={onSetLink}>link</TbBtn>
        <TbBtn onClick={onUploadImage}>image</TbBtn>
        <TbBtn onClick={onEmbedPdf}>PDF</TbBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function TbBtn({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-7 min-w-7 px-2 rounded text-xs font-medium " +
        (active ? "bg-vtk-blue text-white shadow-sm" : "hover:bg-white")
      }
    >
      {children}
    </button>
  );
}
