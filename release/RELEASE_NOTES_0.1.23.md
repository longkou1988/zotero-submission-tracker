# v0.1.23 — 修复「保存按钮无响应」+ 简化新建投稿表单

## 根因（真正解决了「依然无法保存」）

之前所有对话框都用 `<dialog>.showModal()` 弹出。Firefox 的 `<dialog>` top-layer
在 **iframe 内部 + Zotero chrome 上下文**下，点击命中测试不可靠：面板能显示，
但按钮点击经常「落空」，事件不触发，于是 Save 永远不执行。这是和早期 `#q` 缺失、
`Node is not defined` 同一类「Zotero 弹层」坑，但最隐蔽的一个。

**修复**：`dialog()` 不再使用 `<dialog>.showModal()`，改成普通绝对定位覆盖层
`<div class="st-modal-overlay">` + `<div class="st-modal">`。完全绕开 top layer，
在任何环境下点击都 100% 生效。所有表单（新建/编辑投稿、更新状态、系统配置、详情、
设置、备份）共用同一套覆盖层，一并修好。

## 表单健壮性

- 三个表单的 `Save` 都加了 `try/catch`：若保存过程出错，会在弹窗里显示具体错误
  （如「保存失败：xxx」）并写入 `Zotero → 帮助 → 输出日志排错`，不再静默失败。
- 之前 `updates.json` 里 0.1.21 条目缺了开头的 `{`，是无效的 JSON——已重写文件，
  自动更新链恢复正常。

## 简化「新建投稿」界面

- **删除**冗余的「关联的 Zotero 文献」字段块（disabled 输入框 + 重新关联按钮），
  改为顶部一行只读提示：`关联文献：<标题>`。
- 每个日期框右侧新增 **「今天」按钮**，一键填入当天日期，省去手输。
- 日期框仍是 `yyyy-mm-dd` 文本框（Zotero 弹层里的浏览器原生日历弹不出来，文本框
  是可靠的输入方式）。

## 验收

- `npm run typecheck`：0 错误
- `npm test`：30/30 通过
- `npm run build`：产出 `submission-tracker-0.1.23.xpi`
- XPI sha256：`b2e37c4110a51fde6eaad5d52be9ee6267dd6eff85443798d4e972a7ee685c81`
- `updates.json`：语法已校验、0.1.23 置顶、已推 main
- GitHub Release：v0.1.23 已创建
