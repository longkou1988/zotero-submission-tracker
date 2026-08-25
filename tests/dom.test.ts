import { describe, expect, it, vi } from "vitest";
import { createHTMLElement, replaceWithParsedHTML } from "../src/dom";

describe("HTML rendering in Zotero privileged documents", () => {
  it("parses dashboard markup in an HTML document before importing it", () => {
    const sourceNode = { id: "q" };
    const importedNode = { id: "q-imported" };
    const sourceBody = { innerHTML: "", childNodes: [sourceNode] };
    const fragment = { appendChild: vi.fn() };
    const root = { replaceChildren: vi.fn() };
    const createHTMLDocument = vi.fn(() => ({ body: sourceBody }));
    const createDocumentFragment = vi.fn(() => fragment);
    const importNode = vi.fn(() => importedNode);
    const doc = {
      implementation: { createHTMLDocument },
      createDocumentFragment,
      importNode,
    } as unknown as Document;

    replaceWithParsedHTML(doc, root as unknown as Element, '<input id="q">');

    expect(sourceBody.innerHTML).toBe('<input id="q">');
    expect(createHTMLDocument).toHaveBeenCalledWith("Submission Tracker");
    expect(importNode).toHaveBeenCalledWith(sourceNode, true);
    expect(fragment.appendChild).toHaveBeenCalledWith(importedNode);
    expect(root.replaceChildren).toHaveBeenCalledWith(fragment);
  });

  it("creates dialog elements in the HTML namespace", () => {
    const createElementNS = vi.fn(() => ({}));
    const doc = { createElementNS } as unknown as Document;

    createHTMLElement(doc, "dialog");

    expect(createElementNS).toHaveBeenCalledWith(
      "http://www.w3.org/1999/xhtml",
      "dialog",
    );
  });
});
