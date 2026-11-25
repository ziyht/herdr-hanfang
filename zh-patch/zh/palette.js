// The frame's command palette: everything you can do, by name, with its key.
// Places (spaces, tabs) stay in the picker. Fuzzy: your letters in
// order, word starts and runs rank higher. Empty: recent first, then every
// group. Choices are entries of their own ("Layout: Zen"); commands that need
// a name ask for it. Mods add entries of their own with `palette` in their
// mod.json. Enter runs, ↑/↓ move, Esc closes.
// The app's own mod: rewritten from the binary on every start.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exists, readdir, readFile } from "fs/promises";
import { appHome, commands, layouts, keys, run, theme, themes, settings, props, closeOverlay, openOverlay, shared, window as win } from "herdr";

// The list keeps one height while you move: rows and group titles have fixed
// heights, and the window shows as many as fit in LIST_H.
// 10 rows: with the search line it fits the popup (at most 85% of the
// window) down to ~580 px windows at zoom 1.3.
const SHOWN = 10;
const ROW_H = 32;
const HEAD_H = 26;
const LIST_H = SHOWN * ROW_H;
const GROUPS = ["最近使用", "标签页", "窗格", "空间", "布局", "终端", "agent", "窗口", "模块", "应用"];

// 分类标题各自上色(只用主题槽,不硬编码):分组一眼可辨,标题前再加一小段色条。
const GROUP_SLOTS = {
  "最近使用": "muted", "标签页": "ansi4", "窗格": "ansi5", "空间": "ansi2", "布局": "ansi3",
  "终端": "ansi6", agent: "ansi5", "窗口": "ansi4", "模块": "ansi3", "应用": "ansi6",
};
const groupColor = (t, name) => t[GROUP_SLOTS[name]] ?? t.accent;

// 主题里的 ansi 槽在本机这个深色主题下偏暗,直接用来当标题色对比不够:
// 往前台色调一半,既保留各分组的色相,又比条目文字更醒目。
const asHex = (c) => {
  const s = typeof c === "string" ? c.trim() : "";
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  return m ? m[1] : null;
};
const mix = (a, b, k) => {
  const A = asHex(a), B = asHex(b);
  if (!A || !B) return a;
  const out = [0, 2, 4].map((i) => {
    const x = parseInt(A.slice(i, i + 2), 16), y = parseInt(B.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
};
const groupInk = (t, name) => mix(groupColor(t, name), t.foreground, 0.25); // 保留色相,只提亮两成半

// The palette's names for commands: [command, args, group, title, keywords].
const NAMED = [
  ["tab.new", {}, "标签页", "新建标签页", "tab agent new task agent 任务"],
  ["mod.open", { name: "picker-zh" }, "标签页", "跳转到空间或标签页…", "switch jump find 切换 跳转 查找"],
  ["tab.rename", {}, "标签页", "重命名标签页", "tab"],
  ["tab.close", {}, "标签页", "关闭标签页", "tab kill 关闭"],
  ["tab.next", {}, "标签页", "下一个标签页", "tab"],
  ["tab.prev", {}, "标签页", "上一个标签页", "tab"],
  ["pane.split", { direction: "right" }, "窗格", "向右分屏", "vertical"],
  ["pane.split", { direction: "down" }, "窗格", "向下分屏", "horizontal"],
  ["pane.close", {}, "窗格", "关闭窗格", "kill"],
  ["pane.zoom", {}, "窗格", "放大窗格", "maximize fullscreen 最大化 全屏"],
  ...["left", "right", "up", "down"].map((d) => ["pane.go", { direction: d }, "窗格", `聚焦窗格 ${d}`, "移动 前往"]),
  ...["left", "right", "up", "down"].map((d) => ["pane.swap", { direction: d }, "窗格", `交换窗格 ${d}`, "移动"]),
  ["space.new", {}, "空间", "新建空间", "workspace"],
  ["space.rename", {}, "空间", "重命名空间", "workspace"],
  ["space.close", {}, "空间", "关闭空间", "workspace kill 关闭"],
  ["space.next", {}, "空间", "下一个空间", "workspace"],
  ["space.prev", {}, "空间", "上一个空间", "workspace"],
  ["layout.switch", {}, "布局", "下一个布局", "look switch 外观 切换"],
  ["layout.reset", {}, "布局", "重置布局", "new version default restore herdr's 默认 恢复"],
  ["layout.clone", {}, "布局", "复制布局", "clone copy customize 克隆 定制"],
  ["mod.clone", {}, "布局", "复制模块", "clone copy customize 克隆 定制"],
  ["terminal.open", {}, "终端", "新建终端", "shell"],
  ["terminal.copy", {}, "终端", "复制", "clipboard"],
  ["terminal.paste", {}, "终端", "粘贴", "clipboard"],
  ["agent.next", {}, "agent", "下一个agent", ""],
  ["agent.prev", {}, "agent", "上一个agent", ""],
  ["window.minimize", {}, "窗口", "最小化窗口", ""],
  ["window.maximize", {}, "窗口", "最大化窗口", "restore"],
  ["window.close", {}, "窗口", "关闭窗口", "quit"],
  ["app.settings", {}, "应用", "设置", "设置 首选项 选项 配置 外观 字体 主题 声音"],
  ["app.help", {}, "应用", "快捷键", "按键 键位 快捷键 帮助"],
  ["app.welcome", {}, "应用", "欢迎页", "介绍 开始 引导"],
  ["app.whats_new", {}, "应用", "更新内容", "发布 变更 新闻 更新"],
  ["app.reset", {}, "应用", "恢复到默认界面", "escape hatch broken restore 恢复 修复 重置"],
  ["app.zoom_in", {}, "应用", "放大界面", "bigger font size 字体"],
  ["app.zoom_out", {}, "应用", "缩小界面", "smaller font size 字体"],
  ["app.zoom_reset", {}, "应用", "还原缩放", "font size 字体"],
  ["pane.rename", {}, "窗格", "重命名窗格", "pane name 重命名 名称"],
  ["app.check_updates", {}, "应用", "检查更新", "update herdr core 更新 检查"],
  ["app.update_core", {}, "应用", "更新 herdr-core", "core update 核心 更新"],
  ["app.update", {}, "应用", "重启并安装更新", "restart update 重启 安装 更新"],
  ["app.feedback", {}, "应用", "发送反馈", "feedback 反馈 意见"],
  ["app.quit", {}, "应用", "退出 Herdr", "exit"],
];

// Commands that act on something you point at (ids, terminals): not for a list.
const HIDDEN = new Set([
  "space.move", "tab.move", "space.select", "tab.select", "pane.focus", "terminal.keep",
  "terminal.park", "terminal.kill", "terminal.show", "agent.focus", "layout.set", "layout.toggle",
  "layout.show", "layout.hide", "layout.resize", "layout.select", "mod.open", "overlay.close",
  "tab.settle", "tab.unsettle",
  "app.palette", "app.hide", "app.hide_others", "app.show_all", "app.theme", "app.settings",
  // 0.1.18 新增的终端底层动作:作用于焦点终端,给命令列表只会制造噪音
  "terminal.select_all", "terminal.select", "terminal.clear_selection", "terminal.scroll",
  "terminal.paste_image", "terminal.search",
]);

function titleOf(name) {
  const [noun, verb] = name.split(".");
  return { group: noun.charAt(0).toUpperCase() + noun.slice(1), title: `${verb.replace(/_/g, " ")} ${noun}`.replace(/^./, (c) => c.toUpperCase()) };
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The `palette` list of each mods/<name>/mod.json; unreadable ones are skipped.
export async function modPalettes(root) {
  const dir = `${root}/mods`;
  const found = [];
  let names;
  try {
    names = new Set((await readdir(dir)).filter((n) => !n.startsWith(".")).sort());
  } catch {
    return found;
  }
  for (const mod of names) {
    try {
      const list = JSON.parse(await readFile(`${dir}/${mod}/mod.json`, "utf8")).palette;
      if (!Array.isArray(list)) continue;
      for (const p of list) {
        if (!isObject(p)) continue;
        if (p.command === "mod.open") {
          const name = p.args?.name;
          try {
            if (!names.has(name) || !await exists(`${dir}/${name}/main.js`)) continue;
          } catch {
            continue;
          }
        }
        found.push({ ...p, mod });
      }
    } catch {}
  }
  return found;
}

const TARGET_ARGS = new Set(["id", "pane", "space", "terminal", "target"]);

// Check the manifest shape here; the command still checks its arguments and live targets.
function modEntry(p, known) {
  if (typeof p.title !== "string" || !p.title.trim() || typeof p.command !== "string") return null;
  const args = p.args ?? {};
  if (!isObject(args)) return null;
  const c = known.get(p.command);
  if (c) {
    const names = c.args.map((a) => a.name);
    for (const [k, v] of Object.entries(args)) {
      if (!names.includes(k) || (TARGET_ARGS.has(k) && v != null && typeof v !== "string")) return null;
    }
    for (const { name, required } of c.args) {
      if (!required || (name === "name" && p.command.endsWith(".rename") && args.name == null)) continue;
      if (args[name] == null || (typeof args[name] === "string" && !args[name].trim())) return null;
    }
  } else {
    const at = p.command.indexOf(".");
    if (at < 1 || p.command.slice(0, at) !== p.mod || !p.command.slice(at + 1).trim() || Object.keys(args).length) return null;
  }
  const group = typeof p.group === "string" ? p.group.trim() : "";
  return {
    name: p.command, args, group: group && group !== "最近使用" ? group : "模块",
    title: p.title, words: `${typeof p.words === "string" ? p.words : ""} ${p.mod}`,
    modArgs: c?.args,
  };
}

function entryId(name, args) {
  return `${name}:${JSON.stringify(args, (_k, value) =>
    isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value)}`;
}

// Every entry for the state we're in now.
function entries(mods = []) {
  const known = new Map(commands().map((c) => [c.name, c]));
  const mac = win()?.platform === "macos";
  const list = NAMED.filter(([n]) => known.has(n))
    .filter(([n]) => !(mac && n.startsWith("window.")))
    .map(([name, args, group, title, words]) => ({ name, args, group, title, words }));
  const shown = layouts();
  for (const l of shown) {
    const t = { main: "Herdr", terminals: "Terminals", win98: "Herdr 98", hanfang: "汉坊" }[l] ?? l.charAt(0).toUpperCase() + l.slice(1);
    list.push({ name: "layout.switch", args: { name: l }, group: "布局", title: `布局：${t}`, words: `look 布局 ${l}` });
  }
  // `app.theme` sets the half of its theme's lightness, so only the themes
  // that can show now are offered: dark ones in a dark window, light ones in a
  // light one. A theme named like a layout is that layout's own (as in Settings).
  const dark = Boolean(settings().dark);
  for (const { name, light } of themes()) {
    if (Boolean(light) === dark || (name !== shared("layout") && shown.includes(name))) continue;
    list.push({ name: "app.theme", args: { name }, group: "应用", title: `主题：${name.replace(/-/g, " ")}`, words: "colors look 颜色 外观" });
  }
  // Anything new in the app shows up too, until it gets a better name here.
  const named = new Set(NAMED.map(([n]) => n));
  for (const c of known.values()) {
    if (named.has(c.name) || HIDDEN.has(c.name) || c.args.some((a) => a.required && a.name !== "name")) continue;
    list.push({ name: c.name, args: {}, ...titleOf(c.name), words: c.about });
  }
  const all = list.map((e) => ({ ...e, id: `${e.name}:${JSON.stringify(e.args)}` }));
  if (!mods.length) return all;
  const have = new Set(all.map((e) => entryId(e.name, e.args)));
  for (const p of mods) {
    const e = modEntry(p, known);
    const id = e && entryId(e.name, e.args);
    if (!e || have.has(id)) continue;
    have.add(id);
    all.push({ ...e, id });
  }
  return all;
}

// The global key whose action runs the same command and arguments.
function keyOf(e, bound) {
  const [first, ...other] = Object.keys(e.args);
  const value = e.args[first];
  let want = first === undefined ? e.name : null;
  if (typeof value === "string" || typeof value === "number") {
    const numericIndex = e.modArgs?.some((a) => a.name === "index") && /^\+?\d+$/.test(String(value));
    const shorthand = numericIndex
      ? first === "index" && Number.isSafeInteger(value) && value >= 0
      : first === e.modArgs?.[0]?.name && typeof value === "string";
    if (!e.modArgs || (!other.length && shorthand)) want = `${e.name}:${value}`;
  }
  for (const { section, keys, action } of bound) {
    if (section !== "global") continue;
    if (action === want) return keys;
    if (e.modArgs && action.startsWith("{")) {
      try {
        const { command, args = {} } = JSON.parse(action);
        if (command === e.name && entryId(command, args) === e.id) return keys;
      } catch {}
    }
  }
  return null;
}

// "ctrl-shift-p" -> ["ctrl", "shift", "p"]; "ctrl--" -> ["ctrl", "-"].
function keyParts(k) {
  return k.endsWith("--") ? [...k.slice(0, -2).split("-"), "-"] : k.split("-");
}

// Fuzzy score of `q` in `text`, with the matched positions; null: no match.
function fuzzy(q, text) {
  const t = text.toLowerCase();
  let score = 0;
  let at = 0;
  let run = 0;
  const hits = [];
  for (const ch of q) {
    const i = t.indexOf(ch, at);
    if (i < 0) return null;
    const start = i === 0 || /[\s:.\-_/]/.test(t[i - 1]);
    run = i === at && hits.length ? run + 1 : 0;
    score += 1 + (start ? 6 : 0) + run * 3 - Math.min(i - at, 6) * 0.3;
    hits.push(i);
    at = i + 1;
  }
  return { score: score - text.length * 0.02, hits };
}

export default class Palette extends View {
  init(_props, cx) {
    this.query = "";
    this.input = InputState.new({ placeholder: "输入命令…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", () => this.go(this.rows()[this.at]?.e));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = 0;
    // How far the list is scrolled, px.
    this.scroll = 0;
    this.recent = JSON.parse(localStorage.getItem("recent") ?? "[]");
    this.handle = cx.focus_handle();
    this.mods = [];
    cx.spawn(async (cx) => {
      const mods = await modPalettes(appHome());
      if (!mods.length) return;
      this.mods = mods;
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  go(e) {
    if (!e) return;
    this.recent = [e.id, ...this.recent.filter((r) => r !== e.id)].slice(0, 20);
    localStorage.setItem("recent", JSON.stringify(this.recent));
    this.close();
    if (e.name === "mod.clone" && !e.args.name) {
      openOverlay({ mod: "prompt", kind: "dialog", width: 380, props: {
        title: "复制模块", hint: "要复制的模块；会创建 <name>-copy",
        command: { name: "mod.clone", args: {} },
      } });
    } else {
      run(e.name, e.name === "layout.clone" && !e.args.name ? { name: shared("layout") ?? "main" } : e.args);
    }
  }

  // The rows to show: grouped when empty, ranked while typing.
  rows() {
    const all = entries(this.mods);
    const q = this.query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) {
      const recent = this.recent.map((id) => all.find((e) => e.id === id)).filter(Boolean).slice(0, 5);
      const rest = GROUPS.slice(1).flatMap((g) => all.filter((e) => e.group === g && !recent.includes(e)));
      const others = all.filter((e) => !GROUPS.includes(e.group) && !recent.includes(e));
      return [...recent.map((e) => ({ e, head: "最近使用" })), ...[...rest, ...others].map((e) => ({ e, head: e.group }))];
    }
    const rank = (e) => this.recent.indexOf(e.id);
    return all
      .map((e) => {
        const title = fuzzy(q, e.title);
        const more = fuzzy(q, `${e.group} ${e.title} ${e.name} ${e.words}`);
        const best = title ?? (more && { score: more.score - 4, hits: [] });
        return best && { e, score: best.score, hits: best.hits };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (rank(a.e) < 0 ? 99 : rank(a.e)) - (rank(b.e) < 0 ? 99 : rank(b.e)));
  }

  title(t, text, hits, on) {
    if (!hits?.length) return div().text_color(on ? t.foreground : t.muted).child(text);
    const parts = [];
    let cur = "";
    let lit = false;
    [...text].forEach((ch, i) => {
      const h = hits.includes(i);
      if (h !== lit && cur) {
        parts.push([cur, lit]);
        cur = "";
      }
      lit = h;
      cur += ch;
    });
    if (cur) parts.push([cur, lit]);
    return h_flex().children(parts.map(([s, h]) => div().text_color(h ? t.accent : on ? t.foreground : t.muted).when(h, (d) => d.font_semibold()).child(s.replace(/ /g, "\u00a0"))));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const bound = keys();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    // One continuous strip: each row (and the group title before it) at a
    // fixed y. Scrolling moves the strip in pixels, only as far as it takes to
    // keep the selected row (and its group's title, if it opens one) in view.
    const tops = [];
    let y = 0;
    rows.forEach((r, i) => {
      const head = !this.query && (i === 0 || r.head !== rows[i - 1].head);
      tops.push({ head, title: y, row: y + (head ? HEAD_H : 0) });
      y += (head ? HEAD_H : 0) + ROW_H;
    });
    const total = y;
    const fixed = total > LIST_H;
    this.maxScroll = Math.max(0, total - LIST_H);
    const sel = tops[this.at];
    if (sel) {
      const from = sel.head ? sel.title : sel.row;
      if (from < this.scroll) this.scroll = from;
      if (sel.row + ROW_H > this.scroll + LIST_H) this.scroll = sel.row + ROW_H - LIST_H;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll));
    const key = (k) =>
      h_flex().gap(3).children(keyParts(k).map((p) => div().px(5).rounded(4).border_1().border_color(t.border).bg(t.raised).text_size(11).text_color(t.dim).child(p)));
    // In a scrolling list each item is placed at its edges from the model
    // above, not stacked: GPUI rounds every height to whole pixels, and a
    // stack of rounded heights drifts away from the model (19 px at zoom 1.3
    // by row 40, cutting the selection off). Edges from the model can't add up.
    const place = (el, start, end) =>
      fixed
        ? el.absolute().left(0).right(0).top(start - this.scroll).bottom(LIST_H - (end - this.scroll))
        : el.flex_none().h(end - start);
    const visible = (start, end) => !fixed || (end > this.scroll && start < this.scroll + LIST_H);
    const list = [];
    rows.forEach((r, i) => {
      const { head, title, row } = tops[i];
      if (head && visible(title, row))
        list.push(
          place(h_flex(), title, row)
            .px(14)
            .pb(4)
            .items_center()
            .gap(6)
            .child(
              h_flex()
                .items_center()
                .gap(5)
                .px(6)
                .py(2)
                .rounded(4)
                .bg(t.selected)
                .text_size(11.5)
                .font_semibold()
                .text_color(groupInk(t, r.head))
                .child(div().w(3).h(10).rounded(1).bg(groupColor(t, r.head)))
                .child(r.head),
            ),
        );
      if (!visible(row, row + ROW_H)) return;
      const on = i === this.at;
      const k = keyOf(r.e, bound);
      list.push(
        place(h_flex(), row, row + ROW_H)
          .id(`pl-${i}`)
          .mx(6)
          .px(10)
          .gap(10)
          .items_center()
          .rounded(7)
          .cursor_pointer()
          .text_size(12.8)
          .when(on, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.go(r.e))
          .child(div().flex_1().min_w(0).child(this.title(t, r.e.title, r.hits, on)))
          .when(Boolean(this.query), (el) => el.child(div().text_size(11.5).text_color(groupInk(t, r.e.group)).child(r.e.group)))
          .when(Boolean(k), (el) => el.child(key(k))),
      );
    });
    return v_flex()
      .id("palette")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        // Stops at the ends: wrapping jumps out of sight.
        if (k === "down") this.at = Math.min(this.at + 1, rows.length - 1);
        else if (k === "up") this.at = Math.max(this.at - 1, 0);
        else if (k === "pagedown") this.at = Math.min(this.at + SHOWN, rows.length - 1);
        else if (k === "pageup") this.at = Math.max(this.at - SHOWN, 0);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(10)
          .gap(10)
          .items_center()
          .rounded(9)
          .border_1()
          .border_color(t.accent)
          .bg(t.background)
          .child(svg(win()?.platform === "macos" ? "frame/palette/command.svg" : "mods/workspace-chrome/search.svg").size(16).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
          .child(div().text_size(11).text_color(t.dim).child("Esc")),
      )
      .child(
        rows.length
          ? div()
              .id("palette-rows")
              .relative()
              .mb(6)
              .when(fixed, (el) => el.h(LIST_H).overflow_hidden())
              .on_scroll_wheel((e, cx) => {
                // The event bridge converts both wheel and touchpad deltas to pixels.
                this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, this.maxScroll));
                // The selection stays on screen, so the next frame doesn't scroll back to it.
                // A row that opens a group is shown with its title, so the title counts.
                while (this.at < rows.length - 1 && (tops[this.at].head ? tops[this.at].title : tops[this.at].row) < this.scroll) this.at++;
                while (this.at > 0 && tops[this.at].row + ROW_H > this.scroll + LIST_H) this.at--;
                cx.notify();
              })
              .children(fixed ? list : [v_flex().children(list)])
          : div().px(16).py(14).text_size(13).text_color(t.dim).child(`没有匹配 “${this.query}” 的命令。跳转到某个位置请用跳转面板。`),
      );
  }
}
