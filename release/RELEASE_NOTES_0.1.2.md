# 投稿追踪 v0.1.2 / Submission Tracker v0.1.2

这是投稿追踪插件的首个公开预发布版本。

This is the first public pre-release of Submission Tracker.

## 已验证 / Verified

- 已在 macOS 的 Zotero 10 中成功安装。
- TypeScript 类型检查通过。
- 6 个测试文件、15 项自动化测试全部通过。
- XPI 压缩包完整性检查通过。

- Successfully installed in Zotero 10 on macOS.
- TypeScript type checking passed.
- All 15 automated tests across 6 test files passed.
- XPI archive integrity check passed.

## 主要功能 / Highlights

- 为 Zotero 文献创建多条投稿记录。
- 管理期刊、投稿平台、登录地址、用户名、稿件编号和投稿日期。
- 记录预设或自定义状态，并显示完整状态时间线。
- 设置下一次跟进日期，区分逾期、今天和未来 7 天。
- 打开投稿系统并复制用户名，始终不保存密码。
- 导出和恢复完整 JSON 备份，导出适合 Excel 的 UTF-8 BOM CSV。
- 数据只保存在本机，不提供遥测、状态抓取或自动登录。

- Create multiple submission records for one Zotero item.
- Track journals, submission systems, login URLs, usernames, manuscript IDs, and dates.
- Maintain preset or custom status events on a complete timeline.
- Track overdue, due-today, and upcoming follow-ups.
- Open submission systems and copy usernames without storing passwords.
- Export and restore full JSON backups, and export Excel-friendly UTF-8 BOM CSV files.
- Keep data local, with no telemetry, status scraping, or automatic login.

## 兼容性说明 / Compatibility note

插件清单声明支持 Zotero 8、9 和 10。目前仅完成 macOS Zotero 10 的真实安装验证；Zotero 8/9 以及 Windows、Linux 仍需进一步测试，因此本版本标记为预发布版。

The manifest declares compatibility with Zotero 8, 9, and 10. Only Zotero 10 on macOS has been verified through a real installation so far. Zotero 8/9 and Windows/Linux still require testing, so this release is marked as a pre-release.

## 文件校验 / Checksum

`submission-tracker-0.1.2.xpi`

SHA-256: `76df5659c1d04ee5fb00302890fd0c5f63d0c7550feb035cda48f54ee6e085a1`
