"use client";

import Prism from "prismjs";
import "prismjs/components/prism-markdown";
import LiveblocksProvider from "@liveblocks/yjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createEditor, Editor, Transforms, Text, Operation } from "slate";
import { Editable, Slate, withReact } from "slate-react";
import { withCursors, withYjs, YjsEditor } from "@slate-yjs/core";
import * as Y from "yjs";
import { LiveblocksProviderType, useRoom, useSelf } from "@/liveblocks.config";
import { Loading } from "@/components/Loading";
import styles from "./Editor.module.css";
import { Leaf } from "@/components/Leaf";
import { Cursors } from "@/components/Cursors";
import { Avatars } from "./Avatars";
import { Toolbar } from "./Toolbar";

// todo:
// - fix bullets. ensure tab to next or previous works

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

const emptyNode = {
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

      Transforms.insertNodes(editor, emptyNode, { at: [0] });
    };

    return e;
  }, [sharedType, provider.awareness, userInfo]);

  // Set up Leaf components
  const renderLeaf = useCallback((props: any) => <Leaf {...props} />, []);

  // Connect Slate-yjs to the Slate editor
  useEffect(() => {
    YjsEditor.connect(editor);
    return () => YjsEditor.disconnect(editor);
  }, [editor]);

  const { apply: applyOrig, addMark } = editor;

  // editor.apply = (operation) => {
  //   console.log("operation", operation);
  //   if (Operation.isTextOperation(operation)) {
  //     if (operation.type === "insert_text") {
  //       const [node] = Editor.node(editor, operation.path);
  //       const nodeText = "text" in node ? node.text : undefined;
  //       if (typeof nodeText === "string" && nodeText.length === 0) {
  //         return applyOrig({
  //           type: "insert_text",
  //           path: operation.path,
  //           offset: 0,
  //           text: operation.text.startsWith(generateAuthorAnnotation())
  //             ? operation.text
  //             : generateAuthorAnnotation() + operation.text,
  //         });
  //       }
  //     }

  //     if (operation.type === "remove_text") {
  //       const [node] = Editor.node(editor, operation.path);
  //       const nodeText = "text" in node ? node.text : undefined;
  //       if (nodeText === generateAuthorAnnotation() + operation.text) {
  //         return applyOrig({
  //           type: "remove_text",
  //           path: operation.path,
  //           offset: 0,
  //           text: generateAuthorAnnotation() + operation.text,
  //         });
  //       }
  //     }
  //   }
  //   return applyOrig(operation);
  // };

  useEffect(() => {
    editor.addMark("author", userInfo.name);
    console.log("enabled authorship mark");
  }, [JSON.stringify(editor.marks)]);
  console.log("marks", editor.marks);
  const decorate = useCallback(([node, path]) => {
    const ranges = [];

    if (!Text.isText(node)) {
      return ranges;
    }

    const getLength = (token) => {
      if (typeof token === "string") {
        return token.length;
      } else if (typeof token.content === "string") {
        return token.content.length;
      } else {
        return token.content.reduce((l, t) => l + getLength(t), 0);
      }
    };

    const tokens = Prism.tokenize(node.text, Prism.languages.markdown);
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
    <Slate editor={editor} initialValue={[emptyNode]}>
      <Cursors>
        <div className={styles.editorHeader}>
          <Toolbar />
          <Avatars />
        </div>
        <Editable decorate={decorate} renderLeaf={renderLeaf} />
      </Cursors>
    </Slate>
  );
}
