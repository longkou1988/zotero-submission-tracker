### 0.1.17 (2026-08-25)
- 彻底修复“Dashboard element is missing after render: #q”错误。
- 根因：iframe 的 `contentDocument` 是标准 HTML 文档，直接用 `innerHTML` 即可正常工作，`replaceWithParsedHTML` 的复杂解析导致节点命名空间不匹配。
- 将 `DashboardUI.render()` 和对话框渲染全部改为 `innerHTML`，消除命名空间问题。
- 版本号统一至 0.1.17，`updates.json` 同步。
- 所有单元测试通过。