"use client";

import LiveblocksProvider from "@liveblocks/yjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEditor,
  Editor,
  Transforms,
  Element as SlateElement,
  Node as SlateNode,
  Range,
  Point,
  Node,
} from "slate";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";
import { withCursors, withYjs, YjsEditor } from "@slate-yjs/core";
import * as Y from "yjs";
import { LiveblocksProviderType, useRoom, useSelf } from "@/liveblocks.config";
import { Loading } from "@/components/Loading";
import styles from "./Editor.module.css";
import { Cursors } from "@/components/Cursors";
import { Avatars } from "./Avatars";
import { withHistory } from "slate-history";

const SHORTCUTS = {
  "*": "list-item",
  "-": "list-item",
  "+": "list-item",
  ">": "block-quote",
  "#": "heading-one",
  "##": "heading-two",
  "###": "heading-three",
  "####": "heading-four",
  "#####": "heading-five",
  "######": "heading-six",
};

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
    const e = withShortcuts(
      withReact(
        withCursors(
          withYjs(withHistory(createEditor()), sharedType),
          provider.awareness as any,
          {
            data: userInfo,
          }
        )
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

  const handleDOMBeforeInput = useCallback(
    (e: InputEvent) => {
      queueMicrotask(() => {
        const pendingDiffs = ReactEditor.androidPendingDiffs(editor);

        const scheduleFlush = pendingDiffs?.some(({ diff, path }) => {
          if (!diff.text.endsWith(" ")) {
            return false;
          }

          const { text } = SlateNode.leaf(editor, path);
          const beforeText = text.slice(0, diff.start) + diff.text.slice(0, -1);
          if (!(beforeText in SHORTCUTS)) {
            return;
          }

          const blockEntry = Editor.above(editor, {
            at: path,
            match: (n) =>
              SlateElement.isElement(n) && Editor.isBlock(editor, n),
          });
          if (!blockEntry) {
            return false;
          }

          const [, blockPath] = blockEntry;
          return Editor.isStart(editor, Editor.start(editor, path), blockPath);
        });

        if (scheduleFlush) {
          ReactEditor.androidScheduleFlush(editor);
        }
      });
    },
    [editor]
  );

  const Element = ({
    attributes,
    children,
    element,
  }: {
    attributes?: any;
    children: any;
    element: SlateElement;
  }) => {
    switch (element.type) {
      case "bulleted-list":
        return (
          <ul className="text-xs list-disc ml-4" {...attributes}>
            {children}
          </ul>
        );
      case "heading-one":
        return (
          <h1 className="text-xl font-semibold" {...attributes}>
            {children}
          </h1>
        );
      case "heading-two":
        return (
          <h2 className="text-lg font-semibold" {...attributes}>
            {children}
          </h2>
        );
      case "heading-three":
        return (
          <h3 className="text-md font-semibold" {...attributes}>
            {children}
          </h3>
        );
      case "heading-four":
        return (
          <h4 className="text-normal font-semibold" {...attributes}>
            {children}
          </h4>
        );
      case "list-item":
        return (
          <li className="text-xs" {...attributes}>
            {children}
          </li>
        );
      default:
        return (
          <p className="text-xs" {...attributes}>
            {children}
          </p>
        );
    }
  };

  const renderElement = useCallback(
    ({
      attributes,
      children,
      element,
    }: {
      attributes: any;
      children: any;
      element: SlateElement;
    }) => {
      const top_level_author = element.top_level_author;
      if (!top_level_author) {
        return (
          <Element attributes={attributes} element={element}>
            {children}
          </Element>
        );
      }
      // // }

      return (
        <div className="flex items-center" {...attributes}>
          <div
            className="text-xs w-24 select-none italic"
            contentEditable={false}
          >
            {top_level_author}
          </div>
          <div className="border-l-2 ml-2 pl-2">
            <Element element={element}>{children}</Element>
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

  return (
    <Slate editor={editor} initialValue={[initialState]} onChange={console.log}>
      <Cursors>
        <div className={styles.editorHeader}>
          <Avatars />
        </div>
        <Editable
          onDOMBeforeInput={handleDOMBeforeInput}
          autoFocus
          spellCheck
          className="p-2 focus:outline-none"
          onKeyDown={() => Editor.addMark(editor, "author", userInfo?.name)}
          renderElement={renderElement}
        />
      </Cursors>
    </Slate>
  );
}

function findHighestAuthor(element: SlateElement) {
  if ("author" in element || "text" in element) {
    return [element.author as string, element.text.length as number];
  }
  if (SlateElement.isAncestor(element) && element.children.length > 0) {
    const { children } = element;
    const authorsAndCounts = {};
    children.forEach((child) => {
      const resp = findHighestAuthor(child);
      if (!!resp) {
        authorsAndCounts[resp.author] =
          (authorsAndCounts[resp.author] || 0) + resp.count;
      }
    });
    const [[author, count]] = Object.entries(authorsAndCounts).sort(
      ([, count1], [, count2]) => count2 - count1
    );
    return [author, count];
  }
}

const withShortcuts = (editor: Editor) => {
  const { deleteBackward, insertText, normalizeNode, insertBreak } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (path.length === 1) {
      const [highestAuthor, textLen] = findHighestAuthor(node);
      // ensures only original authors can edit a line
      // deletes edits made by any other author
      if (SlateElement.isElement(node) && textLen > 0) {
        for (const [child, childPath] of SlateNode.children(editor, path)) {
          if (child.author !== highestAuthor) {
            Transforms.removeNodes(editor, { at: childPath });
            return;
          }
        }

        // bubbles up the 'author' attribute to the top level
        // so it's not printed multiple times in renderElement
        if (node.top_level_author !== highestAuthor) {
          Transforms.setNodes(
            editor,
            { top_level_author: highestAuthor },
            { at: path }
          );
          return;
        }
      }
    }
    return normalizeNode([node, path]);
  };

  editor.insertBreak = () => {
    const topLevelRow = editor.selection?.focus.path[0];
    Transforms.insertNodes(
      editor,
      { type: "paragraph", children: [{ text: "" }] },
      { at: [topLevelRow + 1] }
    );
    Transforms.select(editor, {
      anchor: { path: [topLevelRow + 1, 0], offset: 0 },
      focus: { path: [topLevelRow + 1, 0], offset: 0 },
    });
  };

  editor.insertText = (text) => {
    const { selection } = editor;

    if (text.endsWith(" ") && selection && Range.isCollapsed(selection)) {
      const { anchor } = selection;
      const block = Editor.above(editor, {
        match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
      });
      const path = block ? block[1] : [];
      const start = Editor.start(editor, path);
      const range = { anchor, focus: start };
      const beforeText = Editor.string(editor, range) + text.slice(0, -1);
      const type = SHORTCUTS?.[beforeText];

      if (type) {
        Transforms.select(editor, range);

        if (!Range.isCollapsed(range)) {
          Transforms.delete(editor);
        }

        const newProperties: Partial<SlateElement> = {
          type,
        };
        Transforms.setNodes<SlateElement>(editor, newProperties, {
          match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
        });

        if (type === "list-item") {
          const list: BulletedListElement = {
            type: "bulleted-list",
            children: [],
          };
          Transforms.wrapNodes(editor, list, {
            match: (n) =>
              !Editor.isEditor(n) &&
              SlateElement.isElement(n) &&
              n.type === "list-item",
          });
        }

        return;
      }
    }

    insertText(text);
  };

  editor.deleteBackward = (...args) => {
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const match = Editor.above(editor, {
        match: (n) => SlateElement.isElement(n) && Editor.isBlock(editor, n),
      });

      if (match) {
        const [block, path] = match;
        const start = Editor.start(editor, path);

        if (
          !Editor.isEditor(block) &&
          SlateElement.isElement(block) &&
          block.type !== "paragraph" &&
          Point.equals(selection.anchor, start)
        ) {
          const newProperties: Partial<SlateElement> = {
            type: "paragraph",
          };
          Transforms.setNodes(editor, newProperties);

          if (block.type === "list-item") {
            Transforms.unwrapNodes(editor, {
              match: (n) =>
                !Editor.isEditor(n) &&
                SlateElement.isElement(n) &&
                n.type === "bulleted-list",
              split: true,
            });
          }

          return;
        }
      }

      deleteBackward(...args);
    }
  };

  return editor;
};
