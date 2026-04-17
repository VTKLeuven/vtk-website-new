import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pdfEmbed: {
      setPdfEmbed: (attrs: { src: string; title?: string }) => ReturnType;
    };
  }
}

export const PdfEmbed = Node.create({
  name: "pdfEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      title: { default: "PDF" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='pdf-embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "pdf-embed", class: "my-4" }),
      [
        "iframe",
        {
          src: HTMLAttributes.src,
          title: HTMLAttributes.title,
          class: "w-full h-[70vh] rounded border",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setPdfEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
