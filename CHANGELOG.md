# Changelog

## 0.1.14 — 2026-08-25

- 固定使用已经确认加载完成的看板文档，避免 Zotero 窗口导航期间再次读取 `window.document` 时获得另一份文档。
- 将事件绑定限定在刚刚渲染的应用根节点内；若固定控件确实缺失，会直接报告具体选择器。
- 新增文档切换回归测试，覆盖已发现的 `querySelector(...) is null` 启动错误。

## 0.1.13 — 2026-08-24

- 修复 Zotero 插件窗口绑定 `oninput`、`onclick`、`onchange` 和 `onsubmit` 跨窗口事件属性时导致看板启动失败的问题，统一改用标准事件监听。
- 补充事件绑定回归检查，防止不兼容写法重新进入安装包。
- 改进跨窗口异常详情显示，后续错误会同时保留异常名称、消息和调用栈。

## 0.1.12 — 2026-08-24

- Fix `SyntaxError: An invalid or illegal string was specified` when opening the dashboard.
- Change the dashboard document from XML/XHTML to standard HTML so Zotero can parse the dynamically generated forms and tables.
- Add build and regression checks that prevent the obsolete `.xhtml` entry point or XML namespace from returning to the XPI.

## 0.1.11 — 2026-08-24

- Register the dashboard resources as a Zotero chrome content package.
- Open the dashboard through `chrome://submission-tracker/content/dashboard.xhtml` instead of a direct XPI `jar:file://` URL.
- Unregister the chrome content package when the plugin shuts down or startup fails.
- Add build and unit-test checks that prevent the invalid direct-XPI window path from returning.

## 0.1.10 — 2026-08-24

- 修复点击“Submission Tracker”后窗口等待加载并最终超时的问题。
- 不再依赖可能被错过的单次 `load` 事件；改为监听文档事件并确认看板容器实际出现。
- 加载失败提示现在包含窗口地址和文档状态，便于定位下一层启动错误。

## 0.1.9 — 2026-08-24

- 修复“工具 → 投稿追踪”菜单可见但点击后没有反应的问题。
- 将看板文档改为标准 XHTML 窗口，确保页面主体和原生对话框可用。
- 优先通过 Zotero 主窗口打开看板，并为窗口创建、加载和初始化失败增加可见错误提示。
- 新增回归测试，真实触发菜单命令并验证窗口打开及错误提示链路。

## 0.1.8 — 2026-08-24

- 修复 Zotero 10 中“工具”菜单入口仍不显示的问题：插件现在通过主窗口生命周期钩子直接创建并清理“投稿追踪”菜单项。
- 保留 Zotero 正式菜单接口用于普通文献条目的“创建投稿记录”右键入口。
- 新增回归测试，验证直接菜单注入、窗口加载钩子以及插件关闭时的清理行为。

## 0.1.7 — 2026-08-24

- 修复 Zotero 10 启动死锁：插件启动阶段不再等待只能在插件初始化结束后触发的 `uiReadyPromise`。
- 新增回归测试，验证界面就绪信号尚未触发时仍会导入入口模块并完成菜单注册。

## 0.1.6 — 2026-08-24

- Stop resolving `IOUtils`, `PathUtils`, and `Services` through separate module imports during bootstrap; use the objects supplied by Zotero's plugin sandbox instead.
- Log startup failures and reject failed menu registrations so a missing entry has an actionable error.
- Use Zotero's clipboard helper instead of depending on a separately injected `Components` object.

## 0.1.5 — 2026-08-24

- Pass Zotero's privileged runtime objects explicitly into the ESM bundle, fixing startup on Zotero 10 where those objects are not module globals.
- Give both menu entries direct Chinese/English fallback labels so a localization problem cannot leave them blank or invisible.
- Add startup and menu-registration regression tests for the Zotero 10 runtime boundary.

## 0.1.4 — 2026-08-24

- Remove an obsolete localization-registration call that is unavailable in Zotero 10.
- Keep Fluent resources discoverable through the standard plugin locale layout.

## 0.1.3 — 2026-08-24

- Define Fluent `.label` attributes required by `Zotero.MenuManager`, restoring the Tools and item-context menu entries.
- Add automated checks that reject incorrectly structured menu-localization messages.
- Increment the release version so Zotero replaces cached or previously installed 0.1.2 packages.

## 0.1.2 — 2026-08-24

- Restore the `applications.zotero` manifest section expected by Zotero 10's validator.
- Add the validator-required `update_url` field and widen the tested Zotero 10 range to `10.0.*`.
- Make the build reject manifests that omit any Zotero-required compatibility field.
- Publish the production GitHub update manifest and release download URL.

## 0.1.1 — 2026-08-24

- Use `browser_specific_settings.zotero` in the install manifest for Zotero 10.
- Derive the XPI filename from the package version and fail builds when package and manifest versions disagree.

## 0.1.0 — 2026-08-24

- Initial release candidate for Zotero 8, 9, and 10.
- Added submission dashboard, reusable system profiles, status timelines, local follow-up reminders, Zotero item links, JSON backup/restore, CSV export, settings, and bilingual UI.
- Added atomic local persistence, backup validation, security boundary tests, build automation, and a cross-platform release checklist.
