# Hermes ↔ Herdr 状态桥

让 Herdr 把 hermes 终端识别为一等 agent:专属图标、真实状态
(干活/完成/需要你)、上下文 token 用量与进度条。

## 原理

Herdr 通过终端的 OSC 7501 转义序列识别 agent;hermes 侧用 shell hooks
在关键事件上把状态与用量写到 `~/.hermes/herdr-status/term/`,由汉坊的
`hanfang-sidebar`(轨道视图与 Agents 视图)读取展示。六个事件:

| 事件 | 写入状态 |
|---|---|
| pre_llm_call | working(回合开始) |
| post_api_request | 响应含工具调用→working;无→done(回合结束) |
| on_human_input_request | blocked(等用户:提问/审批/sudo,kind 分别为 question/permission/auth) |
| on_human_input_resolved | working(用户已响应) |
| on_session_end | done/idle/error(会话关闭) |
| pre_api_request | 上下文 token 数 + 模型(不表态) |

**按终端键直查,不猜窗格**:hermes 跑在 Herdr 终端里时,环境变量
`HC_TERMINAL_ID` 就是该窗格的终端 id,hook 以它为键写
`term/<HC_TERMINAL_ID>.json`(id 里的 `/` 换成 `_`,其余原样);UI 拿
`pane.terminal` 直接拼文件名读,没有 cwd 匹配、没有时效推断、没有汇总表。

没有 `HC_TERMINAL_ID` 的会话(gateway 后台会话、cron、桌面 App、子 agent)
不属于任何窗格,**不落任何文件**——物理隔离,不会串到别的窗格。

记录字段(JSON 对象):

| 字段 | 含义 |
|---|---|
| state | working / done / blocked / idle / error |
| session_id | hermes 会话 id(UI 靠它判断状态跳变,决定是否提示音) |
| ts | 最后写入时间(unix 秒) |
| context_tokens | 上下文 token 数,仅 pre_api_request 写入(可缺) |
| model | 模型名,仅 pre_api_request 写入(可缺) |

写入是**增量合并**:只覆盖本事件带来的字段,其余保留(所以 context_tokens /
model 整轮都在);tmp + `os.replace` 原子替换,UI 不会读到半截文件。
`on_session_end` 直接删除该终端的记录;每次写入顺带清扫 `term/` 下 7 天
没更新的记录,用 `.gc` marker 的 mtime 节流到每小时最多一次。
根目录不再放会话 json 和 `_latest.json`,残留的旧格式由 hook 运行时清掉。

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

- 桌面 App / 无终端的 hermes 会话没有面板,不在侧栏显示(也不落盘,物理隔离)
- 同一目录跑两个 hermes 会话互不影响:状态按终端键精确查,不再按 cwd 匹配
- 子 agent(无窗格)不参与状态覆盖与进度条
- 远端机器的 hermes 窗格读不到记录(状态文件只写在本机 home;与旧实现范围相同)
