# 九境 · Nine Realms

离线数独游戏，包含 32 种玩法、10,258 个原题来源、动态主题、禅模式、彩蛋和历史回放，支持网页与 Electron 桌面版。

## 开发

使用 WSL、Node.js 22+ 和 Python 3.10+。

```bash
python3 -m http.server 8765 --directory src
```

打开 http://localhost:8765。游戏源码位于 `src/`，桌面入口位于 `desktop/`。

## 构建

```bash
npm run build          # 离线网页
npm run package:setup  # Windows 安装包
```

## 当前版本说明

- 原题来源中含 9,000 道 Sudoku Exchange 公有领域经典题（入门/标准/进阶各 3,000），非全量导入；许可、固定来源版本、难度映射和验证统计见 `data/sudoku-exchange/`。
- 32 种玩法的普通新游戏在离线 Worker 中重新挖空，仅接受完整规则下已证明唯一解的删格。生成档位按给定数密度，不等同于人类技巧评级；附加线索结构仍来自原模板，不宣称无限或永久不重复。
- 首次启动、极境、每日与旅程保留原题库路径。生成超时、目标密度未达到等情况安全回退库题；可随时取消生成。
- 毛玻璃界面与圆角菜单采用渐进增强；部分浏览器会保留原生难度菜单。隐藏冗余准备文案，但保留错误、进度、提示与无障碍播报。
- 根目录 `nine realms.html` 是当前源码生成的独立离线网页。更新源码后运行 `npm run build`，再将 `dist/index.html` 复制到该文件。

## 检查

```bash
npm test
npm run build
npm run verify
```

测试无需安装第三方依赖，覆盖导入原题唯一性、旧来源/每日/旅程兼容、生成确定性与安全回退、Worker VM 生命周期和状态展示。
测试报告写入忽略的 `evidence/`；固定兼容性散列保存在 `tests/fixtures/`。
当前云端环境无法实际运行浏览器，因此静态/Node/VM 检查不代表真实浏览器视觉和交互验收。
