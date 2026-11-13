# 空盘构造器 v1

`src/diversity-source.js` 从 **81 个空格**开始，以种子控制候选数字与搜索位置顺序。使用最少候选优先的回溯、同行列宫/变体同值禁止邻居的前向候选删除；非连续模式额外处理正交差 1 禁止、单位缺失数字检查与隐性单值。不会读取某张现成答案、改名、旋转、重排后冒充新答案。

## API

浏览器全局 `NineRealmsDiversitySource`，Node `require('./src/diversity-source')`：

- `supportedModes()`：返回新数组；`supports(mode)`：是否有构造支持。
- `generate({mode, seed, maxNodes?, maxAttempts?})`：返回 `{id,sourceId,mode,givens,solution,clues,construction}`。此时 givens 为满盘，仅供后续挖空；不是已完成评级的新游戏题目。
- `workerSource()`：返回可注入 Worker 的模块源码，依赖事先加载的 `SudokuEngine`。

支持 classic、diagonal、hyper、knight、king、nonconsecutive、disjoint。所有完成盘会再由主引擎 `validateComplete` 验证，clues 使用引擎规范格式，数组互不共享。

固定默认预算为每次尝试 60,000 节点、最多 4 次。失败抛出带 `code: 'DIVERSITY_BUDGET'` 的错误和实际预算信息，不返回半成品、不暗中换成旧题。种子及预算完全决定结果；系统时间或机器快慢不参与搜索分支。界面层仍可使用独立 watchdog 避免长期阻塞，但不能把被取消的题当成成功。

## 边界

- **Miracle 未开放为新底盘构造模式**：测试的不同种子虽可生成合法盘，但完整经典等价审计落入同一类，不能满足“实质不同底盘”的目标。不借数字重命名包装成新结构。
- 非连续约束搜索较难，有明确预算失败；搜索也可能重新遇到经典等价的结构。调用方须使用近期题记录做精确等价排重，超出预算可明确告知或保留旧流程，不能静默宣称新结构成功。
- 支持模式不意味着种子到结构是一一映射，也不意味着随机分布均匀。更不意味着已获得唯一题面或技巧评级；后续挖空必须独立验证唯一解与难度。
- 不改现有题库、主线、每日题、历史题号或旧种子的行为。

## 复验

运行 `node tests/diversity-source.test.cjs`。默认每模式 100 个固定种子，使用 `puzzle-diversity` 的**完整经典等价关系**（数字重命名、宫带/宫栈排列、宫内行列排列及转置）审计，不只比较题面字符串或旋转镜像。报告输出至 `evidence/diversity/source-audit.json`，包括成功数、预算回退数、重复等价类和构造耗时。性能为环境观测，不作为时间型确定性测试门槛。
