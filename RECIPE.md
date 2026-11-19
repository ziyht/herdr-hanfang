# 汉坊 · 中文工作台

一套中文的 Herdr 桌面工作台:自 main 布局衍生的骨架上,把侧栏、标签栏、
变更面板、文件查看全面升级为社区最强的 mod 组合,并与一套中文界面
(窗口框架、右键菜单、通知、状态栏、设置页等)融合。跟随 Herdr 0.1.16 维护。

![汉坊](preview.png)

## 你会看到什么

- 左侧 268px 侧栏:顶部品牌行(中文「设置」「添加机器」),
  better-sidebar 接管空间与 agent 列表——每个空间名旁带当前 Git 分支,
  仓库的 PR 状态显示在右侧(需 GitHub CLI),worktree 空间嵌套在所属仓库下
- 顶部 42px 标签栏:better-tabs——可拖动、可换行的标签,工具栏面板按钮带 ⋮ 菜单
- 中央终端:10px 圆角卡片;窗格表头是 herdr-nvim-header,显示程序/会话名与状态
- 右侧 300px 可隐藏面板,五个标签页:
  文件(herdr-nvim:完整 Neovim 文件树与编辑)、变更(better-changes:提交框+diff)、
  Pull Requests(branch-pr)、Issues(branch-issue)、浏览(better-files 只读文件浏览器)
- 底部 28px 状态栏(中文):本机/机器名、分支、「N 个 agent」「N 个需要你」
- 底部右下角浮动小块:herdr-nvim 同步指示
- 主题跟随你的设置;仓库附带 Catppuccin Mocha 主题文件,可选安装

## 行为

- agent 状态:working 转圈;blocked 红底「需要你」徽章;done 绿点;idle 空心圈
- 右键终端内容:中文菜单(向右/向下分屏、缩放、关闭、右键交给程序)
- 空间右键菜单、工作树对话框(新建/打开/移除)均为中文
- 通知条中文:agent 完成/需要你提醒;机器需要登录时显示「需要登录:运行 …」带「复制」
- 「添加机器」对话框中文(ssh 主机列表、登录指引、断连警告)
- herdr-nvim:⌘E 打开文件树面板,⌘O 列出 agent 刚读写的文件,
  在 nvim 里写的注释可连同 file:line 发给 agent(需合并 3 个键位,见构成)

## 构成

- 布局 `layouts/hanfang.json`(自 main 0.1.16 克隆演化):
  root row [sidebar(brand 46 → workspace-chrome-zh / better-sidebar / footer 69 →
  workspace-chrome-zh), work(tabs 42 → better-tabs / work-body(main: tab active +
  herdr-nvim-header 表头 / panel 300 stack: herdr-nvim · better-changes ·
  branch-pr · branch-issue · better-files) / status 28 → workspace-status-zh)];
  根字段 toast=toast-zh、terminal_menu=menu-zh、floating herdr-nvim-sync
- 中文 mod(9 个,-zh 家族,基于 0.1.16 源码翻译):workspace-chrome-zh、
  workspace-status-zh、menu-zh、toast-zh、machine-add-zh、picker-zh、
  worktree-zh、pane-zh、files-zh(供 herdr-nvim 还原原面板)
- 社区 mod(8 个,英文原版打包):better-sidebar / better-tabs / better-changes /
  better-files(munza/herdr-mods,Apache-2.0)、branch-pr(munza,需 GitHub CLI)、
  branch-issue(munza,需 LINEARAPIKEY 环境变量)、
  herdr-nvim / herdr-nvim-header(ChmaraX/herdr-nvim,MIT;header 已改为引用 pane-zh)
- `zh-mods-patch/`(社区面板中文化):字典式就地翻译引擎 + 6 个字典
  (better-sidebar 47 / better-tabs 15 / better-changes 62 / herdr-nvim 82 /
  branch-pr 149 / branch-issue 105 条,共约 460 条译文)。社区 mod 是用户文件,
  保存即热重载,无需重启;发给 agent 的 prompt 刻意保留英文(对 LLM 更稳)
- 可选键位(合并进 keys.json 的 global 段):
  `"cmd-e": "mod.open:herdr-nvim"`、`"cmd-o": "herdr-nvim.pick"`、
  `"cmd-shift-e": "herdr-nvim.reveal"`
- 运行依赖:Neovim(文件面板)、GitHub CLI(branch-pr)、Linear API key(branch-issue);
  缺失时对应面板为空但不影响其它部分
- `zh-patch/`(可选):设置页、命令面板、欢迎页、更新内容、反馈、
  confirm/prompt/peek/help 九个应用自带界面的中文化文件锁补丁

## 注意

- 需要 Herdr ≥ 0.1.16
- 界面语言混合:窗口框架、终端右键、通知、状态栏、设置页(zh-patch)为中文;
  better-* 与 branch-* 面板本身为英文(社区原版)
- -zh mod 是用户克隆,Herdr 升级不自动更新:与 `mods/<name>` 原版逐对 diff
  移植功能差异;zh-patch 锁定文件同理,`apply.sh --restore` 可整体回滚
- 有意保留英文:品牌「Herdr」、术语 agent、键名 Esc、主题名
- macOS 菜单栏菜单项、应用自身 toast 在二进制里,无法翻译

## 验收

- 17 个 mod 全部 `herdr-app check` 通过,`herdr-app status` errors 为空
- `layout.switch {"name":"hanfang"}` 后:侧栏显示分支与 PR 状态,
  标签栏可拖动换行,右键终端出中文菜单,状态栏显示「N 个 agent」
- ⌘E 打开 nvim 文件树(装好 Neovim 后);面板五个标签页可切换
- zh-mods-patch 应用后:变更、PR、议题面板与 nvim 文件树的界面文案为中文
  (发给 agent 的 prompt 保持英文)
- zh-patch 应用并重启后,设置页与命令面板为中文
