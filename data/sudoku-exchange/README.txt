Sudoku Exchange 数据接入

上游：https://github.com/grantm/sudoku-exchange-puzzle-bank
固定版本：d8c8ebaee0c08c412cfba96af1923dfa61c83317
许可：公有领域 / Unlicense，全文见 LICENSE.txt。
原数据共有 893,916 行、89,391,600 字节；并非全部导入。

本次导入 9,000 道经典来源：easy / medium / hard 各 3,000 道。
按上游已按 SHA1 排列的文件，从头选择通过检查的记录。
每条检查题面 81 位 0–9、SHA1 前12位、有效评分，并完整计数到2解。
仅接受恰好1解且求解未耗尽节点预算，再验证答案及给定数一致性。
去重对象：现有经典库和已选新题；精确题面、数字重命名及8种正方形对称。
不宣称完整行列带/栈置换同构去重；不宣称不同数学本质题目数量。

映射：上游 easy (SE <1.5) → easy；medium (1.5≤SE<2.5) → medium；
hard (2.5≤SE<5.0) → hard。字段 rating 保留实际 SE 评分。
这是来源分档映射，不代表与游戏原技巧描述具有相同标尺。
不导入 diabolical (SE≥5.0)，不修改原有 master 极境题库或难度机制。

运行时数据直接追加 src/engine.js 的 BANK，既有条目顺序/ID/内容不变。
import-report.json 记录源文件散列与数量；临时筛选数据写入 .build-cache/。
scripts/import-exchange.cjs 使用本地 .build-cache/sudoku-exchange/ 执行可复现筛选，
不联网、不执行上游代码。tests/exchange.test.cjs 复查全部题目及兼容性。

没有更改既有 UI、玩法、求解器、生成器、每日、旅程。
当前普通新游戏仍会把库题作为生成来源重新挖空；来源的SE评分不能当作
重新挖空后题面的技巧评级。原始库题在现有首次启动/回退路径中可被使用，
并沿用引擎既有合法数字/位置变换。已保存题目与挑战码继续保存实际题面。
