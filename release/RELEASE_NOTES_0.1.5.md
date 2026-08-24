# 投稿追踪 v0.1.5 / Submission Tracker v0.1.5

这是一个针对 Zotero 10 启动与菜单入口的兼容性修复版本。

## 修复内容

- 修复业务模块在 Zotero 10 的 ESM 隔离环境中无法访问 Zotero 运行对象、导致插件在注册菜单前停止启动的问题。
- 启动入口显式传入 Zotero、文件系统和平台服务依赖。
- “工具 → 投稿追踪”和普通文献右键菜单增加直接的中英文回退文字，即使本地化资源异常也能显示。
- 增加启动边界和实际菜单注册参数的回归测试。

## 更新方法

已安装旧版本的用户可在 Zotero 的插件管理器中检查更新，也可以下载 `submission-tracker-0.1.5.xpi` 后选择“从文件安装插件”。安装完成后请完全退出并重新打开 Zotero。更新不会删除本地投稿数据。

---

This prerelease explicitly passes Zotero's privileged runtime dependencies into the isolated ESM bundle, preventing startup from stopping before menu registration on Zotero 10. It also gives both menu entries direct Chinese/English fallback labels.
