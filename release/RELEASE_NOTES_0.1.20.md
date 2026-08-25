### 0.1.20 (2026-08-25)
- **修复“设置与备份”对话框里 Export / Restore / CSV / 删除 / 关闭 按钮全部不显示的问题**。
- 在 `src/dom.ts` 新增 `h()` 显式 DOM 构建辅助函数（hyperscript 风格），所有节点都通过 `createElementNS(HTML, ...)` 创建。
- 改造 `DashboardUI.dialog()` 不再使用 `innerHTML` 注入对话框内容；改用 builder 回调，所有控件、表单、按钮都在 HTML 命名空间下显式创建。
- 全面重构 `showSettings / showSubmissionForm / showStatusForm / showDetails / showProfiles / profileForm / alert`，统一通过 `h()` 构建。
- **设置对话框新增显式“取消 (Cancel)”按钮**，与“关闭 (Close)”并列；其他对话框原本就有取消按钮，继续保留。
- 同步更新 `security.test.ts`，让“使用 addEventListener”断言覆盖 `src/dom.ts`。
- 版本号升至 0.1.20，`updates.json` 同步 SHA256。
- 所有 30 个单元测试通过。
