# 九境 · Nine Realms

离线数独游戏，包含 32 种玩法、1,258 道题、动态主题、禅模式、彩蛋和历史回放，支持网页与 Electron 桌面版。

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
