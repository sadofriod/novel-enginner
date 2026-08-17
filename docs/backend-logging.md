# 后端日志系统文档

## 概述

后端已集成完整的结构化日志系统，使用 **Pino** 作为日志库。系统提供了在开发环境和生产环境中都能清晰读取的日志输出。

## 日志特性

### 1. **结构化日志记录**
所有日志都是结构化的，包含以下标准字段：
- `timestamp`: ISO 8601 时间戳
- `level`: 日志级别（debug, info, warn, error, fatal）
- `module`: 模块名称（便于识别日志来源）
- 自定义上下文数据（workspaceId, commandId, duration 等）

### 2. **环境感知的输出格式**

#### 开发环境 (`NODE_ENV !== 'production'`)
- 使用 `pino-pretty` 进行彩色格式化
- 时间戳以人类可读格式显示
- 单行输出（可选）
- 隐藏 pid 和 hostname

示例：
```
[2026-08-17 10:15:23.501 +0000] INFO: HTTP request completed
    module: "routes"
    method: "POST"
    pathname: "/commands"
    status: 202
    duration: "0.07"
```

#### 生产环境 (`NODE_ENV === 'production'`)
- 输出 JSON 格式日志
- 标准 JSON Lines 格式（每行一个 JSON 对象）
- 便于日志聚合系统解析

### 3. **日志级别配置**

通过 `LOG_LEVEL` 环境变量控制：

```bash
# 默认为 'info'
LOG_LEVEL=debug   # 启用详细调试日志
LOG_LEVEL=info    # 标准日志（默认）
LOG_LEVEL=warn    # 仅显示警告及以上
LOG_LEVEL=error   # 仅显示错误及以上
```

## 主要模块的日志

### 1. **API 路由层** (`packages/services/src/runtime/api-server/routes/routes.ts`)

#### HTTP 请求日志
```typescript
logger.info({ method, pathname, status, duration }, 'HTTP request completed');
```

包含的信息：
- 请求方法和路径
- 响应状态码
- 处理时间（毫秒）

#### 命令处理日志
```typescript
logger.info({ 
  commandId, 
  runId, 
  intent, 
  duration, 
}, 'Command accepted and finalized');
```

### 2. **命令处理器** (`packages/services/src/runtime/command-handler.ts`)

#### 命令验证日志
```typescript
logger.debug({ intent, workspaceId, bookId }, 'Command envelope schema parsed');
logger.warn({ intent, error }, 'Command envelope cross-field validation failed');
```

#### 命令执行日志
```typescript
logger.info({ 
  intent, 
  workspaceId, 
  bookId 
}, 'Processing command');

logger.info({ 
  commandId, 
  runId, 
  intent, 
  nextExpectedState 
}, 'Command accepted');
```

### 3. **事件总线** (`packages/services/src/runtime/event-bus.ts`)

#### 事件发布日志
```typescript
logger.debug({ 
  runId, 
  eventId, 
  eventType 
}, 'Event published');
```

#### 监听器日志
```typescript
logger.debug({ runId, listenerCount }, 'Broadcasting event to listeners');
logger.error({ runId, eventId, error }, 'Error invoking event listener');
```

## 使用日志的最佳实践

### 1. **日志级别选择**

| 级别 | 用途 | 示例 |
|------|------|------|
| `trace` | 最详细的追踪信息 | 流中的每个事件 |
| `debug` | 调试信息 | 模块初始化、状态变化 |
| `info` | 重要操作 | 请求开始/完成、命令接受 |
| `warn` | 警告信息 | 验证失败、缺失资源 |
| `error` | 错误信息 | 异常、操作失败 |
| `fatal` | 致命错误 | 无法恢复的错误 |

### 2. **上下文信息**

始终包含足够的上下文信息，便于追踪问题：

```typescript
// 好的做法
logger.info({ 
  workspaceId, 
  bookId, 
  commandId, 
  runId, 
  duration 
}, 'Operation completed');

// 不够的做法
logger.info('Operation completed');
```

### 3. **性能日志**

对于关键操作，记录执行时间：

```typescript
const startTime = performance.now();
// ... 执行操作
const duration = performance.now() - startTime;
logger.info({ duration: duration.toFixed(2) }, 'Operation duration');
```

### 4. **错误日志**

捕获和记录错误的完整信息：

```typescript
try {
  // ... 代码
} catch (error) {
  logger.error({
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }, 'Operation failed');
}
```

## 创建子日志器

每个模块应该创建自己的日志器：

```typescript
import { createChildLogger } from '../common/logger';

const logger = createChildLogger('module-name', {
  // 可选的初始上下文
  workspaceId: 'workspace-123',
});
```

所有来自该日志器的日志都会自动包含 `module: 'module-name'` 字段。

## 生产环境部署

### 环境变量配置

```bash
# 设置日志级别
export LOG_LEVEL=info

# 设置运行环境
export NODE_ENV=production

# Pino 会自动输出 JSON Lines 格式
```

### 日志收集

在生产环境中，将日志从 stdout 导向日志聚合系统：

```bash
# 使用 systemd journal
node server.ts | journalctl -i

# 使用 Docker
# 在 docker-compose.yml 中配置日志驱动
```

### 日志查询示例

使用标准 JSON 工具查询日志：

```bash
# 查看所有错误
cat logs.jsonl | grep '"level":50'

# 查看特定模块的日志
cat logs.jsonl | jq 'select(.module=="routes")'

# 查看特定命令的日志
cat logs.jsonl | jq 'select(.commandId=="cmd-000001")'
```

## 性能影响

- **开发环境**: 使用 `pino-pretty` 会有轻微性能开销，但提供更好的可读性
- **生产环境**: Pino 是高性能的日志库，对应用性能影响极小
- **日志级别**: `debug` 和 `trace` 级别应仅在开发环境使用

## 故障排查

### 查看所有日志
```bash
LOG_LEVEL=trace pnpm dev:services
```

### 跟踪特定请求
```bash
LOG_LEVEL=debug pnpm dev:services 2>&1 | grep "pathname=/your/path"
```

### 性能分析
查看 `duration` 字段来识别慢操作：
```bash
pnpm dev:services 2>&1 | grep "duration" | grep -E 'duration.*[5-9]\d+|duration.*[0-9]{4,}'
```

## 相关文件

- [Logger 工具](../packages/services/src/common/logger.ts)
- [路由日志](../packages/services/src/runtime/api-server/routes/routes.ts)
- [命令处理日志](../packages/services/src/runtime/command-handler.ts)
- [事件总线日志](../packages/services/src/runtime/event-bus.ts)
