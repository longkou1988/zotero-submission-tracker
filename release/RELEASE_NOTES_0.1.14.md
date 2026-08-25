# 投稿追踪 v0.1.14 / Submission Tracker v0.1.14

首个覆盖 Zotero 8 / 9 / 10 的完整发布。自 v0.1.5 以来的大量提交集中解决了 Zotero 10（10.0.1 稳定版，2026-08-24 发布）下的启动、菜单入口与看板加载问题，并将看板入口文档从 XML/XHTML 迁移为标准 HTML。

## 本次发布覆盖的关键修复（v0.1.6 – v0.1.14）

- **Zotero 10 启动与菜单注册**：修复插件启动阶段等待 `uiReadyPromise` 造成的死锁；在 Zotero 10 通过主窗口生命周期钩子直接创建并清理“工具 → 投稿追踪”菜单项；保留官方 `Zotero.MenuManager` 用于普通文献条目的“创建投稿记录”右键入口。
- **看板文档标准化**：将看板从 XHTML 改为标准 HTML（`dashboard.xhtml → dashboard.html`），注册为 Zotero chrome 内容包并通过 `chrome://submission-tracker/content/dashboard.html` 打开，插件关闭/启动失败时自动反注册；统一改用标准事件监听，修复跨窗口 `oninput/onclick/onsubmit` 绑定导致的看板启动失败。
- **运行对象注入**：不再通过单独的模块导入解析 `IOUtils`/`PathUtils`/`Services`，改用 Zotero 插件沙箱注入的特权对象；使用 Zotero 自带剪贴板辅助而非依赖单独注入的 `Components`。
- **健壮性**：固定使用已确认加载完成的看板文档；事件绑定限定在应用根节点；加载失败提示包含窗口地址与文档状态；新增多项启动、菜单、文档切换回归测试（当前共 28 项测试全绿）。
- **构建与发布安全闸**：版本一致性、chrome 包注册/反注册、标准 HTML 入口、HTTPS 更新地址、MenuManager 所需的 Fluent `.label` 均通过构建期校验。

## 隐私与本地化保证

- 纯本地、无网络、无遥测；不写入或读取 Zotero 主数据库（SQLite）。
- 系统档案可保存用户名与登录地址，**绝不保存密码**；JSON 完整备份包含用户名但排除任何密码/密钥/令牌字段（写入前做敏感键拒绝校验）。
- CSV 导出带 UTF-8 BOM 且不包含用户名。
- 中文（zh-CN）与英文（en-US）双语界面。

## 更新方法

已安装旧版本的用户可在 Zotero 插件管理器中检查更新（自动更新清单已指向本版本），或下载 `submission-tracker-0.1.14.xpi` 后选择“从文件安装插件”。安装完成后请完全退出并重新打开 Zotero。更新不会删除本地投稿数据。

---

This is the first full release covering Zotero 8, 9, and 10. It resolves the Zotero 10 startup/menu deadlock, migrates the dashboard to standard HTML served as a Zotero chrome package, fixes cross-window event binding, and hardens the build with safety gates. 28 regression tests pass. The plugin remains fully local: no network, no telemetry, no SQLite writes, and no password storage.
