### 提升镜头：0.1.16
- **iframe 架构**，彻底解决“Dashboard element is missing after render: #q”错误。
- 原来看板直接在 chrome 顶层窗口渲染，导致 `<input id="q">` 等节点被错误命名空间解析；改为在 `<iframe>` 的标准 HTML 文档中渲染，使 `querySelector` 与 `innerHTML` 语义正常。
- 主窗口和 iframe 之间通过 `windowtype="submission-tracker:dashboard"` 保持一致，插件可以正常识别。
- `host.ts` 现在等待 `iframe.contentDocument` 的 `#app` 并设置 `windowtype`。
- `ui.ts` 为了兼容旧资产，添加 `innerHTML` 兜底。
- 版本号升级至 0.1.16，`updates.json` 与 `manifest.json` 同步，sha256 也对应。
- 新增 `changelog.md` 及新测试覆盖，所有单元测试通过。
- `airtime`：发布至 GitHub，用户可直接更新。

---

**更新链接**：<a href="https://github.com/longkou1988/zotero-submission-tracker/releases/tag/v0.1.16">1.1.6 发行</a>