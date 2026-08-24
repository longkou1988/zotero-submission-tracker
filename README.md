# 投稿追踪 / Submission Tracker

一款面向 Zotero 8、9 和 10 的本地投稿管理插件。它把 Zotero 文献与期刊、投稿系统入口、登录用户名、稿件编号、状态时间线和下一次跟进日期关联起来。

> 投稿追踪不是密码管理器。插件没有密码字段，不自动登录、不抓取网站状态，也不修改 `zotero.sqlite`。除 Zotero 检查插件更新外，插件不会发起后台网络请求。密码继续交给浏览器、1Password 或系统钥匙串。

## 已实现功能

- 从普通 Zotero 文献右键创建投稿记录；附件、笔记和批注不显示入口。
- 同一文献可保存多次投稿、改投和返修记录。
- 可复用及归档投稿系统配置，支持打开登录页和复制用户名。
- 11 个预设状态、自定义状态，以及可编辑、可删除的完整时间线。
- 按“生效日期、创建时间”确定当前状态；补录旧事件不会覆盖较新的状态。
- 本地日期跟进提醒、逾期/7 天内排序、状态/系统/期刊/生命周期筛选。
- UTF-8 BOM CSV 导出，默认不含用户名。
- 带结构校验、引用校验、预览确认和替换式恢复的完整 JSON 备份。
- 原子式数据写入和 `.bak` 回退；禁用或卸载插件不会删除数据。
- 简体中文和英文界面。

## 安装

下载 Release 中的 `submission-tracker-*.xpi`，在 Zotero 中打开“工具 → 附加组件”，使用齿轮菜单选择“Install Add-on From File…”，然后选择 XPI。

当前工作区构建可运行：

```sh
npm install
npm run check
```

生成文件位于 `build/submission-tracker-0.1.4.xpi`。开发、手工验收和发布方法见 [docs/TESTING.md](docs/TESTING.md) 与 [release/RELEASE_CHECKLIST.md](release/RELEASE_CHECKLIST.md)。

## 使用

1. 在 Zotero 资料库中选中一篇普通文献，右键选择“创建投稿记录”。
2. 填写期刊、投稿日期、稿件编号和下一次跟进日期。
3. 在看板中选择“更新状态”添加时间线事件。
4. 使用“投稿系统”配置保存登录地址和用户名；密码不会进入插件。
5. 在设置中导出 JSON 完整备份或 CSV 管理表。

数据默认保存在 Zotero 数据目录的 `submission-tracker/data-v1.json`；前一份有效数据保存在 `data-v1.json.bak`。

## 兼容性

- Zotero 8：目标支持。
- Zotero 9：目标支持。
- Zotero 10：按当前 Beta 接口设置兼容上限；正式版发布后仍需重新验收。

本项目只使用 Zotero bootstrap、标准 ESM 和 `Zotero.MenuManager`。看板宿主逻辑集中在 `src/host.ts`，以便适配 Zotero 后续界面变化。

## 发布状态

`0.1.4` 修复了 Zotero 10 启动阶段因调用不存在的手动本地化接口而中断、导致菜单入口不显示的问题。本地化资源由 Zotero 在插件启动前自动加载。源码、XPI 与自动更新清单发布在 [longkou1988/zotero-submission-tracker](https://github.com/longkou1988/zotero-submission-tracker)。在完成 macOS、Windows、Linux 以及 Zotero 8、9、10 的完整验收矩阵前，本版本不标记为稳定版。

另见：[隐私说明](PRIVACY.md)、[已知限制](KNOWN_LIMITATIONS.md)、[英文 README](README.en.md)、[更新日志](CHANGELOG.md)。

## 许可证

尚未指定。公开发布前请由项目所有者选择并添加许可证。
