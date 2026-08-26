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
import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";

export type ImageUploader = (file: File) => Promise<string>;

type Props = { value: string; onChange: (value: string) => void; onUpload?: ImageUploader; onUploadingChange?: (uploading: boolean) => void; disabled?: boolean };

function getImageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  const files = Array.from(data.files ?? []);
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f && !files.includes(f)) files.push(f);
    }
  }
  return files.find((f) => f.type.startsWith("image/")) ?? null;
}

export default function RichTextEditor({ value, onChange, onUpload, onUploadingChange, disabled }: Props) {
  const onUploadRef = useRef(onUpload);
  const lastPasteRef = useRef("");
  useEffect(() => { onUploadRef.current = onUpload; }, [onUpload]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => { onUploadingChange?.(uploading); }, [onUploadingChange, uploading]);

  const insertImageFiles = async (view: EditorView, files: File[], uploader: ImageUploader) => {
    setUploading(true);
    setUploadError("");
    try {
      for (const file of files) {
        const src = await uploader(file);
        const alt = file.name || "본문 이미지";
        view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src, alt })));
      }
      view.focus();
    } catch {
      setUploadError("이미지를 업로드하지 못했습니다. 사진 버튼으로 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  };

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Underline, Link.configure({ openOnClick: false, protocols: ["http", "https"] }), Image.configure({ inline: false, allowBase64: false }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: value || "<p></p>",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: { class: "rich-editor-content", "aria-label": "본문 편집기" },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file));
        const fallback = getImageFromClipboard(event.clipboardData);
        if (!files.length && fallback) files.push(fallback);
        const uploader = onUploadRef.current;
        const signature = files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
        if (!files.length || !uploader || signature === lastPasteRef.current) return false;
        lastPasteRef.current = signature;
        window.setTimeout(() => { lastPasteRef.current = ""; }, 500);
        event.preventDefault();
        void insertImageFiles(view, files, uploader);
        return true;
      },
      handleDrop: (view, event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("image/")) ?? null;
        const uploader = onUploadRef.current;
        if (!file || !uploader) return false;
        event.preventDefault();
        const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (dropPos) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(dropPos.pos))));
        void insertImageFiles(view, [file], uploader);
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
  const addImage = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp"; input.capture = "environment"; input.onchange = () => { const file = input.files?.[0]; const uploader = onUploadRef.current; if (file && uploader) void insertImageFiles(editor.view, [file], uploader); }; input.click(); };

  return <div className="rich-editor" data-disabled={disabled || undefined}>
    <div className="rich-editor-toolbar" role="toolbar" aria-label="본문 서식">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} aria-label="굵게">굵게</button><button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="기울임">기울임</button><button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="밑줄">밑줄</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>제목 2</button><button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>제목 3</button><button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>목록</button><button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>번호</button><button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>인용</button><button type="button" onClick={addLink}>링크</button><button type="button" onClick={addImage} disabled={!onUpload || uploading}>사진</button><button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>구분선</button><button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>코드</button><button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>표</button><button type="button" onClick={() => editor.chain().focus().undo().run()}>실행 취소</button><button type="button" onClick={() => editor.chain().focus().redo().run()}>다시 실행</button>
    </div><EditorContent editor={editor} />{uploading && <div className="rich-editor-uploading" role="status" aria-live="polite">이미지를 업로드하는 중…</div>}{uploadError && <div className="rich-editor-upload-error" role="alert">{uploadError}</div>}
  </div>;
}
