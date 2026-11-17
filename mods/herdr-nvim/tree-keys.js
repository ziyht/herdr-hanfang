// The tree's keys, in one table: tree-view.js runs them (each keystroke
// names an action, a method of Tree.actions), keys-help.js lists them (`?`),
// and RECIPE.md's key table is this table (`node tree-keys.js` prints it;
// the e2e checks the recipe still matches).
//
// An entry: its help group, how the list shows its keys (`label`) and what
// they do (`what`, short; `recipe`, the recipe's longer line), and `on`:
// keystroke (as GPUI names it, or the typed character) → action.

const KEYS = [
  { group: "导航", label: "j k  ↓ ↑", md: "`j`/`k`, ↓/↑", what: "移动", recipe: "move",
    on: { j: "down", down: "down", k: "up", up: "up" } },
  { group: "导航", label: "g G", md: "`g`/`G`", what: "第一个 / 最后一个", recipe: "first / last row",
    on: { g: "first", G: "last" } },
  { group: "导航", label: "l  ⏎  →", md: "`l`, ⏎, →", what: "在 nvim 中打开，或展开文件夹",
    recipe: "open the file in the tab's nvim (it takes the keyboard), or open/close the folder",
    on: { l: "open", enter: "open", right: "open" } },
  { group: "导航", label: "h  ←", md: "`h`, ←", what: "关闭文件夹",
    recipe: "close the folder (the open one, else the row's) and stand on it", on: { h: "close", left: "close" } },
  { group: "导航", label: "/", md: "`/`", what: "查找文件",
    recipe: "find: type to fuzzy-search every file under the root (fff); ⏎ opens, Esc returns", on: { "/": "find" } },
  { group: "导航", label: "⌫", md: "Backspace", what: "根目录：上一级", recipe: "root up a folder",
    on: { backspace: "rootUp" } },
  { group: "导航", label: ".", md: "`.`", what: "根目录：此文件夹", recipe: "the row's folder becomes the root",
    on: { ".": "rootHere" } },
  { group: "导航", label: "~", md: "`~`", what: "根目录：回到 tab 的文件夹", recipe: "root: back to the tab's folder",
    on: { "~": "rootHome" } },
  { group: "导航", label: "q  Esc", md: "`q`, Esc", what: "回到 nvim",
    recipe: "back to the tab's nvim (Snacks closes its window; here the pair closes with cmd-e)",
    on: { q: "leave", escape: "leave" } },
  { group: "文件", label: "a", md: "`a`", what: "新建文件（以 / 结尾建文件夹）",
    recipe: "new file in the row's folder (a dialog); end with `/` for a folder; a new file opens in nvim", on: { a: "add" } },
  { group: "文件", label: "r", md: "`r`", what: "重命名",
    recipe: "rename (a path in the root; nvim's buffers, unsaved edits and language servers follow)", on: { r: "rename" } },
  { group: "文件", label: "Tab", md: "Tab", what: "选中", recipe: "select the row (●) for `m`, `c`, `d`, `y`",
    on: { tab: "pick" } },
  { group: "文件", label: "m", md: "`m`", what: "移动所选到此处（无选中：重命名）",
    recipe: "move the selected rows into the row's folder (confirm); with none selected, rename", on: { m: "move" } },
  { group: "文件", label: "c", md: "`c`", what: "复制所选到此处（无选中：复制为新名）",
    recipe: "copy the selected rows into the row's folder (confirm); with none, copy to a new name", on: { c: "copy" } },
  { group: "文件", label: "d", md: "`d`", what: "删除",
    recipe: "delete (confirm); to the trash when the person's Snacks says so; their buffers close", on: { d: "delete" } },
  { group: "文件", label: "y p", md: "`y` / `p`", what: "复制路径 / 粘贴到此处",
    recipe: "yank the paths into nvim's register / paste those files into the row's folder", on: { y: "yank", p: "paste" } },
  { group: "文件", label: "o", md: "`o`", what: "用系统应用打开", recipe: "open with the system's app",
    on: { o: "systemOpen" } },
  { group: "视图", label: "H", md: "`H`", what: "隐藏文件", recipe: "show hidden files (starts as the person's Snacks explorer has it)",
    on: { H: "hidden" } },
  { group: "视图", label: "I", md: "`I`", what: "git 忽略的文件", recipe: "show git-ignored files (starts as the person's Snacks explorer has it)",
    on: { I: "ignored" } },
  { group: "视图", label: "Z", md: "`Z`", what: "折叠所有文件夹", recipe: "close every folder", on: { Z: "collapse" } },
  { group: "视图", label: "u", md: "`u`", what: "重新列出", recipe: "list again", on: { u: "reload" } },
  { group: "视图", label: "?", md: "`?`", what: "this list", recipe: "every key, in a list", on: { "?": "help" } },
];

// The tree key's row (herdr-nvim's `[app] tree_key`, read from nvim).
const TREE_KEY_ROW = { group: "导航", what: "隐藏文件树，回到 nvim（在 nvim 中：显示它）",
  md: "the tree key (`space` `e`)", recipe: "hide the tree, back to nvim (nvim stays)" };

// keystroke → action.
export const ACTIONS = new Map(KEYS.flatMap((entry) => Object.entries(entry.on)));

// The help list's groups, in order: [title, [[label, what], ...]], with the
// tree key's row when it has one.
export function helpGroups(treeKey) {
  const groups = [];
  for (const entry of KEYS) {
    let group = groups.find(([title]) => title === entry.group);
    if (!group) groups.push((group = [entry.group, []]));
    group[1].push([entry.label, entry.what]);
  }
  if (treeKey) groups.find(([title]) => title === TREE_KEY_ROW.group)[1].push([treeKey, TREE_KEY_ROW.what]);
  return groups;
}

// RECIPE.md's table.
export function recipeTable() {
  const rows = [...KEYS, TREE_KEY_ROW].map((entry) => `| ${entry.md} | ${entry.recipe} |`);
  return ["| Key | Does |", "|---|---|", ...rows].join("\n");
}

// `node tree-keys.js`: print the recipe's table.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("tree-keys.js")) console.log(recipeTable());
