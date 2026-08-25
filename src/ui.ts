import { dashboardRows, presetLabel, timeline } from "./core/domain";
import { exportCSV } from "./core/csv";
import { localDateString } from "./core/date";
import { PRESET_STATUSES, StatusEvent, Submission, SystemProfile, ZoteroItemRef } from "./core/types";
import { createHTMLElement, h } from "./dom";
import { TrackerService } from "./service";
import { copyText, itemToRef, openURL, regularSelectedItem, resolveItem, selectItem } from "./zotero-adapter";
import { IOUtils, Services, Zotero } from "./runtime";

const f = (form: HTMLFormElement, name: string) => (new FormData(form).get(name) ?? "").toString().trim();

export class DashboardUI {
  private filters = { query:"", status:"", profile:"", follow:"", lifecycle:"active" };
  constructor(
    private win: Window,
    private service: TrackerService,
    private initialItem: ZoteroItemRef | null = null,
    private readonly doc: Document = win.document,
  ) {}
  lang(): "zh-CN" | "en-US" {
    if (this.service.settings.language !== "auto") return this.service.settings.language;
    return (Zotero.locale || "en-US").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  }
  t(zh: string, en: string) { return this.lang() === "zh-CN" ? zh : en; }

  async init() {
    await this.refreshTitles(); this.render();
    if (this.initialItem) this.showSubmissionForm(null, this.initialItem);
  }

  private async refreshTitles() {
    for (const submission of this.service.data.submissions) {
      const item = resolveItem(submission.zoteroItem);
      const title = item?.getField?.("title");
      if (title && title !== submission.zoteroItem.cachedTitle) await this.service.refreshCachedTitle(submission.zoteroItem, title);
    }
  }

  render() {
    const all = dashboardRows(this.service.data);
    const rows = all.filter(row => {
      const q = this.filters.query.toLowerCase();
      if (q && ![row.manuscriptTitle,row.manuscriptId,row.journalName].some(v => v.toLowerCase().includes(q))) return false;
      if (this.filters.status && row.currentStatus?.statusCode !== this.filters.status && row.currentStatus?.statusLabel !== this.filters.status) return false;
      if (this.filters.profile && row.systemProfileId !== this.filters.profile) return false;
      if (this.filters.follow && row.followUp !== this.filters.follow) return false;
      if (this.filters.lifecycle === "active" && (row.archived || row.finished)) return false;
      if (this.filters.lifecycle === "finished" && !row.archived && !row.finished) return false;
      return true;
    });
    const active = all.filter(r => !r.archived && !r.finished).length;
    const revision = all.filter(r => r.currentStatus?.statusCode === "revision-requested").length;
    const overdue = all.filter(r => r.followUp === "overdue" && !r.archived).length;
    const soon = all.filter(r => ["today","soon"].includes(r.followUp) && !r.archived).length;
    const profiles = this.service.data.systemProfiles;
    const app = this.doc.getElementById("app");
    if (!app) throw new Error("The dashboard application container is unavailable.");

    // Build dashboard using explicit DOM methods to avoid innerHTML/namespace issues
    app.replaceChildren(); // clear

    // Header
    const header = this.doc.createElement("header");
    const h1 = this.doc.createElement("h1");
    h1.textContent = this.t("投稿追踪", "Submission Tracker");
    header.appendChild(h1);

    const btnProfiles = this.doc.createElement("button");
    btnProfiles.id = "profiles";
    btnProfiles.textContent = this.t("投稿系统", "Systems");
    header.appendChild(btnProfiles);

    const btnSettings = this.doc.createElement("button");
    btnSettings.id = "settings";
    btnSettings.textContent = this.t("设置与备份", "Settings & backups");
    header.appendChild(btnSettings);

    const btnNew = this.doc.createElement("button");
    btnNew.id = "new";
    btnNew.className = "primary";
    btnNew.textContent = "＋ " + this.t("新建投稿", "New submission");
    header.appendChild(btnNew);

    app.appendChild(header);

    // Stats cards
    const cardsSection = this.doc.createElement("section");
    cardsSection.className = "cards";
    const stats: [number, string, string][] = [
      [all.length, "投稿总数", "Total"],
      [active, "处理中", "Active"],
      [revision, "等待返修", "Revision"],
      [overdue, "逾期跟进", "Overdue"],
      [soon, "7天内跟进", "Due in 7 days"]
    ];
    for (const [val, zh, en] of stats) {
      const card = this.doc.createElement("div");
      card.className = "card";
      const strong = this.doc.createElement("strong");
      strong.textContent = String(val);
      card.appendChild(strong);
      card.appendChild(this.doc.createTextNode(String(this.t(zh, en))));
      cardsSection.appendChild(card);
    }
    app.appendChild(cardsSection);

    // Filters
    const filtersSection = this.doc.createElement("section");
    filtersSection.className = "filters";

    const inputQ = this.doc.createElement("input");
    inputQ.id = "q";
    inputQ.value = this.filters.query;
    inputQ.placeholder = this.t("搜索标题、稿件编号、期刊", "Search title, ID, journal");
    filtersSection.appendChild(inputQ);

    const selStatus = this.doc.createElement("select");
    selStatus.id = "status";
    const optAllStatus = this.doc.createElement("option");
    optAllStatus.value = "";
    optAllStatus.textContent = this.t("全部状态", "All statuses");
    selStatus.appendChild(optAllStatus);
    for (const s of PRESET_STATUSES) {
      const opt = this.doc.createElement("option");
      opt.value = s[0];
      if (this.filters.status === s[0]) opt.selected = true;
      opt.textContent = presetLabel(s[0], this.lang());
      selStatus.appendChild(opt);
    }
    filtersSection.appendChild(selStatus);

    const selProfile = this.doc.createElement("select");
    selProfile.id = "profile";
    const optAllProfile = this.doc.createElement("option");
    optAllProfile.value = "";
    optAllProfile.textContent = this.t("全部投稿系统", "All systems");
    selProfile.appendChild(optAllProfile);
    for (const p of profiles) {
      const opt = this.doc.createElement("option");
      opt.value = p.id;
      if (this.filters.profile === p.id) opt.selected = true;
      opt.textContent = p.displayName;
      selProfile.appendChild(opt);
    }
    filtersSection.appendChild(selProfile);

    const selFollow = this.doc.createElement("select");
    selFollow.id = "follow";
    const followOptions = [
      ["", "全部跟进", "All follow-ups"],
      ["overdue", "已逾期", "Overdue"],
      ["today", "今天", "Today"],
      ["soon", "未来7天", "Next 7 days"],
      ["none", "无跟进日期", "No date"]
    ];
    for (const [val, zh, en] of followOptions) {
      const opt = this.doc.createElement("option");
      opt.value = val;
      if (this.filters.follow === val) opt.selected = true;
      opt.textContent = this.t(zh, en);
      selFollow.appendChild(opt);
    }
    filtersSection.appendChild(selFollow);

    const selLifecycle = this.doc.createElement("select");
    selLifecycle.id = "lifecycle";
    const lifecycleOptions = [
      ["active", "进行中", "Active"],
      ["finished", "已结束", "Finished"],
      ["all", "全部", "All"]
    ];
    for (const [val, zh, en] of lifecycleOptions) {
      const opt = this.doc.createElement("option");
      opt.value = val;
      if (this.filters.lifecycle === val) opt.selected = true;
      opt.textContent = this.t(zh, en);
      selLifecycle.appendChild(opt);
    }
    filtersSection.appendChild(selLifecycle);

    app.appendChild(filtersSection);

    // Table wrap
    const tableWrap = this.doc.createElement("div");
    tableWrap.className = "table-wrap";
    if (rows.length) {
      const table = this.doc.createElement("table");
      const thead = this.doc.createElement("thead");
      const trHead = this.doc.createElement("tr");
      const headers = [
        ["论文", "Paper"],
        ["期刊", "Journal"],
        ["稿件编号", "Manuscript ID"],
        ["当前状态", "Current status"],
        ["状态日期", "Status date"],
        ["持续天数", "Days"],
        ["投稿日期", "Submitted"],
        ["下一次跟进", "Next follow-up"],
        ["投稿系统", "System"],
        ["操作", "Actions"]
      ];
      for (const [zh, en] of headers) {
        const th = this.doc.createElement("th");
        th.textContent = this.t(zh, en);
        trHead.appendChild(th);
      }
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = this.doc.createElement("tbody");
      for (const row of rows) {
        tbody.appendChild(this.createRowElement(row));
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    } else {
      const empty = this.doc.createElement("div");
      empty.className = "empty";
      empty.textContent = this.t("还没有符合条件的投稿记录。", "No matching submissions.");
      tableWrap.appendChild(empty);
    }
    app.appendChild(tableWrap);

    // Verify #q exists
    const qCheck = app.querySelector("#q");
    if (!qCheck) {
      Zotero.debug("Submission Tracker DEBUG: #q still missing after DOM build. app.children=" + app.children.length);
      const globalQ = this.doc.querySelector("#q");
      Zotero.debug("Submission Tracker DEBUG: global #q=" + (globalQ ? "found" : "missing"));
    }
    this.bind(app);
  }

  private createRowElement(row: ReturnType<typeof dashboardRows>[number]): HTMLTableRowElement {
    const unavailable = !resolveItem(row.zoteroItem);
    const tr = this.doc.createElement("tr");
    tr.className = row.followUp;
    tr.dataset.id = row.id;

    // Cell 0: Paper title with jump button
    const td0 = this.doc.createElement("td");
    const btnJump = this.doc.createElement("button");
    btnJump.dataset.act = "jump";
    btnJump.title = unavailable ? this.t("关联文献不可用", "Linked item unavailable") : this.t("定位文献", "Show item");
    btnJump.textContent = row.manuscriptTitle;
    td0.appendChild(btnJump);
    if (unavailable) {
      const badge = this.doc.createElement("span");
      badge.className = "badge overdue";
      badge.textContent = this.t("失联", "Unavailable");
      td0.appendChild(badge);
    }
    tr.appendChild(td0);

    // Cell 1: Journal
    const td1 = this.doc.createElement("td");
    td1.textContent = row.journalName;
    tr.appendChild(td1);

    // Cell 2: Manuscript ID
    const td2 = this.doc.createElement("td");
    td2.textContent = row.manuscriptId || "—";
    tr.appendChild(td2);

    // Cell 3: Current status
    const td3 = this.doc.createElement("td");
    td3.textContent = row.currentStatus?.statusLabel || "—";
    tr.appendChild(td3);

    // Cell 4: Status date
    const td4 = this.doc.createElement("td");
    td4.textContent = row.currentStatus?.effectiveDate || "—";
    tr.appendChild(td4);

    // Cell 5: Days
    const td5 = this.doc.createElement("td");
    td5.textContent = row.durationDays != null ? String(row.durationDays) : "—";
    tr.appendChild(td5);

    // Cell 6: Submission date
    const td6 = this.doc.createElement("td");
    td6.textContent = row.submissionDate;
    tr.appendChild(td6);

    // Cell 7: Next follow-up
    const td7 = this.doc.createElement("td");
    const badgeFollow = this.doc.createElement("span");
    badgeFollow.className = "badge " + row.followUp;
    badgeFollow.textContent = row.nextFollowUpDate || this.t("暂无安排", "None");
    td7.appendChild(badgeFollow);
    tr.appendChild(td7);

    // Cell 8: System
    const td8 = this.doc.createElement("td");
    if (row.profile) {
      const btnOpen = this.doc.createElement("button");
      btnOpen.dataset.act = "open";
      btnOpen.textContent = this.t("打开系统", "Open");
      td8.appendChild(btnOpen);
    } else {
      td8.textContent = "—";
    }
    tr.appendChild(td8);

    // Cell 9: Actions
    const td9 = this.doc.createElement("td");
    td9.className = "actions";
    const actions = [
      ["detail", "详情", "Details"],
      ["status", "更新状态", "Status"],
      ["edit", "编辑", "Edit"],
      ["archive", row.archived ? this.t("恢复", "Restore") : this.t("归档", "Archive")]
    ];
    for (const [act, zh, en] of actions) {
      const btn = this.doc.createElement("button");
      btn.dataset.act = act;
      btn.textContent = this.t(zh, en);
      td9.appendChild(btn);
    }
    tr.appendChild(td9);

    return tr;
  }

  private bind(root: HTMLElement) {
    const required = <T extends Element>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`Dashboard element is missing after render: ${selector}`);
      return element;
    };
    const update = (key: keyof typeof this.filters, value: string) => { this.filters[key]=value; this.render(); };
    required<HTMLInputElement>("#q").addEventListener("input", e => update("query",(e.target as HTMLInputElement).value));
    for (const id of ["status","profile","follow","lifecycle"] as const) required<HTMLSelectElement>(`#${id}`).addEventListener("change",e=>update(id,(e.target as HTMLSelectElement).value));
    required<HTMLButtonElement>("#new").addEventListener("click",()=>this.showItemChooser());
    required<HTMLButtonElement>("#profiles").addEventListener("click",()=>this.showProfiles());
    required<HTMLButtonElement>("#settings").addEventListener("click",()=>this.showSettings());
    root.querySelectorAll("tr[data-id]").forEach(tr=>tr.addEventListener("click",e=>this.handleRow((tr as HTMLElement).dataset.id!, (e.target as HTMLElement).closest("button")?.dataset.act)));
  }

  private async handleRow(id: string, act?: string) {
    if (!act) return; const submission=this.service.data.submissions.find(s=>s.id===id)!;
    if (act==="jump") { if (!(await selectItem(submission.zoteroItem))) this.alert(this.t("关联文献不可用，请在编辑记录时重新关联。","Linked item is unavailable. Relink it while editing.")); }
    if (act==="detail") this.showDetails(submission);
    if (act==="status") this.showStatusForm(submission);
    if (act==="edit") this.showSubmissionForm(submission, submission.zoteroItem);
    if (act==="archive") { await this.service.updateSubmission(id,{archived:!submission.archived}); this.render(); }
    if (act==="open") { const p=this.service.data.systemProfiles.find(p=>p.id===submission.systemProfileId); if(p){ if(this.service.settings.copyUsernameOnOpen&&p.username) await copyText(p.username); openURL(p.loginUrl); } }
  }

  /**
   * Create a `<dialog>` and hand it to the builder. Every child node is
   * created with `createElementNS(HTML, ...)` so that all buttons, labels
   * and form controls render correctly inside a Zotero chrome document.
   */
  private dialog(title: string, build: (d: HTMLDialogElement) => void): HTMLDialogElement {
    const d = createHTMLElement(this.doc, "dialog") as HTMLDialogElement;
    const h2 = createHTMLElement(this.doc, "h2");
    h2.textContent = title;
    d.appendChild(h2);
    build(d);
    this.doc.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return d;
  }

  private alert(message:string){
    this.dialog(this.t("提示","Notice"), (d) => {
      d.appendChild(h(this.doc, "p", null, message));
      d.appendChild(h(this.doc, "div", { class: "dialog-actions" }, [
        h(this.doc, "button", {
          class: "primary",
          onClick: () => d.close(),
        }, "OK")
      ]));
    });
  }

  /**
   * Build an ISO-date text input wrapped in a `<label>` that also carries
   * the human-readable field name and a tiny format hint.
   *
   * Firefox's native `<input type="date">` picker is a popup that fails to
   * open inside a Zotero chrome iframe (the chrome privileged window does
   * not surface the date picker at all). Falling back to a plain text
   * field with the `yyyy-mm-dd` hint is the reliable fix: the user types
   * the date directly, and we still use HTML5's `pattern` for in-form
   * validation.
   */
  private dateField(labelText: string, name: string, value: string, required: boolean): HTMLElement {
    const wrapper = createHTMLElement(this.doc, "label");
    wrapper.className = "date-field";
    const text = createHTMLElement(this.doc, "span");
    text.textContent = labelText;
    wrapper.appendChild(text);
    const input = createHTMLElement(this.doc, "input");
    input.type = "text";
    input.name = name;
    input.placeholder = "yyyy-mm-dd";
    input.setAttribute("pattern", "\\d{4}-\\d{2}-\\d{2}");
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    if (required) input.required = true;
    input.value = value ?? "";
    wrapper.appendChild(input);
    const hint = createHTMLElement(this.doc, "small");
    hint.className = "muted date-hint";
    hint.textContent = this.t("格式 yyyy-mm-dd；可留空", "Format yyyy-mm-dd; may be left blank.");
    wrapper.appendChild(hint);
    return wrapper;
  }

  private showItemChooser(){
    const item=regularSelectedItem(Services.wm.getMostRecentWindow("navigator:browser"));
    if(item) this.showSubmissionForm(null,itemToRef(item));
    else this.alert(this.t("请先在 Zotero 主窗口选择一篇普通文献，再点击新建投稿。","Select one regular item in the Zotero library, then choose New submission."));
  }

  createForItem(ref: ZoteroItemRef) { this.showSubmissionForm(null, ref); }

  private showSubmissionForm(existing:Submission|null, ref:ZoteroItemRef){
    let workingRef = ref;
    const profiles=this.service.data.systemProfiles.filter(p=>!p.archived||p.id===existing?.systemProfileId);
    const today=localDateString();
    this.dialog(existing?this.t("编辑投稿","Edit submission"):this.t("创建投稿记录","Create submission"),(d)=>{
      const form = h(this.doc, "form", { class: "form-grid" });

      // Linked Zotero item
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("关联的 Zotero 文献","Linked Zotero item"),
        h(this.doc, "span", { class: "inline" }, [
          h(this.doc, "input", { "data-linked": "", value: ref.cachedTitle, disabled: true }),
          ...(existing ? [h(this.doc, "button", {
            type: "button",
            onClick: () => {
              const item=regularSelectedItem(Services.wm.getMostRecentWindow("navigator:browser"));
              if(!item) return this.alert(this.t("请先在 Zotero 主窗口选择一篇普通文献。","Select one regular item in the Zotero library."));
              workingRef=itemToRef(item);
              (form.querySelector("[data-linked]") as HTMLInputElement).value = workingRef.cachedTitle;
            }
          }, this.t("重新关联当前所选文献","Relink selected item"))] : [])
        ])
      ]));

      // Manuscript title
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("本次投稿标题","Manuscript title"),
        h(this.doc, "input", { name: "title", required: true, value: existing?.manuscriptTitle ?? ref.cachedTitle })
      ]));

      // Journal
      form.appendChild(h(this.doc, "label", null, [
        this.t("期刊名称","Journal"),
        h(this.doc, "input", { name: "journal", required: true, value: existing?.journalName ?? "" })
      ]));

      // System profile
      form.appendChild(h(this.doc, "label", null, [
        this.t("投稿系统配置","System profile"),
        h(this.doc, "select", { name: "profile" }, [
          h(this.doc, "option", { value: "" }, "—"),
          ...profiles.map(p => h(this.doc, "option", { value: p.id, selected: p.id === existing?.systemProfileId }, p.displayName))
        ])
      ]));

      // Manuscript ID
      form.appendChild(h(this.doc, "label", null, [
        this.t("稿件编号","Manuscript ID"),
        h(this.doc, "input", { name: "manuscriptId", value: existing?.manuscriptId ?? "" })
      ]));

      // Submission date
      form.appendChild(this.dateField(this.t("投稿日期","Submission date"), "submissionDate", existing?.submissionDate ?? today, true));

      if (!existing) {
        form.appendChild(h(this.doc, "label", null, [
          this.t("初始状态","Initial status"),
          h(this.doc, "select", { name: "initialStatus" },
            PRESET_STATUSES.map(s => h(this.doc, "option", { value: s[0] }, presetLabel(s[0], this.lang())))
          )
        ]));
        form.appendChild(this.dateField(this.t("初始状态日期","Initial status date"), "initialDate", today, true));
      }

      // Next follow-up
      form.appendChild(this.dateField(this.t("下一次跟进日期","Next follow-up"), "follow", existing?.nextFollowUpDate ?? "", false));

      // Notes
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("备注","Notes"),
        h(this.doc, "textarea", { name: "notes", rows: 3 }, existing?.notes ?? "")
      ]));

      // Dialog actions (Cancel + Save)
      const save = async () => {
        const submissionDate = f(form, "submissionDate");
        if (!submissionDate) return this.alert(this.t("请填写投稿日期（yyyy-mm-dd）。", "Please enter a submission date (yyyy-mm-dd)."));
        if (!f(form, "title")) return this.alert(this.t("请填写投稿标题。", "Please enter a manuscript title."));
        if (!f(form, "journal")) return this.alert(this.t("请填写期刊名称。", "Please enter the journal name."));
        const isoDay = /^\d{4}-\d{2}-\d{2}$/;
        if (!isoDay.test(submissionDate)) return this.alert(this.t("投稿日期格式应为 yyyy-mm-dd。", "Submission date must be yyyy-mm-dd."));
        if (existing) {
          await this.service.updateSubmission(existing.id, {
            zoteroItem: workingRef,
            manuscriptTitle: f(form, "title"),
            journalName: f(form, "journal"),
            systemProfileId: f(form, "profile") || null,
            manuscriptId: f(form, "manuscriptId"),
            submissionDate,
            nextFollowUpDate: f(form, "follow") || null,
            notes: f(form, "notes"),
          });
        } else {
          const initialDate = f(form, "initialDate") || today;
          if (!isoDay.test(initialDate)) return this.alert(this.t("初始状态日期格式应为 yyyy-mm-dd。", "Initial status date must be yyyy-mm-dd."));
          await this.service.createSubmission({
            zoteroItem: workingRef,
            manuscriptTitle: f(form, "title"),
            journalName: f(form, "journal"),
            systemProfileId: f(form, "profile") || null,
            manuscriptId: f(form, "manuscriptId"),
            submissionDate,
            nextFollowUpDate: f(form, "follow") || null,
            notes: f(form, "notes"),
            initialStatusCode: f(form, "initialStatus"),
            initialStatusDate: initialDate,
          });
        }
        d.close();
        this.render();
      };
      form.appendChild(h(this.doc, "div", { class: "dialog-actions span2" }, [
        h(this.doc, "button", {
          type: "button",
          onClick: () => d.close(),
        }, this.t("取消","Cancel")),
        h(this.doc, "button", {
          class: "primary",
          type: "button",
          onClick: () => { void save(); },
        }, this.t("保存","Save"))
      ]));

      // Enter inside a text input still triggers the form submit event,
      // which we catch as a backup to the explicit Save click handler.
      form.addEventListener("submit", (e) => { e.preventDefault(); void save(); });

      d.appendChild(form);
    });
  }

  private showStatusForm(submission:Submission,event?:StatusEvent){
    this.dialog(event?this.t("编辑状态","Edit status"):this.t("更新状态","Update status"),(d)=>{
      const form = h(this.doc, "form", { class: "form-grid" });

      form.appendChild(h(this.doc, "label", null, [
        this.t("预设状态","Preset status"),
        h(this.doc, "select", { name: "code" }, [
          h(this.doc, "option", { value: "" }, this.t("自定义","Custom")),
          ...PRESET_STATUSES.map(s => h(this.doc, "option", { value: s[0], selected: event?.statusCode === s[0] }, presetLabel(s[0], this.lang())))
        ])
      ]));
      form.appendChild(h(this.doc, "label", null, [
        this.t("自定义状态名称","Custom label"),
        h(this.doc, "input", { name: "label", value: event?.statusType === "custom" ? event.statusLabel : "" })
      ]));
      form.appendChild(this.dateField(this.t("生效日期","Effective date"), "date", event?.effectiveDate ?? localDateString(), true));
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("备注","Notes"),
        h(this.doc, "textarea", { name: "notes" }, event?.notes ?? "")
      ]));

      const save = async () => {
        const code = f(form, "code");
        const labelText = code ? presetLabel(code, this.lang()) : f(form, "label");
        if (!labelText) return this.alert(this.t("请输入自定义状态名称。","Enter a custom status label."));
        const effectiveDate = f(form, "date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return this.alert(this.t("生效日期格式应为 yyyy-mm-dd。","Effective date must be yyyy-mm-dd."));
        const patch = {
          effectiveDate,
          statusType: (code ? "preset" : "custom") as "preset" | "custom",
          statusCode: code || null,
          statusLabel: labelText,
          notes: f(form, "notes"),
        };
        if (event) await this.service.updateStatus(event.id, patch);
        else await this.service.addStatus({ ...patch, submissionId: submission.id });
        d.close();
        this.render();
      };

      form.appendChild(h(this.doc, "div", { class: "dialog-actions span2" }, [
        h(this.doc, "button", {
          type: "button",
          onClick: () => d.close(),
        }, this.t("取消","Cancel")),
        h(this.doc, "button", {
          class: "primary",
          type: "button",
          onClick: () => { void save(); },
        }, this.t("保存","Save"))
      ]));
      form.addEventListener("submit", (e) => { e.preventDefault(); void save(); });

      d.appendChild(form);
    });
  }

  private showDetails(submission:Submission){
    const events=timeline(this.service.data.statusEvents.filter(e=>e.submissionId===submission.id));
    const profile=this.service.data.systemProfiles.find(p=>p.id===submission.systemProfileId);
    this.dialog(submission.manuscriptTitle,(d)=>{
      d.appendChild(h(this.doc, "p", null, [
        h(this.doc, "b", null, this.t("期刊","Journal") + ": "),
        submission.journalName,
        "　",
        h(this.doc, "b", null, this.t("稿件编号","ID") + ": "),
        submission.manuscriptId || "—"
      ]));
      if (profile) {
        d.appendChild(h(this.doc, "p", null, [
          h(this.doc, "b", null, this.t("投稿系统","System") + ": "),
          profile.displayName + " ",
          h(this.doc, "button", {
            id: "copy-user",
            onClick: () => copyText(profile.username),
          }, this.t("复制用户名","Copy username"))
        ]));
      }
      d.appendChild(h(this.doc, "h3", null, this.t("状态时间线","Status timeline")));
      const list = h(this.doc, "ol", { class: "timeline" });
      for (const e of events) {
        const li = h(this.doc, "li", { dataset: { event: e.id } }, [
          h(this.doc, "b", null, `${e.effectiveDate}　${e.statusLabel}`),
          h(this.doc, "br"),
          h(this.doc, "small", null, e.notes),
          h(this.doc, "br"),
          h(this.doc, "button", {
            onClick: () => { d.close(); this.showStatusForm(submission, e); },
          }, this.t("编辑","Edit")),
          " ",
          h(this.doc, "button", {
            class: "danger",
            onClick: async () => {
              if (!this.win.confirm(this.t("确定删除这条状态事件？","Delete this status event?"))) return;
              try { await this.service.deleteStatus(e.id); d.close(); this.render(); }
              catch (err) { this.alert(String(err)); }
            },
          }, this.t("删除","Delete"))
        ]);
        list.appendChild(li);
      }
      d.appendChild(list);

      d.appendChild(h(this.doc, "div", { class: "dialog-actions" }, [
        h(this.doc, "button", {
          class: "primary",
          onClick: () => d.close(),
        }, this.t("关闭","Close"))
      ]));
    });
  }

  private showProfiles(){
    this.dialog(this.t("投稿系统配置","Submission systems"),(d)=>{
      const list = h(this.doc, "div", { id: "profile-list" });
      const profiles = this.service.data.systemProfiles;
      if (!profiles.length) {
        list.appendChild(h(this.doc, "p", { class: "muted" }, this.t("尚无配置","No profiles")));
      } else {
        for (const p of profiles) {
          list.appendChild(h(this.doc, "p", null, [
            h(this.doc, "b", null, p.displayName),
            " · " + p.platformName,
            p.archived ? " " + h(this.doc, "span", { class: "muted" }, "(" + this.t("已归档","Archived") + ")") : null,
            h(this.doc, "br"),
            h(this.doc, "small", null, `${p.loginUrl} · ${p.username}`),
            h(this.doc, "br"),
            h(this.doc, "button", {
              onClick: () => { d.close(); this.profileForm(p); },
            }, this.t("编辑","Edit")),
            !p.archived ? " " + h(this.doc, "button", {
              onClick: async () => { await this.service.archiveProfile(p.id); d.close(); this.render(); this.showProfiles(); },
            }, this.t("归档","Archive")) : null
          ]));
        }
      }
      d.appendChild(list);

      d.appendChild(h(this.doc, "div", { class: "dialog-actions" }, [
        h(this.doc, "button", {
          onClick: () => { d.close(); this.profileForm(); },
        }, this.t("新建配置","New profile")),
        h(this.doc, "button", {
          class: "primary",
          onClick: () => d.close(),
        }, this.t("关闭","Close"))
      ]));
    });
  }

  private profileForm(p?:SystemProfile){
    this.dialog(p?this.t("编辑投稿系统","Edit system"):this.t("新建投稿系统","New system"),(d)=>{
      const form = h(this.doc, "form", { class: "form-grid" });

      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("配置名称","Display name"),
        h(this.doc, "input", { required: true, name: "display", value: p?.displayName ?? "" })
      ]));
      form.appendChild(h(this.doc, "label", null, [
        this.t("期刊名称","Journal"),
        h(this.doc, "input", { required: true, name: "journal", value: p?.journalName ?? "" })
      ]));
      form.appendChild(h(this.doc, "label", null, [
        this.t("平台名称","Platform"),
        h(this.doc, "input", { required: true, name: "platform", value: p?.platformName ?? "" })
      ]));
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("登录地址","Login URL"),
        h(this.doc, "input", { type: "url", required: true, name: "url", value: p?.loginUrl ?? "" })
      ]));
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("用户名或登录邮箱","Username or email"),
        h(this.doc, "input", { name: "username", value: p?.username ?? "" })
      ]));
      form.appendChild(h(this.doc, "label", { class: "span2" }, [
        this.t("备注","Notes"),
        h(this.doc, "textarea", { name: "notes" }, p?.notes ?? "")
      ]));
      form.appendChild(h(this.doc, "p", { class: "span2 muted" }, this.t("本插件不保存密码。请使用浏览器或密码管理器。","This plugin never stores passwords. Use your browser or a password manager.")));

      const save = async () => {
        if (!f(form, "display")) return this.alert(this.t("请填写配置名称。","Please enter a display name."));
        if (!f(form, "journal")) return this.alert(this.t("请填写期刊名称。","Please enter the journal name."));
        if (!f(form, "platform")) return this.alert(this.t("请填写平台名称。","Please enter the platform name."));
        if (!f(form, "url")) return this.alert(this.t("请填写登录地址。","Please enter the login URL."));
        await this.service.saveProfile({
          ...(p ? { id: p.id } : {}),
          displayName: f(form, "display"),
          journalName: f(form, "journal"),
          platformName: f(form, "platform"),
          loginUrl: f(form, "url"),
          username: f(form, "username"),
          notes: f(form, "notes"),
          archived: p?.archived ?? false,
        });
        d.close();
        this.render();
        this.showProfiles();
      };

      form.appendChild(h(this.doc, "div", { class: "dialog-actions span2" }, [
        h(this.doc, "button", { type: "button", onClick: () => d.close() }, this.t("取消","Cancel")),
        h(this.doc, "button", {
          class: "primary",
          type: "button",
          onClick: () => { void save(); },
        }, this.t("保存","Save"))
      ]));
      form.addEventListener("submit", (e) => { e.preventDefault(); void save(); });

      d.appendChild(form);
    });
  }

  private showSettings(){
    const s = this.service.settings;
    this.dialog(this.t("设置与备份","Settings & backups"), (d) => {
      // Language
      d.appendChild(h(this.doc, "label", null, [
        this.t("语言","Language"),
        h(this.doc, "select", {
          name: "language",
          onChange: async (e) => {
            this.service.settings.language = (e.target as HTMLSelectElement).value as "auto" | "zh-CN" | "en-US";
            await this.service.store.saveSettings(this.service.settings);
            d.close();
            this.render();
          },
        }, [
          h(this.doc, "option", { value: "auto", selected: s.language === "auto" }, this.t("跟随 Zotero","Follow Zotero")),
          h(this.doc, "option", { value: "zh-CN", selected: s.language === "zh-CN" }, "简体中文"),
          h(this.doc, "option", { value: "en-US", selected: s.language === "en-US" }, "English")
        ])
      ]));
      // Copy username
      d.appendChild(h(this.doc, "label", null, [
        h(this.doc, "span", null, [
          h(this.doc, "input", {
            type: "checkbox",
            name: "copy",
            checked: s.copyUsernameOnOpen,
            onChange: async (e) => {
              this.service.settings.copyUsernameOnOpen = (e.target as HTMLInputElement).checked;
              await this.service.store.saveSettings(this.service.settings);
            },
          }),
          " " + this.t("打开投稿系统时同时复制用户名","Copy username when opening a system")
        ])
      ]));
      d.appendChild(h(this.doc, "hr"));
      d.appendChild(h(this.doc, "p", null, this.t("完整 JSON 备份包含用户名和登录地址，但不包含任何密码。","A full JSON backup includes usernames and login addresses, but no passwords.")));
      d.appendChild(h(this.doc, "div", { class: "actions" }, [
        h(this.doc, "button", {
          onClick: () => this.exportFile("submission-tracker-backup.json", this.service.store.exportBackup(this.service.data)),
        }, this.t("导出完整 JSON","Export full JSON")),
        h(this.doc, "button", {
          onClick: () => this.restoreFile(d),
        }, this.t("恢复 JSON","Restore JSON")),
        h(this.doc, "button", {
          onClick: () => this.exportFile("submission-tracker.csv", Promise.resolve(exportCSV(this.service.data))),
        }, this.t("导出 CSV","Export CSV"))
      ]));
      d.appendChild(h(this.doc, "hr"));
      d.appendChild(h(this.doc, "button", {
        class: "danger",
        onClick: async () => {
          if (!this.win.confirm(this.t("请先备份。确定删除全部投稿数据？此操作会保留一份 .bak。","Back up first. Delete all submission data? A .bak copy will be retained."))) return;
          if (!this.win.confirm(this.t("再次确认：删除全部本地投稿数据。","Confirm again: delete all local submission data."))) return;
          await this.service.store.clear();
          await this.service.init();
          d.close();
          this.render();
        },
      }, this.t("删除全部本地投稿数据","Delete all local data")));
      // Explicit Cancel + Close buttons
      d.appendChild(h(this.doc, "div", { class: "dialog-actions" }, [
        h(this.doc, "button", {
          onClick: () => d.close(),
        }, this.t("取消","Cancel")),
        h(this.doc, "button", {
          class: "primary",
          onClick: () => d.close(),
        }, this.t("关闭","Close"))
      ]));
    });
  }

  private async picker(mode:"open"|"save",name?:string){const fp=new Zotero.FilePicker();await fp.init(this.win,this.t(mode==="open"?"选择备份文件":"选择保存位置",mode==="open"?"Choose backup":"Choose save location"),mode==="open"?fp.modeOpen:fp.modeSave);fp.appendFilter(mode==="open"?"JSON":"JSON / CSV",mode==="open"?"*.json":"*.json;*.csv");if(name)fp.defaultString=name;const result=await fp.show();return result===fp.returnCancel?null:fp.file.path;}
  private async exportFile(name:string,content:Promise<string>){const path=await this.picker("save",name);if(!path)return;await IOUtils.writeUTF8(path,await content);this.alert(this.t("导出完成。","Export complete."));}
  private async restoreFile(dialog:HTMLDialogElement){const path=await this.picker("open");if(!path)return;try{const raw=await IOUtils.readUTF8(path);const parsed=JSON.parse(raw);const summary=this.t(`将恢复 ${parsed.systemProfiles?.length??0} 个系统配置、${parsed.submissions?.length??0} 条投稿、${parsed.statusEvents?.length??0} 条状态事件。继续？`,`Restore ${parsed.systemProfiles?.length??0} systems, ${parsed.submissions?.length??0} submissions and ${parsed.statusEvents?.length??0} status events. Continue?`);if(!this.win.confirm(summary))return;await this.service.store.restore(raw);await this.service.init();dialog.close();this.render();this.alert(this.t("恢复完成。","Restore complete."));}catch(error){this.alert(this.t("恢复失败：","Restore failed: ")+String(error));}}
}
