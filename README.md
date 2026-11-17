# herdr-hanfang(汉坊)

中文的 Herdr 桌面工作台:main 布局的骨架 + 社区最强 mod 组合
(better-sidebar / better-tabs / better-changes / herdr-nvim / branch-pr /
branch-issue / better-files)+ 全套中文界面。基于 **Herdr 0.1.16**。
复刻说明见 [RECIPE.md](RECIPE.md)。

![预览](preview.png)

## 安装

```sh
git clone https://github.com/ziyht/herdr-hanfang.git
cd herdr-hanfang
mkdir -p ~/.config/herdr-app/layouts ~/.config/herdr-app/mods
cp layouts/hanfang.json ~/.config/herdr-app/layouts/
cp -R mods/* ~/.config/herdr-app/mods/
herdr-app do layout.switch '{"name":"hanfang"}'
```

可选主题:`cp themes/catppuccin.json ~/.config/herdr-app/themes/`
然后 `herdr-app do app.theme --name catppuccin`。

可选键位(herdr-nvim,合并进 keys.json 的 global 段,勿整份覆盖):

```json
"cmd-e": "mod.open:herdr-nvim",
"cmd-o": "herdr-nvim.pick",
"cmd-shift-e": "herdr-nvim.reveal"
```

运行依赖(缺失只影响对应面板):Neovim(文件面板)、
GitHub CLI(branch-pr)、`LINEARAPIKEY` 环境变量(branch-issue)。

不需要改 Herdr.app 本体。

## 可选:原生界面中文化(zh-patch)

`zh-patch/` 把设置页、命令面板、欢迎页、更新内容、反馈,以及
confirm(关闭确认)、prompt(重命名)、peek(偷看)、help(快捷键)
九个「应用每次启动会重写」的文件原地中文化并加文件锁:

```sh
cp -R zh-patch ~/.config/herdr-app/
~/.config/herdr-app/zh-patch/apply.sh          # 应用中文并锁定
osascript -e 'quit app "Herdr"'; sleep 3; open -a Herdr
```

执行时机:装包后跑一次并重启即可;文件锁跨 Herdr 重启、跨系统重启一直有效,
日常使用无需再跑。唯一需要重跑的时机是 Herdr 升级后——不跑的后果是设置页
等界面保持中文但停留在当前版本,新版新增的选项不会出现(不会崩溃)。
`apply.sh --status` 随时查看九个文件的锁定状态,`--restore` 一键回滚英文。
译文与 0.1.16 源码逐行对齐,升级后需重新移植再 apply。

## 升级

Herdr 升级后,把每个 `mods/<name>-zh` 与新版 `mods/<name>` 逐对 diff,
把功能差异移植进 -zh 版本(保留中文文案);`mod.json` 的
`cloned_from.version` 记录当前同步基线。zh-patch 同理
(`--restore` → 升级 → 移植 → `apply.sh`)。

## 语言说明

窗口框架、终端右键菜单、通知、状态栏、工作树对话框、设置页(zh-patch)为中文;
better-* 与 branch-* 社区面板为英文原版。品牌「Herdr」、术语 agent、
键名 Esc、主题名有意保留英文。macOS 菜单栏菜单项与应用自身 toast
在二进制里,无法翻译。

## 致谢与许可

- Apache-2.0,见 [LICENSE](LICENSE)、[NOTICE](NOTICE)
- better-sidebar / better-tabs / better-changes / better-files /
  branch-pr / branch-issue 来自 [munza/herdr-mods](https://github.com/munza/herdr-mods)(Apache-2.0)
- herdr-nvim / herdr-nvim-header 来自 [ChmaraX/herdr-nvim](https://github.com/ChmaraX/herdr-nvim)(MIT,header 有本地修改)
- `mods/*-zh` 与 `zh-patch/` 基于 Herdr 自带 mod 与 frame 源码翻译;
  zh-patch 部分译文借自 [yzj160212/herdr-zh](https://github.com/yzj160212/herdr-zh)(Apache-2.0)
- 图标来自 [Lucide](https://lucide.dev)(ISC);主题配色 Catppuccin Mocha
