const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Zotero windows can be backed by a privileged/XUL document. Assigning markup
 * directly to innerHTML in such a document can create nodes in the wrong
 * namespace. Parse in a real HTML document first, then import the nodes.
 *
 * NOTE: This helper is kept for legacy callers. New code should prefer
 * the `h()` hyperscript helper, which builds DOM trees with explicit
 * `createElementNS(HTML_NAMESPACE, ...)`. Building each node individually
 * is what fixed the v0.1.19 dashboard regression and the v0.1.20 dialog
 * regression where innerHTML was silently dropping elements such as
 * `<button>` and the closing `<hr>` siblings.
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

// ---------------------------------------------------------------------------
// Hyperscript-style DOM builder.
//
// Use `h(doc, "button", { class: "primary", onClick: handler }, "Save")` to
// build any HTML element. Every node is created in the HTML namespace via
// `createElementNS`, which is what makes the result render reliably inside a
// Zotero chrome document (including inside `<dialog>.showModal()`).
// ---------------------------------------------------------------------------

export type DOMEventName =
  | "click"
  | "input"
  | "change"
  | "submit"
  | "focus"
  | "blur"
  | "keydown"
  | "keyup"
  | "keypress"
  | "mousedown"
  | "mouseup";

export type DOMEventHandler = (event: Event) => void;

export type AttributeValue =
  | string
  | number
  | boolean
  | DOMEventHandler
  | { [name: string]: string | number | boolean | null | undefined }
  | null
  | undefined;

export type Attributes = { [name: string]: AttributeValue };

export type ChildSpec = Node | string | number | boolean | null | undefined;
export type ChildrenSpec = ChildSpec | ChildSpec[];

const BOOLEAN_ATTRS = new Set([
  "checked",
  "selected",
  "disabled",
  "readonly",
  "required",
  "multiple",
  "autofocus",
  "hidden",
  "open",
]);

/**
 * Create an HTML element with attributes and children in the HTML namespace.
 *
 * Special attribute keys:
 *   - `class` (or `className`): set the CSS class.
 *   - `style`: an object map of CSS property → value.
 *   - `dataset`: an object map of data-attribute suffix → value.
 *   - `value`: set the form-control value (`.value = ...`).
 *   - `checked`, `selected`, `disabled`, `readonly`, `required`: set the
 *     boolean property.
 *   - Any key starting with `on` (e.g. `onClick`, `onInput`): attach an
 *     `addEventListener` with the event name taken from the suffix
 *     (lowercased).
 *   - All other keys are written via `setAttribute`.
 *
 * Children may be strings/numbers (become text nodes) or other Nodes
 * (appended as-is). `null`/`undefined`/`false` are skipped, which makes
 * conditional children ergonomic.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs?: Attributes | null,
  children?: ChildrenSpec,
): HTMLElementTagNameMap[K] {
  const el = doc.createElementNS(HTML_NAMESPACE, tag) as HTMLElementTagNameMap[K];

  if (attrs) {
    for (const [rawKey, rawValue] of Object.entries(attrs)) {
      if (rawValue == null || rawValue === false) continue;
      const key = rawKey;
      const lower = key.toLowerCase();

      if (lower === "class" || lower === "classname") {
        el.setAttribute("class", String(rawValue));
        continue;
      }

      if (lower === "style" && rawValue && typeof rawValue === "object") {
        const map = rawValue as Record<string, string | number | null | undefined>;
        for (const [prop, propValue] of Object.entries(map)) {
          if (propValue == null) continue;
          (el as HTMLElement).style.setProperty(prop, String(propValue));
        }
        continue;
      }

      if (lower === "dataset" && rawValue && typeof rawValue === "object") {
        const map = rawValue as Record<string, string | number | boolean | null | undefined>;
        for (const [dataKey, dataValue] of Object.entries(map)) {
          if (dataValue == null) continue;
          (el as HTMLElement).dataset[toCamel(dataKey)] = String(dataValue);
        }
        continue;
      }

      if (lower.startsWith("on") && typeof rawValue === "function") {
        const eventName = lower.slice(2);
        el.addEventListener(eventName, rawValue as EventListener);
        continue;
      }

      if (BOOLEAN_ATTRS.has(lower)) {
        (el as unknown as Record<string, unknown>)[lower] = !!rawValue;
        continue;
      }

      if (lower === "value") {
        (el as unknown as Record<string, unknown>).value = String(rawValue);
        continue;
      }

      el.setAttribute(key, String(rawValue));
    }
  }

  if (children != null) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      appendChild(doc, el, child);
    }
  }

  return el;
}

function appendChild(doc: Document, parent: Element, child: ChildSpec): void {
  if (child == null || child === false) return;
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(doc.createTextNode(String(child)));
    return;
  }
  if (Array.isArray(child)) {
    for (const nested of child) appendChild(doc, parent, nested);
  }
}

function toCamel(input: string): string {
  return input.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
