# Kiro Rescue Agent 协作工作流

## 背景

`kiro:rescue` 命令将任务交接给 Kiro CLI 执行。实际使用中发现：直接传模糊描述给 kiro-rescue，Kiro 无法理解要做什么——它只看到 branch name 和 git log，缺少对话中积累的上下文。

**核心洞察：** Kiro CLI 是一个有自主探索能力的 Agent，它不需要我们手把手告诉它每一行怎么改。但它需要一个清晰的**起点**：现象是什么、目标是什么、涉及哪些文件。有了这些，它自己能完成探索、验证和执行。

## 三层协作架构

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Claude Code（主对话）                          │
│                                                          │
│  - 用户提出任务 / 发现 bug                                │
│  - Claude 初步分析问题、定位现象                           │
│  - 触发 kiro:rescue，将上下文传给 Rescue Agent             │
│                                                          │
└──────────────────────────┬──────────────────────────────┘
                           │ 触发 + 上下文
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Kiro Rescue Agent（Claude 子代理）              │
│                                                          │
│  - 接收主对话的上下文                                     │
│  - 整理为结构化交接文档                                   │
│  - 调用 kiro-rescue CLI 传给 Kiro                        │
│  - 返回结果给主对话                                       │
│                                                          │
└──────────────────────────┬──────────────────────────────┘
                           │ 结构化描述
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Kiro CLI（自主执行 Agent）                      │
│                                                          │
│  - 接收：现象 + 目标 + 涉及文件                           │
│  - 自主探索代码，理解上下文                                │
│  - 自主验证修复方案的可行性                                │
│  - 执行修改 + 构建 + 返回结果                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 各层职责

| 层 | 角色 | 职责 | 不负责 |
|---|------|------|--------|
| **Layer 1** Claude Code | 发现者 | 发现问题、初步定位、触发 rescue | 不需要完成全部分析 |
| **Layer 2** Rescue Agent | 中继者 | 收集上下文、结构化整理、调用 CLI | 不负责探索、不负责验证 |
| **Layer 3** Kiro CLI | 执行者 | 自主探索、验证、执行、构建 | 不需要主对话的完整历史 |

## 工作流详细步骤

### Step 1: Claude Code 主对话 — 发现问题

在对话中完成初步调研：

- 复现问题现象
- 粗略定位涉及的文件/模块
- 触发 `/kiro:rescue`

### Step 2: Kiro Rescue Agent — 上下文整理

Rescue Agent 从对话历史中提取关键信息，整理为结构化描述：

```markdown
## 现象
[观察到的具体表现]

## 目标
[期望的结果]

## 涉及文件
- [文件路径1] — [与问题的关系]
- [文件路径2] — [与问题的关系]

## 已知线索
[在对话中已发现的关键信息]
```

**关键原则：只给 Kiro 足够的起点，不替它做决策。**

- 提供：现象、目标、涉及文件、已知线索
- 不需要：精确行号、完整 diff、验证过的修复方案
- Kiro 自己去探索代码、理解逻辑、找到修改点

### Step 3: Kiro CLI — 自主探索 + 验证 + 执行

Kiro CLI 接收结构化描述后：

1. **自主探索** — 阅读涉及文件，理解代码逻辑，定位 bug 根因
2. **自主验证** — 先确认理解正确（如读取相关配置、调用 API 验证假设）
3. **执行修改** — 基于自己的理解完成代码修改
4. **构建验证** — 运行构建/测试确保修改正确

**关键原则：Kiro 是有能力的 Agent，不是被动的执行器。**

## Rescue Agent 的上下文模板

传给 Kiro CLI 的描述应遵循以下格式，重点是**给方向而非给答案**：

```
## 现象
[一句话描述观察到的异常行为]

## 目标
[一句话描述期望结果]

## 涉及文件
- [绝对路径] — [这个文件的作用以及它与问题的关系]

## 已知线索
- [在对话分析中已发现的关键信息]
- [如已确认的 bug 根因方向]

## 构建方式
[项目构建命令，如 tsc、npm run build 等]
```

## 对比：两种交接模式

| 维度 | 微操模式（旧） | 自主模式（推荐） |
|------|----------------|------------------|
| 传给 Kiro 的内容 | 精确行号 + old code + new code | 现象 + 目标 + 涉及文件 |
| 谁做决策 | Claude 替 Kiro 决定怎么改 | Kiro 自己探索后决定 |
| 谁验证方案 | Claude 手动验证后交接 | Kiro 自己验证后再改 |
| 容错性 | Claude 判断错 → Kiro 执行错 | Kiro 可以自己纠错 |
| 适合场景 | 简单确定性修改 | 复杂探索性 bug 修复 |

## 实战案例

### 案例：Lokalise MCP upload message 覆盖 bug

#### 现象（Layer 1 发现）

调用 Lokalise MCP 的 `upload_csv_data` 更新已有 key 时，返回显示 `"Successfully uploaded 0 keys to 1 file(s)"`，但实际上翻译未被更新。

#### Rescue Agent 交接内容（Layer 2 整理）

```markdown
## 现象
Lokalise MCP upload_csv_data 上传已有 key 后返回 keysCreated=0，
回读发现翻译未更新。手动调用 Lokalise API bulk_update 可以成功。

## 目标
修复 MCP upload 对已有 key 的更新流程，确保翻译能正确更新。

## 涉及文件
- /Users/sammore/Mexc/cursor-cli/src/mcp/lokalise/lokalise/batch-operations.ts
  — uploadCSVData 函数，处理 key 的创建和更新逻辑
- /Users/sammore/Mexc/cursor-cli/src/mcp/lokalise/utils/mcp-error-middleware.ts
  — executeWithErrorHandling 包装层，可能覆盖了内层返回信息

## 已知线索
- 手动 curl 调用 Lokalise API PUT /keys 成功更新了翻译
- MCP 上传返回 keysCreated=0 但没有 keysUpdated 字段
- 怀疑是 response message 被中间层覆盖，掩盖了实际的 update 结果

## 构建方式
cd /Users/sammore/Mexc/cursor-cli && rm -rf dist && tsc
```

#### Kiro CLI 执行结果（Layer 3）

Kiro 自主探索后发现问题在 `mcp-error-middleware.ts` 第 127 行，message 被固定字符串覆盖。修复后构建通过。

## 反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|----------|
| 只传一句模糊描述 | Kiro 缺少方向，只能看 git log 猜 | 整理现象+目标+涉及文件 |
| 传精确 diff 让 Kiro 无脑执行 | Claude 分析错 → Kiro 也错 | 给方向让 Kiro 自主探索 |
| Rescue Agent 替 Kiro 验证 | 浪费 Rescue Agent 的上下文窗口 | Kiro 自己验证再执行 |
| 不提供涉及文件 | Kiro 要全项目搜索，效率低 | 至少给出相关文件路径 |

## 待优化方向

- [ ] Rescue Agent 自动从对话历史提取上下文
- [ ] 结构化模板的标准化（可作为 skill 配置）
- [ ] Kiro 执行结果的自动回读校验
- [ ] 支持多轮交互（Kiro 遇到问题可回问 Rescue Agent）
