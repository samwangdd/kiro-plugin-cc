# 稳定化 kiro:rescue 转发机制

> 状态: 待实现 | 创建: 2026-04-03

## 问题

执行 `/kiro:rescue` 时，Claude subagent 不稳定地将任务转发给 kiro-cli，而是自己直接执行了代码修改。

**证据**: subagent 输出 `[WARNING] No new kiro rescue job produced — kiro-cli may not have been invoked.`

## 对比: kiro-plugin-cc vs codex-plugin-cc

### 结构完全一致（三层架构）

| 层 | kiro-plugin-cc | codex-plugin-cc |
|---|---|---|
| Command | `rescue.md` — `context: fork` + `allowed-tools: Bash(node:*)` | 相同 |
| Agent | `kiro-rescue.md` — `tools: Bash` + `skills: [kiro-cli-runtime]` | 相同 |
| Skill | `kiro-cli-runtime` — `user-invocable: false` | 相同 |

### 关键差异

| 维度 | kiro-plugin-cc | codex-plugin-cc |
|---|---|---|
| CLI 调用 | `kiro-cli chat` (CLI spawn) | `codex app-server` (JSON-RPC) |
| Agent skills | 1 个 (`kiro-cli-runtime`) | 2 个（+`gpt-5-4-prompting`) |
| Prompt shaping | 无 | `gpt-5-4-prompting` skill 兹许改写转发 prompt |
| Resume 检测 | 无 | `task-resume-candidate` 命令 + 自动询问用户 |
| 工具限制 | prompt 猊语 `prompt-based` | prompt 猻语 |

## 栄因分析

### 栬因 1: Prompt-based 限制不可靠

三层防御全靠 prompt 猊语告诉 subagent "不要做 X"，但 LLM 可以忽略。即使 `tools: Bash` 限制了工具， subagent 仍通过 `Bash(node:*)` 调用 `node` 来读文件、执行代码。

**对比 codex**: codex 的 `gpt-5-4-prompting` skill 给 subagent 一个**合法的创造性任务**（改写 prompt），满足其创造欲，避免它自己做实现。

### 根因 2: Companion script 调用失败时 subagent 继续工作
当 `kiro-cli` 未被成功调用时，companion script 输出 `[WARNING]`，但 subagent 将此视为"需要帮助"，于是自己动手。
### 根因 3: 缺少 prompt-shaping 能力
kiro subagent 没有任何合法的创造性工作可做，只能等待或执行。当任务文本很有吸引力时，它倾向于自己做。

## 改进方案

### 方案 A: 添加 prompt-shaping skill（推荐）

类似 codex 的 `gpt-5-4-prompting`，创建一个 `kiro-prompt-shaper` skill：
- subagent 可以在转发前改写 prompt（但不做其他事）
- 给 subagent 一个合法的创造性出口
- 避免它因"无聊"而直接做实现

**涉及文件**:
- `plugins/kiro/skills/kiro-prompt-shaper/SKILL.md` (新建)

### 方案 B: 强化 agent 定义的 allowed-tools

在 `kiro-rescue.md` 中将 `tools: Bash` 改为更精确的限制:
```yaml
tools: Bash
allowed-tools: Bash(node:*)
```
并在 agent prompt 中增加更强的约束规则。

**涉及文件**:
- `plugins/kiro/agents/kiro-rescue.md` (修改)

### 方案 C: 让 companion script 在失败时以非零 exit code 退出

修改 `executeRescueJob` 和 `runCli`，让 kiro-cli 调用失败时:
1. companion script 返回非零 exit code
2. subagent 的 Bash 调用失败
3. "If the Bash call fails or kiro-cli cannot be invoked, return nothing" 规则生效

**涉及文件**:
- `plugins/kiro/scripts/kiro-companion.mjs` (修改)

### 推荐实施顺序

1. **方案 C** (companion script 退出码) — 最简单，最直接
2. **方案 B** (强化 agent 定义) — 加强 prompt 猎语言
3. **方案 A** (prompt-shaping skill) — 给 subagent 合法的创造性出口

## 黺议的下一步

1. 实现方案 C: companion script 在 kiro-cli 调用失败时以 exit code 1 退出
2. 实现方案 B: 强化 agent 定义的约束规则
3. 测试: 运行 `/kiro:rescue "test task"` 验证 subagent 不再自己做实现
4. (可选) 实现方案 A: prompt-shaping skill
5. 提交改动并更新缓存插件文件
