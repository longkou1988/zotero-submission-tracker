# 投稿追踪 v0.1.3 / Submission Tracker v0.1.3

这是一个修复菜单入口的预发布版本。

## 修复内容

- 修复 Zotero“工具”菜单中不显示“投稿追踪”的问题。
- 修复普通文献右键菜单中不显示“创建投稿记录”的问题。
- 使用新版本号，确保 Zotero 会替换早期安装的 0.1.2 副本。
- 增加构建和自动化测试，防止菜单本地化格式再次回退。

## 安装与使用

1. 下载 `submission-tracker-0.1.3.xpi`。
2. 在 Zotero 中打开“工具 → Plugins（插件）”。
3. 点击齿轮菜单，选择“Install Add-on From File…（从文件安装附加组件）”。
4. 选择下载的 XPI；如果 Zotero 提示重启，请重启。
5. 从“工具 → 投稿追踪”打开看板，或选中一篇普通文献后右键选择“创建投稿记录”。

> 插件不保存密码，不自动登录，不抓取投稿网站状态，也不上传投稿数据。

This prerelease fixes the missing Tools and regular-item context-menu entries by providing the Fluent attributes required by Zotero's formal menu API.
