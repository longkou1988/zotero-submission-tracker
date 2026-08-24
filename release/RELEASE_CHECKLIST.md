# 公开发布清单

- [ ] 选择并添加开源许可证。
- [x] 创建目标 GitHub 仓库并配置真实所有者 `longkou1988`。
- [x] 将更新清单配置为稳定 HTTPS 地址，并把该地址加入 `addon/manifest.json`。
- [x] 执行 `npm ci && npm run check`，记录测试结果与 XPI SHA-256。
- [ ] 完成 `docs/TESTING.md` 的 macOS、Windows、Linux 真实安装矩阵。
- [ ] 分别记录 Zotero 8、9 和 10 的确切测试版本；10 Beta 与 Stable 分开标注。
- [ ] 使用无真实账号的演示数据录制截图或 GIF。
- [x] 检查 XPI 中不含源码映射、测试数据、用户名或本机路径。
- [x] 创建 GitHub Release，上传 XPI、SHA-256 和更新日志。
- [ ] 从 Release 下载 XPI，在全新配置中做最后一次安装与自动更新测试。

只有以上项目全部完成，才将版本从“候选版本”标记为“公开稳定版”。
