# Hermes ↔ Herdr 状态桥

让 Herdr 把 hermes 终端识别为一等 agent:专属图标、真实状态
(干活/完成/需要你)、上下文 token 用量与进度条。

## 原理

Herdr 通过终端的 OSC 7501 转义序列识别 agent;hermes 侧用 shell hooks
在关键事件上把状态与用量写到 `~/.hermes/herdr-status/`,由汉坊的
`hanfang-spaces` / `hanfang-sidebar` 读取展示。六个事件:

| 事件 | 写入状态 |
|---|---|
| pre_llm_call | working(回合开始) |
| post_api_request | 响应含工具调用→working;无→done(回合结束) |
| pre_tool_call(clarify) | blocked(等用户输入) |
| post_tool_call(clarify) | working(用户已答) |
| on_session_end | done/idle/error(会话关闭) |
| pre_api_request | 上下文 token 数 + 模型(不表态) |

## 安装

```sh
cd hermes-bridge && ./install.sh
```

安装器会:复制 `herdr-status.py` 到 `~/.hermes/agent-hooks/`、在
`~/.hermes/config.yaml` 注册六个 hook 事件、并完成一次性授权
(`hermes hooks doctor` 应全绿)。

## 可选:启动自报(推荐)

共享 gateway 环境下,会话事件跑在后台进程里,无法直接向面板上报;
在 Herdr 终端里启动的 hermes 由 launcher 自报一次,面板即可立即识别
(图标/Agents 统计)。给 `~/.local/bin/hermes`(安装器生成的两行脚本)
加上:

```sh
if [ -n "$HC_TERMINAL_ID" ]; then
  printf '\033]7501;state=idle:app=hermes\033\\' > /dev/tty 2>/dev/null
fi
```

放在 `exec ...hermes "$@"` 之前。hermes 升级可能重新生成该文件,失效时
重新加上即可。

## 已知边界

- 桌面 App / 无终端的 hermes 会话没有面板,不在侧栏显示
- 同一目录跑两个 hermes 会话时,状态按最新活动匹配,可能串
- 子 agent(无窗格)不参与状态覆盖与进度条
