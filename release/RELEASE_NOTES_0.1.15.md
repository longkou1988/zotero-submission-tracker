# 投稿追踪 v0.1.15 / Submission Tracker v0.1.15

基于 v0.1.14 的维护性修复，解决 Zotero 特权窗口下的 Html 命名空间渲染问题。

## 修复内容

- 修复 Zotero 特权（XUL）窗口中把动态标记直接写入 `innerHTML` 时，元素被创建到错误命名空间、导致主看板搜索框 `#q` 等控件实际未生成的问题。
- 主看板与对话框现在先在标准 HTML 文档中解析标记，再把节点导入 Zotero 窗口（`src/dom.ts` 的 `createHTMLElement` 与 `replaceWithParsedHTML`）。
- 新增 HTML 命名空间与动态看板渲染的回归测试（`tests/dom.test.ts`）。
- 版本号升至 0.1.15，`updates.json` 同步指向本版本。

## 更新方法

已安装旧版本的用户可在 Zotero 插件管理器中检查更新，或下载 `submission-tracker-0.1.15.xpi` 后选择“从文件安装插件”。安装完成后请完全退出并重新打开 Zotero。更新不会删除本地投稿数据。

---

This maintenance release fixes HTML-namespace rendering inside Zotero's privileged windows: dashboard and dialog markup is now parsed in a real HTML document before being imported, so controls such as the search box are created correctly. Adds a regression test for namespace-safe rendering. Plugin stays fully local: no network, no telemetry, no SQLite writes, no password storage.
