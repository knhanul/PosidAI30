import { Node } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Video block node — renders <video controls src="...">
// Used for uploaded video files (mp4/webm) stored on WebDAV.
// ---------------------------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoBlock: {
      setVideoBlock: (src: string) => ReturnType;
    };
  }
}

export const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", { ...HTMLAttributes, controls: "controls" }];
  },

  addCommands() {
    return {
      setVideoBlock:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent({ type: "videoBlock", attrs: { src, controls: true } }),
    };
  },
});

// ---------------------------------------------------------------------------
// Iframe block node — renders <iframe src="...">
// Used for external video embeds (YouTube, Vimeo, etc.).
// ---------------------------------------------------------------------------

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    iframeBlock: {
      setIframeBlock: (src: string) => ReturnType;
    };
  }
}

export const IframeBlock = Node.create({
  name: "iframeBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      frameborder: { default: "0" },
      allow: { default: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" },
      allowfullscreen: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "iframe",
      {
        ...HTMLAttributes,
        frameborder: HTMLAttributes.frameborder ?? "0",
        allowfullscreen: "allowfullscreen",
      },
    ];
  },

  addCommands() {
    return {
      setIframeBlock:
        (src: string) =>
        ({ commands }) =>
          commands.insertContent({ type: "iframeBlock", attrs: { src } }),
    };
  },
});

// ---------------------------------------------------------------------------
// Helper: convert common video URLs to embed URLs
// ---------------------------------------------------------------------------

export function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
    if (host.endsWith("vimeo.com")) {
      if (host === "player.vimeo.com") return url;
      const match = parsed.pathname.match(/^\/(\d+)/);
      return match ? `https://player.vimeo.com/video/${match[1]}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
