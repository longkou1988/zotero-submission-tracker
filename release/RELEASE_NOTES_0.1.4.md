# 投稿追踪 v0.1.4 / Submission Tracker v0.1.4

这是一个针对 Zotero 10 菜单入口的修复版本。

## 修复内容

- 删除 Zotero 10 中不存在的 `Zotero.Locale.registerPluginLocalization` 调用。
- 交由 Zotero 在插件启动前自动加载 Fluent 本地化资源。
- 修复插件显示为已启用，但“工具 → 投稿追踪”和文献右键入口均不出现的问题。
- 增加回归测试，防止无效的手动本地化调用再次阻断菜单注册。

## 安装或更新

已安装旧版本的用户可在 Zotero 的插件管理器中检查更新，也可以下载 `submission-tracker-0.1.4.xpi` 后选择“从文件安装插件”。更新不会删除本地投稿数据。

This release removes a nonexistent manual localization API call that aborted plugin startup on Zotero 10 before either menu could be registered. Zotero loads plugin localization resources automatically before startup.
