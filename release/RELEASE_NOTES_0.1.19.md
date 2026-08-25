### 0.1.19 (2026-08-25)
- **彻底修复“Dashboard element is missing after render: #q”**。
- 改用显式 DOM 构建 (`document.createElement` / `appendChild`) 替代 `innerHTML`，彻底规避 iframe/命名空间/就绪态导致的元素丢失。
- 新增 `createRowElement` 方法以 DOM 方式生成表格行。
- 版本号升至 0.1.19，`updates.json` 同步 SHA256。
- 所有单元测试通过。