# Kiro Plugin for Claude Code 中文文档

在 Claude Code 里直接调用 [Kiro](https://kiro.dev) 做代码审查和任务委派，并通过 `kiro-cli` 直接执行 rescue 请求。

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

## 本地开发安装

如果你要基于当前仓库做本地开发，并且希望 `kiro` 命令在 Claude Code 里跨仓库可用，按下面步骤操作。

### 1. 安装当前仓库的本地 marketplace

```bash
npm run plugin:install-local
```

### 2. 在 Claude Code 里重新加载插件

```bash
/reload-plugins
/kiro:setup
```

### 3. 在任意仓库里使用命令

```bash
/kiro:review
/kiro:rescue investigate why tests are failing
/kiro:rescue --background fix the login bug
```

### 4. 修改完本仓库代码后如何更新

先刷新 Claude Code 的本地缓存：

```bash
npm run plugin:refresh-local
```

这个命令现在会先自动把插件版本号做一次 patch bump，再刷新本地 marketplace 缓存。  
如果你只想升级本地插件版本号，不立即刷新缓存，可以执行：

```bash
npm run plugin:bump-local
```

再回到 Claude Code 执行：

```bash
/reload-plugins
/kiro:setup
```

刷新脚本会按当前仓库路径自动匹配你机器上实际配置的 marketplace 名字，所以即使你本地配置成了 `kiro-companion` 这样的自定义名字，也可以直接用。

`/kiro:setup` 会检查环境是否就绪。如果 Kiro 未安装，前往 [kiro.dev](https://kiro.dev) 下载，然后执行 `!kiro login` 登录。

## 可用命令

| 命令 | 说明 |
|------|------|
| `/kiro:review` | 对当前改动做代码审查 |
| `/kiro:rescue` | 通过本地 `kiro-cli` 直接执行任务（调查 bug、尝试修复等） |
| `/kiro:status` | 查看运行中的任务 |
| `/kiro:result` | 查看已完成任务的输出 |
| `/kiro:cancel` | 取消后台任务 |
| `/kiro:setup` | 检查环境是否就绪 |

`/kiro:rescue` 现在直接调用 `kiro-companion`，不会再先转给 Claude Code 的 rescue subagent。

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
