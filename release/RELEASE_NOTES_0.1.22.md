# Submission Tracker v0.1.22

## 修复：日历选择器无法使用 & 保存按钮无响应

### 1. 日期选择器

`v0.1.21` 起对话框里仍使用 `<input type="date">` 让用户挑日期。但是 **Zotero 的 chrome 特权窗 + iframe + `<dialog>.showModal()` 顶层渲染**这个组合下，Firefox ESR 140 的原生日期弹窗不会弹出 — 你截图里能看到日期框 + 右侧日历图标，但点击毫无反应。

`v0.1.22` 把所有日期输入改成普通文本框 `yyyy-mm-dd`，并加了内置格式提示与 `pattern` HTML 校验：

- ✅ `<input type="text" inputmode="numeric" pattern="\d{4}-\d{2}-\d{2}">`
- ✅ 占位符 `yyyy-mm-dd`
- ✅ 字段下方小字提示"格式 yyyy-mm-dd；可留空"
- ✅ 提交时 JS 也会做一次格式校验，给出 alert

`localDateString()` 默认填的就是 `yyyy-mm-dd`，**和原来默认日期一字不差**。如果你只想换日期，光标点击文本框直接改即可。

### 2. 保存按钮

`<button type="submit">` 提交 `dialog` 里 `<form>` 抛出的 `submit` 事件是浏览器链式行为，某些边界情况下在 Zotero 顶层对话框里不可靠。`v0.1.22` 把保存路径彻底换掉：

- ✅ `<button type="button" onClick={...}>` 显式 `onClick`
- ✅ 点击直接读 `new FormData(form)`，自己跑校验，失败给 alert，成功 `await service.createSubmission(...)` → `d.close()` → 重新渲染看板
- ✅ 进文本框按 Enter 仍可触发保存（`form.addEventListener("submit", ...)` 兜底）

### 影响范围

- 新建投稿记录
- 编辑投稿记录
- 更新状态 / 编辑状态事件
- 新建 / 编辑投稿系统（无日期字段，仅换了保存按钮）

### 升级

- 自动：完全退出 Zotero 再重启，附加组件更新链会拉到 v0.1.22。
- 手动：从下方下载 XPI，工具 → 附加组件 → 齿轮 → Install Add-on From File。

### 版本号

`addon/manifest.json` `package.json` `src/main.ts` `src/core/domain.ts` 同步升到 `0.1.22`，`updates.json` 已推到 main。
XPI sha256: `bffb080d33b5f1302c1c5a18fc5f53de538901439f19830f6bd7c7d34369fe2d`

### 自测

| 项 | 结果 |
|---|---|
| `npm run check`（typecheck+test+build） | 全绿 |
| 单测 | 30 / 30 通过 |
| 构建产物 `main.js` | `<input type="date">` 数量：**0** |
| 构建产物 `main.js` | 新日期 helper `dateField` 命中：**6 处** |
| 模板版本烘焙 | `PLUGIN_VERSION = "0.1.22"` |

### 项目笔记

新增铁律：Zotero 插件内**绝不能依赖 `<input type="date">` / 文件 picker / `<select>` 弹层之类的浏览器原生 UI**——它们在 chrome 顶层对话框里会失效。一律改用文本输入 + 校验前缀，或自绘下拉。
