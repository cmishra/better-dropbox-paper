"use client";

import Prism, { Token } from "prismjs";
import "prismjs/components/prism-markdown";
import LiveblocksProvider from "@liveblocks/yjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEditor,
  Editor,
  Transforms,
  Text,
  Element,
  NodeEntry,
  BaseRange,
  Node,
} from "slate";
import { Editable, Slate, withReact } from "slate-react";
import { withCursors, withYjs, YjsEditor } from "@slate-yjs/core";
import * as Y from "yjs";
import { LiveblocksProviderType, useRoom, useSelf } from "@/liveblocks.config";
import { Loading } from "@/components/Loading";
import styles from "./Editor.module.css";
import { Leaf } from "@/components/Leaf";
import { Cursors } from "@/components/Cursors";
import { Avatars } from "./Avatars";

// todo:
// - fix bullets. ensure tab to next or previous works
// - make h1 vs h3 different sizes
// - make links work
// - have headers that are edited by others render properly

// Collaborative text editor with simple rich text, live cursors, and live avatars
export default function CollaborativeEditor() {
  const room = useRoom();
  const [connected, setConnected] = useState(false);
  const [sharedType, setSharedType] = useState<Y.XmlText>();
  const [provider, setProvider] = useState<LiveblocksProviderType>();

  // Set up Liveblocks Yjs provider
  useEffect(() => {
    const yDoc = new Y.Doc();
    const yProvider = new LiveblocksProvider(room, yDoc);
    const sharedDoc = yDoc.get("slate", Y.XmlText) as Y.XmlText;
    yProvider.on("sync", setConnected);

    setSharedType(sharedDoc);
    setProvider(yProvider);

    return () => {
      yDoc?.destroy();
      yProvider?.off("sync", setConnected);
      yProvider?.destroy();
    };
  }, [room]);

  if (!connected || !sharedType || !provider) {
    return <Loading />;
  }

  return <SlateEditor provider={provider} sharedType={sharedType} />;
}

const initialState = {
  children: [{ text: "" }],
};

function SlateEditor({
  sharedType,
  provider,
}: {
  sharedType: Y.XmlText;
  provider: LiveblocksProviderType;
}) {
  // Get user info from Liveblocks authentication endpoint
  const userInfo = useSelf((self) => self.info);

  // Set up editor with plugins, and place user info into Yjs awareness and cursors
  const editor = useMemo(() => {
    const e = withReact(
      withCursors(
        withYjs(createEditor(), sharedType),
        provider.awareness as any,
        {
          data: userInfo,
        }
      )
    );

    // Ensure editor always has at least 1 valid child
    const { normalizeNode } = e;
    e.normalizeNode = (entry) => {
      const [node] = entry;

      if (!Editor.isEditor(node) || node.children.length > 0) {
        return normalizeNode(entry);
      }
      Transforms.insertNodes(editor, initialState, { at: [0] });
    };

    return e;
  }, [sharedType, provider.awareness, userInfo]);

  // Set up Leaf components
  const renderLeaf = useCallback((props: any) => <Leaf {...props} />, []);

  const renderElement = useCallback(
    ({
      attributes,
      children,
      element,
    }: {
      attributes: any;
      children: any;
      element: Element;
    }) => {
      console.log("element", JSON.stringify(element));
      const directTextChildren = (element.children ?? []).filter(
        (x): x is Text => typeof x === "object" && !!x && "text" in x
      );
      const authors = directTextChildren
        .toSorted((a, b) => b.text.length - a.text.length)
        .map((x) => (x.author ?? "").split(" ", 1));
      const containsText = directTextChildren.some((x) => x.text.length > 0);
      return (
        <div className="flex items-center" {...attributes}>
          <div className="text-xs w-24 select-none" contentEditable={false}>
            {containsText ? authors.join(", ") : ""}
          </div>
          <div className="border-l-2 ml-2 pl-2" {...attributes}>
            {children}
          </div>
        </div>
      );
    },
    []
  );

  useEffect(() => {
    YjsEditor.connect(editor);
    return () => YjsEditor.disconnect(editor);
  }, [editor]);

  // some magic code that actually implements the markdown support
  // from https://www.slatejs.org/examples/markdown-preview
  const decorate = useCallback(([node, path]: NodeEntry) => {
    const ranges: BaseRange[] = [];

    if (!Text.isText(node)) {
      return ranges;
    }

    const getLength = (token: any) => {
      if (typeof token === "string") {
        return token.length;
      } else if (typeof token.content === "string") {
        return token.content.length;
      } else {
        return token.content.reduce(
          (l: number, t: number) => l + getLength(t),
          0
        );
      }
    };
    // const matchingNodes = Node.parent(node, path);
    // console.log("parent node is", matchingNodes);

    const tokens = Prism.tokenize(node.text, Prism.languages.markdown);
    // console.log("tokens", tokens);
    let start = 0;

    for (const token of tokens) {
      const length = getLength(token);
      const end = start + length;

      if (typeof token !== "string") {
        ranges.push({
          [token.type]: true,
          anchor: { path, offset: start },
          focus: { path, offset: end },
        });
      }

      start = end;
    }

    return ranges;
  }, []);

  return (
    <Slate editor={editor} initialValue={[initialState]}>
      <Cursors>
        <div className={styles.editorHeader}>
          <Avatars />
        </div>
        <Editable
          className="p-2 focus:outline-none"
          decorate={decorate}
          renderLeaf={renderLeaf}
          onKeyDown={() => Editor.addMark(editor, "author", userInfo?.name)}
          renderElement={renderElement}
        />
      </Cursors>
    </Slate>
  );
}
