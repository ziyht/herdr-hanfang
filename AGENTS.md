# AGENTS.md — 汉坊仓库工作须知

给在本仓库干活的 agent(任何品牌)。人读 README.md,复刻看 RECIPE.md;这里是**协作规则与坑**。

## 这是什么

Herdr 桌面版的中文工作台发布包:布局 `hanfang.json` + mod 全家桶 + 三层汉化。
运行现场在 `~/.config/herdr-app/`,本仓库是发布母本。**两边要同步改**(改完现场
记得拷回仓库对应文件;反之亦然)。

## 四层架构(改动前先定位你要动的层)

1. **布局层** `layouts/hanfang.json` — 窗口结构,树形 JSON,热重载
2. **-zh 翻译族** — shipped mod 的中克隆(menu-zh 等),按 0.1.16 源码逐行对齐
3. **zh-mods-patch 字典** — 社区 mod 英文底版 + dicts/*.json 就地替换;
   **不变量:`pristine/<mod>` + dict == 现场 mod**,任何改动后必须复核
4. **hanfang- 自制/分叉族** — 我们自己的东西,一律 `hanfang-` 前缀:
   - `hanfang-spaces` 侧栏轨道(空间行+终端图标横排)
   - `hanfang-sidebar` better-sidebar 的分叉(agents 视图增强)
   - `hanfang-tip` 悬停信息弹层
   - 社区原版(better-sidebar 等)保持干净休眠,换回=改布局一行

## 硬规则

- **不要主动 git commit/push**——用户明说才动
- **不要直接编辑 `~/.hermes/config.yaml`**(工具会拦)——用 `hermes config set <key> '<json>'`
- hermes 的 launcher(`~/.local/bin/hermes`)是安装器生成的,升级会覆盖;里面的
  OSC 自报段丢了按 `hermes-bridge/README.md` 恢复
- 改 hook 脚本后 mtime 漂移:`hermes hooks revoke <cmd>` 再
  `hermes --accept-hooks -z "回复:ok"` 重授权
- mod 改动用 `herdr-app check <路径>` 验证;按名字 check 在有机器失联时会全体
  失效(已知 bug),用绝对路径
- 布局块的显示/隐藏状态存 `layouts/.state/`,不在布局文件里——查 hidden 去
  `.state`;`herdr-app do layout.show --id <块id>` 恢复

## Hermes↔Herdr 集成要点(hermes-bridge/)

- 识别链:OSC 7501(`\x1b]7501;state=<s>:app=hermes\x1b\\`,s∈working/idle/
  done/blocked/error;blocked 带 kind=question/permission/auth)
- **回合级状态**(易踩坑):
  - `on_session_end` 是会话结束,不是回合结束——交互式会话永不触发
  - 回合结束信号 = `post_api_request` 的 `extra.assistant_tool_call_count`(0=done)
  - 等人 = `on_human_input_request`(审批/sudo/clarify 统一),**不要**用
    pre_tool_call 特判(会漏审批)
  - 被"总是允许"自动放行的命令不阻塞,状态保持 working 是对的
- 共享 gateway 架构:CLI 只是面板前端,会话与 hooks 跑在 gateway(无 tty、
  无 HC_TERMINAL_ID)——所以状态走落盘文件(`~/.hermes/herdr-status/`),
  mod 按 `pane.cwd === session_cwd` 匹配(会话真实 cwd 查 state.db)
- GLM-5.3 窗口 1M(查 `~/.hermes/models_dev_cache.json`,勿猜)

## 验收清单(动过东西后)

- 三个 hanfang mod:`herdr-app check` 通过、无 `*.error` 文件
- zh-mods-patch 不变量:pristine+dict == 现场(对 better-sidebar 尤其)
- 现场与仓库 diff 一致后才算同步完
