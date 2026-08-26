"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useEffect } from "react";

export type ImageUploader = (file: File) => Promise<string>;

type Props = { value: string; onChange: (value: string) => void; onUpload?: ImageUploader; disabled?: boolean };

export default function RichTextEditor({ value, onChange, onUpload, disabled }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Underline, Link.configure({ openOnClick: false, protocols: ["http", "https"] }), Image.configure({ inline: false, allowBase64: false }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: value || "<p></p>",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: { class: "rich-editor-content", "aria-label": "본문 편집기" },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
        if (!file || !onUpload) return false;
        event.preventDefault();
        void onUpload(file).then((src) => editor?.chain().focus().setImage({ src, alt: file.name }).run());
        return true;
      },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("image/"));
        if (!file || !onUpload) return false;
        event.preventDefault();
        void onUpload(file).then((src) => editor?.chain().focus().setImage({ src, alt: file.name }).run());
        return true;
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value || "<p></p>", false);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <div className="rich-editor-loading">편집기를 준비하고 있습니다.</div>;
  const addLink = () => { const href = window.prompt("링크 주소를 입력하세요."); if (href) editor.chain().focus().setLink({ href }).run(); };
  const addImage = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.capture = "environment"; input.onchange = () => { const file = input.files?.[0]; if (file && onUpload) void onUpload(file).then((src) => editor.chain().focus().setImage({ src, alt: file.name }).run()); }; input.click(); };

  return <div className="rich-editor" data-disabled={disabled || undefined}>
    <div className="rich-editor-toolbar" role="toolbar" aria-label="본문 서식">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="굵게">굵게</button><button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="기울임">기울임</button><button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="밑줄">밑줄</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>제목 2</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>제목 3</button><button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>목록</button><button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>번호</button><button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>인용</button><button type="button" onClick={addLink}>링크</button><button type="button" onClick={addImage} disabled={!onUpload}>사진</button><button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>구분선</button><button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>코드</button><button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>표</button><button type="button" onClick={() => editor.chain().focus().undo().run()}>실행 취소</button><button type="button" onClick={() => editor.chain().focus().redo().run()}>다시 실행</button>
    </div><EditorContent editor={editor} />
  </div>;
}
