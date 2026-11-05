# 九境 · Nine Realms

数独游戏，包含动态主题、禅模式、彩蛋和历史回放，支持网页与 Electron 桌面版

## 构建

```bash
npm run build          # 离线网页
npm run package:setup  # Windows 安装包
```

## GitHub 自动构建与发布

推送到 main 或在 Actions 页面手动运行 Build and package 时，工作流会检查版本、备份和禅模式，构建并验证网页包与 Electron Windows 安装包。构建产物保存在对应的 Actions 运行记录中，保留 14 天。

需要准备发行版时，先将 package.json 和相关产品版本更新为一致的数字版本，再创建并推送对应标签（例如 1.3.0 对应 v1.3.0）。工作流会校验标签和版本，测试通过后创建 Release 草稿，并附上 Setup.exe、Nine-Realms-Web.zip 和 SHA256SUMS.txt；源码归档由 GitHub 提供。草稿需要在 Releases 页面检查后手动发布。

Windows 安装包未签名；自动验证检查安装包结构、内容和版本，不代替在 Windows 上安装、运行及卸载的验收。Tauri 是独立桌面版本，当前工作流构建的是 Electron 版本。
