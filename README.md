# herdr-main-zh

Herdr 桌面版(main 布局)的完整简体中文界面。结构与原版一致,跟随版本维护,
当前基于 **Herdr 0.1.16**。复刻说明见 [RECIPE.md](RECIPE.md)。

![预览](preview.png)

## 安装

```sh
git clone https://github.com/ziyht/herdr-main-zh.git
cd herdr-main-zh
cp layouts/main-zh.json ~/.config/herdr-app/layouts/
cp -R mods/*-zh ~/.config/herdr-app/mods/
herdr-app do layout.switch '{"name":"main-zh"}'
```

可选主题(截图同款):`cp themes/catppuccin.json ~/.config/herdr-app/themes/`
然后 `herdr-app do app.theme --name catppuccin`。

不需要改 keys.json,不改动 Herdr.app 本体。

已装过其它 main-zh 汉化包的,直接覆盖即可(同名替换,无缝升级)。

## 可选:原生界面中文化(zh-patch)

`zh-patch/` 把设置页、命令面板、欢迎页、更新内容、反馈,以及
confirm(关闭确认)、prompt(重命名)、peek(偷看)、help(快捷键)
九个「应用每次启动会重写」的文件原地中文化并加文件锁:

```sh
cp -R zh-patch ~/.config/herdr-app/
~/.config/herdr-app/zh-patch/apply.sh          # 应用中文并锁定
osascript -e 'quit app "Herdr"'; sleep 3; open -a Herdr
```

译文与 0.1.16 源码对齐;Herdr 升级后这些文件不跟进新版
(设置页可能缺新选项),需重新移植后重新 apply。
回滚:`apply.sh --restore`。

## 升级

Herdr 升级后,把每个 `mods/<name>-zh` 与新版 `mods/<name>` 逐对 diff,
把功能差异移植进 -zh 版本(保留中文文案);`mod.json` 的
`cloned_from.version` 记录当前同步基线。zh-patch 同理
(`--restore` → 升级 → 移植 → `apply.sh`)。

## 有意保留英文

品牌「Herdr」、术语 agent/Agent、键名 Esc、主题名、命令与状态键标识符。
macOS 菜单栏菜单项与应用自身 toast 在二进制里,无法翻译。

## 致谢与许可

- Apache-2.0。`mods/*-zh` 与 `zh-patch/` 基于 Herdr 自带 mod 与 frame
  源码修改,见 [NOTICE](NOTICE)
- zh-patch 部分译文借自 [yzj160212/herdr-zh](https://github.com/yzj160212/herdr-zh)(Apache-2.0)
- 图标来自 [Lucide](https://lucide.dev)(ISC)
- 主题配色 Catppuccin Mocha
