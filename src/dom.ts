const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Zotero windows can be backed by a privileged/XUL document. Assigning markup
 * directly to innerHTML in such a document can create nodes in the wrong
 * namespace. Parse in a real HTML document first, then import the nodes.
 */
export function replaceWithParsedHTML(doc: Document, root: Element, markup: string): void {
  const parsed = doc.implementation.createHTMLDocument("Submission Tracker");
  parsed.body.innerHTML = markup;

  const fragment = doc.createDocumentFragment();
  for (const node of Array.from(parsed.body.childNodes)) {
    fragment.appendChild(doc.importNode(node, true));
  }
  root.replaceChildren(fragment);
}

export function createHTMLElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tagName: K,
): HTMLElementTagNameMap[K] {
  return doc.createElementNS(HTML_NAMESPACE, tagName) as HTMLElementTagNameMap[K];
}
