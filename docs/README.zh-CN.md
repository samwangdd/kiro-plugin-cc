# Kiro Plugin for Claude Code 中文文档

在 Claude Code 里直接调用 [Kiro](https://kiro.dev) 做代码审查和任务委派。

灵感来自 [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)。[English](../README.md)

## 前置条件

- 已安装并登录 [Kiro CLI](https://kiro.dev)
- Node.js >= 20.11

## 安装

在 Claude Code 中依次执行：

```bash
/plugin marketplace add samwangdd/kiro-plugin-cc
/plugin install kiro@samwangdd-kiro
/reload-plugins
/kiro:setup
```

`/kiro:setup` 会检查环境是否就绪。如果 Kiro 未安装，前往 [kiro.dev](https://kiro.dev) 下载，然后执行 `!kiro login` 登录。

## 可用命令

| 命令 | 说明 |
|------|------|
| `/kiro:review` | 对当前改动做代码审查 |
| `/kiro:rescue` | 把任务交给 Kiro 处理（调查 bug、尝试修复等） |
| `/kiro:status` | 查看运行中的任务 |
| `/kiro:result` | 查看已完成任务的输出 |
| `/kiro:cancel` | 取消后台任务 |
| `/kiro:setup` | 检查环境是否就绪 |

## 快速上手

```bash
# 审查代码
/kiro:review

# 让 Kiro 调查问题
/kiro:rescue investigate why tests are failing

# 后台执行长时间任务
/kiro:rescue --background fix the login bug
/kiro:status
/kiro:result
```

## 开发

```bash
npm install
npm test
```

## 许可证

Apache-2.0
