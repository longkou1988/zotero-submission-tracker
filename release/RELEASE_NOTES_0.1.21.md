# Submission Tracker v0.1.21

## 修复：新建投稿对话框崩溃（ReferenceError: Node is not defined）

**问题**：v0.1.20 把对话框改用 `h()` 显式 DOM 构建器后，其内部 `appendChild` 辅助函数用
`child instanceof Node` 判断节点类型。Zotero 的 bootstrap 沙箱作用域不暴露 `Node` 全局，
导致打开「新建投稿记录」时抛出 `ReferenceError: Node is not defined`、窗口无法启动。

**修复**：将节点判定改为结构式检查（依据 `nodeType` 是否为数字），不再引用 `Node` 全局。
`src/dom.ts` 的 `appendChild` 现在：

```ts
function isNodeLike(value: unknown): value is { nodeType: number } {
  return typeof value === "object" && value !== null && typeof (value as { nodeType?: unknown }).nodeType === "number";
}
function appendChild(doc: Document, parent: Element, child: ChildSpec): void {
  if (child == null || child === false) return;
  if (isNodeLike(child)) { parent.appendChild(child as Node); return; }
  ...
}
```

受影响的对话框（全部改用同一种构建器，一并修复）：新建/编辑投稿、更新状态、投稿系统配置、
系统详情、设置与备份。

## 验证

- `npm run typecheck`：0 错误
- `npm test`：30/30 通过
- `npm run build`：产出 `submission-tracker-0.1.21.xpi`
- 已发布的 `main.js` 不再包含 `instanceof Node`，版本号烘焙为 `0.1.21`
- XPI sha256：`5e83162656814ef2007e4721ebc18bf4aa86aba4d45a0a148d77f69a69db8b9c`

## 升级方式

重启 Zotero 触发自动更新（或工具 → 附加组件 → 齿轮 → Check for Updates），
也可手动安装本 Release 的 XPI。
