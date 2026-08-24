import { dashboardRows, presetLabel, timeline } from "./core/domain";
import { exportCSV } from "./core/csv";
import { localDateString } from "./core/date";
import { PRESET_STATUSES, StatusEvent, Submission, SystemProfile, ZoteroItemRef } from "./core/types";
import { TrackerService } from "./service";
import { copyText, itemToRef, openURL, regularSelectedItem, resolveItem, selectItem } from "./zotero-adapter";
import { IOUtils, Services, Zotero } from "./runtime";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const f = (form: HTMLFormElement, name: string) => (new FormData(form).get(name) ?? "").toString().trim();

export class DashboardUI {
  private filters = { query:"", status:"", profile:"", follow:"", lifecycle:"active" };
  constructor(private win: Window, private service: TrackerService, private initialItem: ZoteroItemRef | null = null) {}
  get doc() { return this.win.document; }
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
    this.doc.getElementById("app")!.innerHTML = `
      <header><h1>${this.t("投稿追踪","Submission Tracker")}</h1>
        <button id="profiles">${this.t("投稿系统","Systems")}</button><button id="settings">${this.t("设置与备份","Settings & backups")}</button>
        <button class="primary" id="new">＋ ${this.t("新建投稿","New submission")}</button></header>
      <section class="cards">${[[all.length,"投稿总数","Total"],[active,"处理中","Active"],[revision,"等待返修","Revision"],[overdue,"逾期跟进","Overdue"],[soon,"7天内跟进","Due in 7 days"]].map(c=>`<div class="card"><strong>${c[0]}</strong>${this.t(c[1] as string,c[2] as string)}</div>`).join("")}</section>
      <section class="filters"><input id="q" value="${esc(this.filters.query)}" placeholder="${this.t("搜索标题、稿件编号、期刊","Search title, ID, journal")}">
        <select id="status"><option value="">${this.t("全部状态","All statuses")}</option>${PRESET_STATUSES.map(s=>`<option value="${s[0]}" ${this.filters.status===s[0]?"selected":""}>${esc(presetLabel(s[0],this.lang()))}</option>`).join("")}</select>
        <select id="profile"><option value="">${this.t("全部投稿系统","All systems")}</option>${profiles.map(p=>`<option value="${p.id}" ${this.filters.profile===p.id?"selected":""}>${esc(p.displayName)}</option>`).join("")}</select>
        <select id="follow"><option value="" ${this.filters.follow===""?"selected":""}>${this.t("全部跟进","All follow-ups")}</option><option value="overdue" ${this.filters.follow==="overdue"?"selected":""}>${this.t("已逾期","Overdue")}</option><option value="today" ${this.filters.follow==="today"?"selected":""}>${this.t("今天","Today")}</option><option value="soon" ${this.filters.follow==="soon"?"selected":""}>${this.t("未来7天","Next 7 days")}</option><option value="none" ${this.filters.follow==="none"?"selected":""}>${this.t("无跟进日期","No date")}</option></select>
        <select id="lifecycle"><option value="active" ${this.filters.lifecycle==="active"?"selected":""}>${this.t("进行中","Active")}</option><option value="finished" ${this.filters.lifecycle==="finished"?"selected":""}>${this.t("已结束","Finished")}</option><option value="all" ${this.filters.lifecycle==="all"?"selected":""}>${this.t("全部","All")}</option></select></section>
      <div class="table-wrap">${rows.length ? `<table><thead><tr>${[["论文","Paper"],["期刊","Journal"],["稿件编号","Manuscript ID"],["当前状态","Current status"],["状态日期","Status date"],["持续天数","Days"],["投稿日期","Submitted"],["下一次跟进","Next follow-up"],["投稿系统","System"],["操作","Actions"]].map(x=>`<th>${this.t(x[0],x[1])}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>this.row(row)).join("")}</tbody></table>` : `<div class="empty">${this.t("还没有符合条件的投稿记录。","No matching submissions.")}</div>`}</div>`;
    this.bind();
  }

  private row(row: ReturnType<typeof dashboardRows>[number]) {
    const unavailable = !resolveItem(row.zoteroItem);
    return `<tr class="${row.followUp}" data-id="${row.id}"><td><button data-act="jump" title="${unavailable?this.t("关联文献不可用","Linked item unavailable"):this.t("定位文献","Show item")}">${esc(row.manuscriptTitle)}</button>${unavailable?` <span class="badge overdue">${this.t("失联","Unavailable")}</span>`:""}</td>
      <td>${esc(row.journalName)}</td><td>${esc(row.manuscriptId||"—")}</td><td>${esc(row.currentStatus?.statusLabel||"—")}</td><td>${esc(row.currentStatus?.effectiveDate||"—")}</td><td>${row.durationDays??"—"}</td><td>${esc(row.submissionDate)}</td>
      <td><span class="badge ${row.followUp}">${esc(row.nextFollowUpDate||this.t("暂无安排","None"))}</span></td><td>${row.profile?`<button data-act="open">${this.t("打开系统","Open")}</button>`:"—"}</td>
      <td class="actions"><button data-act="detail">${this.t("详情","Details")}</button><button data-act="status">${this.t("更新状态","Status")}</button><button data-act="edit">${this.t("编辑","Edit")}</button><button data-act="archive">${row.archived?this.t("恢复","Restore"):this.t("归档","Archive")}</button></td></tr>`;
  }

  private bind() {
    const update = (key: keyof typeof this.filters, value: string) => { this.filters[key]=value; this.render(); };
    this.doc.querySelector<HTMLInputElement>("#q")!.oninput = e => update("query",(e.target as HTMLInputElement).value);
    for (const id of ["status","profile","follow","lifecycle"] as const) this.doc.querySelector<HTMLSelectElement>(`#${id}`)!.onchange=e=>update(id,(e.target as HTMLSelectElement).value);
    this.doc.querySelector("#new")!.addEventListener("click",()=>this.showItemChooser());
    this.doc.querySelector("#profiles")!.addEventListener("click",()=>this.showProfiles());
    this.doc.querySelector("#settings")!.addEventListener("click",()=>this.showSettings());
    this.doc.querySelectorAll("tr[data-id]").forEach(tr=>tr.addEventListener("click",e=>this.handleRow((tr as HTMLElement).dataset.id!, (e.target as HTMLElement).closest("button")?.dataset.act)));
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

  private dialog(title: string, body: string) {
    const d=this.doc.createElement("dialog"); d.innerHTML=`<h2>${esc(title)}</h2>${body}`; this.doc.body.append(d); d.addEventListener("close",()=>d.remove()); d.showModal(); return d;
  }
  private alert(message:string){ const d=this.dialog(this.t("提示","Notice"),`<p>${esc(message)}</p><div class="dialog-actions"><button class="primary">OK</button></div>`); d.querySelector("button")!.onclick=()=>d.close(); }

  private showItemChooser(){
    const item=regularSelectedItem(Services.wm.getMostRecentWindow("navigator:browser"));
    if(item) this.showSubmissionForm(null,itemToRef(item));
    else this.alert(this.t("请先在 Zotero 主窗口选择一篇普通文献，再点击新建投稿。","Select one regular item in the Zotero library, then choose New submission."));
  }

  createForItem(ref: ZoteroItemRef) { this.showSubmissionForm(null, ref); }

  private showSubmissionForm(existing:Submission|null, ref:ZoteroItemRef){
    let workingRef = ref;
    const profiles=this.service.data.systemProfiles.filter(p=>!p.archived||p.id===existing?.systemProfileId); const today=localDateString();
    const d=this.dialog(existing?this.t("编辑投稿","Edit submission"):this.t("创建投稿记录","Create submission"),`<form class="form-grid">
      <label class="span2">${this.t("关联的 Zotero 文献","Linked Zotero item")}<span class="inline"><input data-linked value="${esc(ref.cachedTitle)}" disabled>${existing?`<button type="button" data-relink>${this.t("重新关联当前所选文献","Relink selected item")}</button>`:""}</span></label>
      <label class="span2">${this.t("本次投稿标题","Manuscript title")}<input name="title" required value="${esc(existing?.manuscriptTitle??ref.cachedTitle)}"></label>
      <label>${this.t("期刊名称","Journal")}<input name="journal" required value="${esc(existing?.journalName??"")}"></label>
      <label>${this.t("投稿系统配置","System profile")}<select name="profile"><option value="">—</option>${profiles.map(p=>`<option value="${p.id}" ${p.id===existing?.systemProfileId?"selected":""}>${esc(p.displayName)}</option>`).join("")}</select></label>
      <label>${this.t("稿件编号","Manuscript ID")}<input name="manuscriptId" value="${esc(existing?.manuscriptId??"")}"></label>
      <label>${this.t("投稿日期","Submission date")}<input type="date" name="submissionDate" required value="${esc(existing?.submissionDate??today)}"></label>
      ${existing?"":`<label>${this.t("初始状态","Initial status")}<select name="initialStatus">${PRESET_STATUSES.map(s=>`<option value="${s[0]}">${esc(presetLabel(s[0],this.lang()))}</option>`).join("")}</select></label><label>${this.t("初始状态日期","Initial status date")}<input type="date" name="initialDate" required value="${today}"></label>`}
      <label>${this.t("下一次跟进日期","Next follow-up")}<input type="date" name="follow" value="${esc(existing?.nextFollowUpDate??"")}"></label>
      <label class="span2">${this.t("备注","Notes")}<textarea name="notes" rows="3">${esc(existing?.notes??"")}</textarea></label>
      <div class="dialog-actions span2"><button type="button" data-close>${this.t("取消","Cancel")}</button><button class="primary">${this.t("保存","Save")}</button></div></form>`);
    d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close();
    const relink=d.querySelector<HTMLElement>("[data-relink]"); if(relink)relink.onclick=()=>{const item=regularSelectedItem(Services.wm.getMostRecentWindow("navigator:browser"));if(!item)return this.alert(this.t("请先在 Zotero 主窗口选择一篇普通文献。","Select one regular item in the Zotero library."));workingRef=itemToRef(item);d.querySelector<HTMLInputElement>("[data-linked]")!.value=workingRef.cachedTitle;};
    d.querySelector("form")!.onsubmit=async e=>{e.preventDefault();const form=e.target as HTMLFormElement;
      if(existing) await this.service.updateSubmission(existing.id,{zoteroItem:workingRef,manuscriptTitle:f(form,"title"),journalName:f(form,"journal"),systemProfileId:f(form,"profile")||null,manuscriptId:f(form,"manuscriptId"),submissionDate:f(form,"submissionDate"),nextFollowUpDate:f(form,"follow")||null,notes:f(form,"notes")});
      else await this.service.createSubmission({zoteroItem:workingRef,manuscriptTitle:f(form,"title"),journalName:f(form,"journal"),systemProfileId:f(form,"profile")||null,manuscriptId:f(form,"manuscriptId"),submissionDate:f(form,"submissionDate"),nextFollowUpDate:f(form,"follow")||null,notes:f(form,"notes"),initialStatusCode:f(form,"initialStatus"),initialStatusDate:f(form,"initialDate")});
      d.close();this.render();};
  }

  private showStatusForm(submission:Submission,event?:StatusEvent){
    const d=this.dialog(event?this.t("编辑状态","Edit status"):this.t("更新状态","Update status"),`<form class="form-grid"><label>${this.t("预设状态","Preset status")}<select name="code"><option value="">${this.t("自定义","Custom")}</option>${PRESET_STATUSES.map(s=>`<option value="${s[0]}" ${event?.statusCode===s[0]?"selected":""}>${esc(presetLabel(s[0],this.lang()))}</option>`).join("")}</select></label><label>${this.t("自定义状态名称","Custom label")}<input name="label" value="${esc(event?.statusType==="custom"?event.statusLabel:"")}"></label><label>${this.t("生效日期","Effective date")}<input type="date" name="date" required value="${event?.effectiveDate??localDateString()}"></label><label class="span2">${this.t("备注","Notes")}<textarea name="notes">${esc(event?.notes??"")}</textarea></label><div class="dialog-actions span2"><button type="button" data-close>${this.t("取消","Cancel")}</button><button class="primary">${this.t("保存","Save")}</button></div></form>`);
    d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close(); d.querySelector("form")!.onsubmit=async e=>{e.preventDefault();const form=e.target as HTMLFormElement,code=f(form,"code"),label=code?presetLabel(code,this.lang()):f(form,"label");if(!label)return this.alert(this.t("请输入自定义状态名称。","Enter a custom status label."));const patch={effectiveDate:f(form,"date"),statusType:(code?"preset":"custom") as "preset"|"custom",statusCode:code||null,statusLabel:label,notes:f(form,"notes")};if(event)await this.service.updateStatus(event.id,patch);else await this.service.addStatus({...patch,submissionId:submission.id});d.close();this.render();};
  }

  private showDetails(submission:Submission){
    const events=timeline(this.service.data.statusEvents.filter(e=>e.submissionId===submission.id)); const profile=this.service.data.systemProfiles.find(p=>p.id===submission.systemProfileId);
    const d=this.dialog(submission.manuscriptTitle,`<p><b>${this.t("期刊","Journal")}:</b> ${esc(submission.journalName)}　<b>${this.t("稿件编号","ID")}:</b> ${esc(submission.manuscriptId||"—")}</p>${profile?`<p><b>${this.t("投稿系统","System")}:</b> ${esc(profile.displayName)} <button id="copy-user">${this.t("复制用户名","Copy username")}</button></p>`:""}<h3>${this.t("状态时间线","Status timeline")}</h3><ol class="timeline">${events.map(e=>`<li data-event="${e.id}"><b>${esc(e.effectiveDate)}　${esc(e.statusLabel)}</b><br><small>${esc(e.notes)}</small><br><button data-edit>${this.t("编辑","Edit")}</button> <button class="danger" data-delete>${this.t("删除","Delete")}</button></li>`).join("")}</ol><div class="dialog-actions"><button class="primary" data-close>${this.t("关闭","Close")}</button></div>`);
    d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close(); if(profile)d.querySelector<HTMLElement>("#copy-user")!.onclick=()=>copyText(profile.username);
    d.querySelectorAll<HTMLElement>("li[data-event]").forEach(li=>{const event=events.find(e=>e.id===li.dataset.event)!;li.querySelector<HTMLElement>("[data-edit]")!.onclick=()=>{d.close();this.showStatusForm(submission,event)};li.querySelector<HTMLElement>("[data-delete]")!.onclick=async()=>{if(!this.win.confirm(this.t("确定删除这条状态事件？","Delete this status event?")))return;try{await this.service.deleteStatus(event.id);d.close();this.render();}catch(err){this.alert(String(err));}};});
  }

  private showProfiles(){
    const d=this.dialog(this.t("投稿系统配置","Submission systems"),`<div id="profile-list">${this.service.data.systemProfiles.map(p=>`<p><b>${esc(p.displayName)}</b> · ${esc(p.platformName)} ${p.archived?`<span class="muted">(${this.t("已归档","Archived")})</span>`:""}<br><small>${esc(p.loginUrl)} · ${esc(p.username)}</small><br><button data-edit="${p.id}">${this.t("编辑","Edit")}</button> ${!p.archived?`<button data-archive="${p.id}">${this.t("归档","Archive")}</button>`:""}</p>`).join("")||`<p class="muted">${this.t("尚无配置","No profiles")}</p>`}</div><div class="dialog-actions"><button data-new>${this.t("新建配置","New profile")}</button><button class="primary" data-close>${this.t("关闭","Close")}</button></div>`);
    d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close();d.querySelector<HTMLElement>("[data-new]")!.onclick=()=>{d.close();this.profileForm()};d.querySelectorAll<HTMLElement>("[data-edit]").forEach(b=>b.onclick=()=>{d.close();this.profileForm(this.service.data.systemProfiles.find(p=>p.id===b.dataset.edit))});d.querySelectorAll<HTMLElement>("[data-archive]").forEach(b=>b.onclick=async()=>{await this.service.archiveProfile(b.dataset.archive!);d.close();this.render();this.showProfiles()});
  }

  private profileForm(p?:SystemProfile){
    const d=this.dialog(p?this.t("编辑投稿系统","Edit system"):this.t("新建投稿系统","New system"),`<form class="form-grid"><label class="span2">${this.t("配置名称","Display name")}<input required name="display" value="${esc(p?.displayName??"")}"></label><label>${this.t("期刊名称","Journal")}<input required name="journal" value="${esc(p?.journalName??"")}"></label><label>${this.t("平台名称","Platform")}<input required name="platform" value="${esc(p?.platformName??"")}"></label><label class="span2">${this.t("登录地址","Login URL")}<input type="url" required name="url" value="${esc(p?.loginUrl??"")}"></label><label class="span2">${this.t("用户名或登录邮箱","Username or email")}<input name="username" value="${esc(p?.username??"")}"></label><label class="span2">${this.t("备注","Notes")}<textarea name="notes">${esc(p?.notes??"")}</textarea></label><p class="span2 muted">${this.t("本插件不保存密码。请使用浏览器或密码管理器。","This plugin never stores passwords. Use your browser or a password manager.")}</p><div class="dialog-actions span2"><button type="button" data-close>${this.t("取消","Cancel")}</button><button class="primary">${this.t("保存","Save")}</button></div></form>`);d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close();d.querySelector("form")!.onsubmit=async e=>{e.preventDefault();const form=e.target as HTMLFormElement;await this.service.saveProfile({...(p?{id:p.id}:{}),displayName:f(form,"display"),journalName:f(form,"journal"),platformName:f(form,"platform"),loginUrl:f(form,"url"),username:f(form,"username"),notes:f(form,"notes"),archived:p?.archived??false});d.close();this.render();this.showProfiles();};
  }

  private showSettings(){
    const s=this.service.settings;const d=this.dialog(this.t("设置与备份","Settings & backups"),`<form><label>${this.t("语言","Language")}<select name="language"><option value="auto" ${s.language==="auto"?"selected":""}>${this.t("跟随 Zotero","Follow Zotero")}</option><option value="zh-CN" ${s.language==="zh-CN"?"selected":""}>简体中文</option><option value="en-US" ${s.language==="en-US"?"selected":""}>English</option></select></label><label><span><input type="checkbox" name="copy" ${s.copyUsernameOnOpen?"checked":""}> ${this.t("打开投稿系统时同时复制用户名","Copy username when opening a system")}</span></label></form><hr><p>${this.t("完整 JSON 备份包含用户名和登录地址，但不包含任何密码。","A full JSON backup includes usernames and login addresses, but no passwords.")}</p><div class="actions"><button data-export-json>${this.t("导出完整 JSON","Export full JSON")}</button><button data-restore>${this.t("恢复 JSON","Restore JSON")}</button><button data-export-csv>${this.t("导出 CSV","Export CSV")}</button></div><hr><button class="danger" data-clear>${this.t("删除全部本地投稿数据","Delete all local data")}</button><div class="dialog-actions"><button class="primary" data-close>${this.t("关闭","Close")}</button></div>`);
    d.querySelector<HTMLSelectElement>("[name=language]")!.onchange=async e=>{this.service.settings.language=(e.target as HTMLSelectElement).value as any;await this.service.store.saveSettings(this.service.settings);d.close();this.render();};d.querySelector<HTMLInputElement>("[name=copy]")!.onchange=async e=>{this.service.settings.copyUsernameOnOpen=(e.target as HTMLInputElement).checked;await this.service.store.saveSettings(this.service.settings);};d.querySelector<HTMLElement>("[data-close]")!.onclick=()=>d.close();d.querySelector<HTMLElement>("[data-export-json]")!.onclick=()=>this.exportFile("submission-tracker-backup.json",this.service.store.exportBackup(this.service.data));d.querySelector<HTMLElement>("[data-export-csv]")!.onclick=()=>this.exportFile("submission-tracker.csv",Promise.resolve(exportCSV(this.service.data)));d.querySelector<HTMLElement>("[data-restore]")!.onclick=()=>this.restoreFile(d);d.querySelector<HTMLElement>("[data-clear]")!.onclick=async()=>{if(!this.win.confirm(this.t("请先备份。确定删除全部投稿数据？此操作会保留一份 .bak。","Back up first. Delete all submission data? A .bak copy will be retained."))||!this.win.confirm(this.t("再次确认：删除全部本地投稿数据。","Confirm again: delete all local submission data.")))return;await this.service.store.clear();await this.service.init();d.close();this.render();};
  }

  private async picker(mode:"open"|"save",name?:string){const fp=new Zotero.FilePicker();await fp.init(this.win,this.t(mode==="open"?"选择备份文件":"选择保存位置",mode==="open"?"Choose backup":"Choose save location"),mode==="open"?fp.modeOpen:fp.modeSave);fp.appendFilter(mode==="open"?"JSON":"JSON / CSV",mode==="open"?"*.json":"*.json;*.csv");if(name)fp.defaultString=name;const result=await fp.show();return result===fp.returnCancel?null:fp.file.path;}
  private async exportFile(name:string,content:Promise<string>){const path=await this.picker("save",name);if(!path)return;await IOUtils.writeUTF8(path,await content);this.alert(this.t("导出完成。","Export complete."));}
  private async restoreFile(dialog:HTMLDialogElement){const path=await this.picker("open");if(!path)return;try{const raw=await IOUtils.readUTF8(path);const parsed=JSON.parse(raw);const summary=this.t(`将恢复 ${parsed.systemProfiles?.length??0} 个系统配置、${parsed.submissions?.length??0} 条投稿、${parsed.statusEvents?.length??0} 条状态事件。继续？`,`Restore ${parsed.systemProfiles?.length??0} systems, ${parsed.submissions?.length??0} submissions and ${parsed.statusEvents?.length??0} status events. Continue?`);if(!this.win.confirm(summary))return;await this.service.store.restore(raw);await this.service.init();dialog.close();this.render();this.alert(this.t("恢复完成。","Restore complete."));}catch(error){this.alert(this.t("恢复失败：","Restore failed: ")+String(error));}}
}
