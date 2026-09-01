import { config } from "../../package.json";
import type { SubmissionRecord } from "../types";
import { getString } from "../utils/locale";
import { html } from "./ui";
import { buildInquiryEmailContent } from "./workflow";

export function openInquiryAssistant(
  record: SubmissionRecord,
  quietDays: number,
): void {
  const mail = buildInquiryEmailContent({
    journal: record.journal,
    manuscriptId: record.manuscriptId,
    quietDays,
  });

  const helper = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
    tag: "div",
    namespace: "html",
    id: `${config.addonRef}-inquiry-root`,
    styles: { display: "block", minWidth: "680px" },
  });

  helper.setDialogData({
    loadCallback: () => {
      const win = helper.window;
      const root = win.document.getElementById(
        `${config.addonRef}-inquiry-root`,
      ) as HTMLElement | null;
      if (!root) return;

      root.style.padding = "18px";
      root.style.fontFamily = "system-ui, sans-serif";
      root.style.color = "inherit";

      const heading = html(win.document, "h2");
      heading.textContent = getString("inquiry-title");
      heading.style.margin = "0 0 6px";
      root.appendChild(heading);

      const hint = html(win.document, "p");
      hint.textContent = getString("inquiry-hint");
      hint.style.margin = "0 0 16px";
      hint.style.opacity = "0.72";
      root.appendChild(hint);

      root.appendChild(
        buildLanguageSection(
          win.document,
          getString("inquiry-english"),
          mail.enSubject,
          mail.enBody,
        ),
      );
      root.appendChild(
        buildLanguageSection(
          win.document,
          getString("inquiry-chinese"),
          mail.zhSubject,
          mail.zhBody,
        ),
      );

      const footer = html(win.document, "div");
      footer.style.display = "flex";
      footer.style.justifyContent = "flex-end";
      footer.style.marginTop = "14px";
      const close = html(win.document, "button", "st-btn") as HTMLButtonElement;
      close.textContent = getString("inquiry-close");
      close.addEventListener("click", () => win.close());
      footer.appendChild(close);
      root.appendChild(footer);

      try {
        const w = win as any;
        w.sizeToContent();
        w.innerWidth = Math.max(w.innerWidth, 720);
        if (w.innerHeight > 760) w.innerHeight = 760;
      } catch (e) {
        ztoolkit.log("submissiontracker: fit inquiry dialog failed", e);
      }
    },
    unloadCallback: () => {
      const dialogs = addon.data.dialogs;
      const idx = dialogs.indexOf(helper);
      if (idx >= 0) dialogs.splice(idx, 1);
    },
  });

  addon.data.dialogs.push(helper);
  helper.open(getString("inquiry-title"), {
    width: 720,
    centerscreen: true,
    resizable: true,
  });
}

function buildLanguageSection(
  doc: Document,
  label: string,
  subject: string,
  body: string,
): HTMLElement {
  const section = html(doc, "section");
  section.style.margin = "0 0 18px";

  const header = html(doc, "div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";
  header.style.marginBottom = "6px";

  const title = html(doc, "strong");
  title.textContent = label;

  const copy = html(doc, "button", "st-btn st-btn--sm") as HTMLButtonElement;
  copy.textContent = getString("inquiry-copy");
  copy.addEventListener("click", () => {
    copyText(`${subject}\n\n${body}`);
    copy.textContent = getString("inquiry-copied");
    doc.defaultView?.setTimeout(() => {
      copy.textContent = getString("inquiry-copy");
    }, 1400);
  });
  header.append(title, copy);

  const subjectInput = html(doc, "input") as HTMLInputElement;
  subjectInput.value = subject;
  subjectInput.readOnly = true;
  subjectInput.style.width = "100%";
  subjectInput.style.boxSizing = "border-box";
  subjectInput.style.marginBottom = "6px";
  subjectInput.style.padding = "6px 8px";

  const bodyArea = html(doc, "textarea") as HTMLTextAreaElement;
  bodyArea.value = body;
  bodyArea.readOnly = true;
  bodyArea.rows = 9;
  bodyArea.style.width = "100%";
  bodyArea.style.boxSizing = "border-box";
  bodyArea.style.padding = "8px";
  bodyArea.style.resize = "vertical";
  bodyArea.style.fontFamily = "inherit";
  bodyArea.style.lineHeight = "1.5";

  section.append(header, subjectInput, bodyArea);
  return section;
}

function copyText(text: string): void {
  try {
    const classes = Components.classes as any;
    const interfaces = Components.interfaces as any;
    const helper = classes["@mozilla.org/widget/clipboardhelper;1"].getService(
      interfaces.nsIClipboardHelper,
    );
    helper.copyString(text);
  } catch (e) {
    ztoolkit.log("submissiontracker: clipboard copy failed", e);
  }
}
