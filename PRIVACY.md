# 隐私说明 / Privacy

投稿追踪的数据仅保存在用户本机 Zotero 数据目录中。

- 不保存密码，也没有密码输入框。
- 不收集遥测、分析数据或广告标识。
- 不上传投稿记录；除 Zotero 获取公开更新清单外，插件业务功能不执行后台网络请求。
- 不读取投稿网站内容，不自动登录，不抓取审稿状态。
- 不直接读写 Zotero SQLite 数据库。
- 只有用户主动点击时，插件才把登录地址交给系统默认浏览器。
- 用户名可以保存在本地 JSON 完整备份中，但默认不会导出到 CSV。

完整 JSON 备份包含投稿系统用户名和登录地址，请像保护其他科研资料一样妥善保管。卸载插件不会自动删除本地数据；如需删除，请先备份，再在插件设置中执行“删除全部本地数据”。

---

Submission Tracker stores data only in the local Zotero data directory. It stores no passwords, collects no telemetry, sends no application-level background network requests, reads no submission-portal content, and does not modify Zotero’s SQLite database. Zotero may retrieve the public update manifest to check for add-on updates. A full JSON backup includes usernames and portal URLs; CSV exports omit usernames by default.
