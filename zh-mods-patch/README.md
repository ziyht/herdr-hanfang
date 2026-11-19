# zh-mods-patch

第三方 mod 的**字典式就地汉化**。mod 保存即热重载，所以应用补丁后界面立即变中文，无需重启。

## 结构

```
apply.sh / apply.py     引擎（应用 / --restore / --status）
dicts/<mod>.json        {"源码片段": "译文"}；键是源码原文片段，模板字面量保留 ${} 原样
pristine/<mod>/         首次 apply 时的原版快照（--restore 用；不含 .cache）
tools/extract.py        JS 字符串字面量提取器（递归下降，处理嵌套模板字符串）
```

## 已覆盖

| mod | 条目 | 说明 |
|---|---|---|
| better-changes | 62 | 变更面板全部界面文案 |
| herdr-nvim | 82 | 文件树/选择器/卡片/对话框/预览/通知；`recipe:` 字段刻意留英文（对齐上游 RECIPE.md 便于升级比对） |
| branch-pr | 150 | PR 面板；**发给 agent 的 prompt 刻意留英文**（对 LLM 更稳） |
| branch-issue | 106 | 议题面板；同样 prompt 留英文 |

## 翻译约定（与 -zh 系列一致）

- Agent / Worktree / Herdr / nvim / PR 等术语保留英文
- 全角标点、… 省略号；加载中… / 正在加载文件… 等 files-zh 既有句式
- `pad(n, "词")` 有英文复数加 s 的行为，中文必须传两个参数：`pad(n, "条话题", "条话题")`

## 写字典的坑（重要）

- **短词必须带上下文前缀**：`label: "Merge"`、`what: "move"`、`merged("Merge")`、`], "move")`。
  裸引号键（`"move"`）会同时命中 tree-keys.js 的动作 id `on: { m: "move" }`，打断按键分发。
- **模板键保留 ${} 原文**：`No pull requests from ${this.branch}.`
- **弯引号**：上游有 `PR’s`（U+2019），不是 `PR's`
- 转义反引号：源码里是 `` \` ``，键要含反斜杠
- 对象 key / id（`key: "agents"`、`id: "all"`）绝对不译，只译 `label:`

## 升级流程

1. 升级 mod 本体（herdr-nvim 重跑 installer；branch-pr/branch-issue `go -C helper run ./install --update`；其他 rsync）
2. `./apply.sh`——匹配到的自动翻译；未匹配的列出来
3. 把未匹配的（上游改了措辞）补进 dicts/*.json 再跑一次
4. herdr-nvim 升级还会重置 herdr-nvim-header 的 pane-zh 底座(按仓库 NOTICE 所述重新修改)
