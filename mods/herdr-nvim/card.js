// herdr-nvim's two cards, a dialog of this mod with props {card}:
// - "nvim": Neovim isn't there (or too old) when a tab's nvim has to start.
//   herdr-nvim says so (exit 3, `nvim_missing`, lib.js). Install opens a
//   terminal tab running `herdr-nvim app-install-nvim`, so the person sees
//   what runs; nothing installs without that press.
// - "welcome": once, the first time the tab's nvim opens (`welcome`): just
//   the keys, as the person's keys.json binds them, and where they live.
//   `herdr-nvim.welcome` shows it again (`welcome({ again: true })`).
// Enter does the main button, Esc closes.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, closeOverlay, openOverlay, props, readTextFile, run, setShared, shared, theme } from "herdr";
import { appConfig } from "./ops.js";

// The last time the "Neovim is needed" card opened: several requests failing
// at once (the tree and the controller) open one.
const OPENED = "herdr-nvim.card-at";
const SEEN = "herdr-nvim.welcomed";

export function openCard(card) {
  if (card.kind === "nvim") {
    if (Date.now() - (shared(OPENED) || 0) < 3000) return;
    setShared(OPENED, Date.now());
  }
  openOverlay({ mod: "herdr-nvim", kind: "dialog", width: 520, props: { card } });
}

// The key bound to `command` in the person's keys.json (any section), or null.
function keyFor(keys, command) {
  for (const section of Object.values(keys ?? {})) {
    if (!section || typeof section !== "object") continue;
    const hit = Object.entries(section).find(([, bound]) => bound === command);
    if (hit) return hit[0];
  }
  return null;
}

// Pure: the welcome's rows, [key, what], from keys.json and the settings.
export function welcomeRows(keys, config) {
  const nvimTree = config.tree === "nvim";
  const rows = [
    [keyFor(keys, "mod.open:herdr-nvim"), nvimTree ? "打开或关闭 nvim" : "打开或关闭文件树和 nvim"],
    [keyFor(keys, "herdr-nvim.pick"), "打开 agent 最近操作的文件"],
  ];
  if (!nvimTree) {
    rows.push([keyFor(keys, "herdr-nvim.reveal"), "跳到文件树"]);
    if (config.tree_key) rows.push([config.tree_key, "显示或隐藏文件树"]);
    rows.push(["?", "文件树全部按键"]);
  }
  return rows.filter(([key]) => key);
}

// Once: the first time a tab's nvim opened; `again`: whenever asked.
export async function welcome({ again = false } = {}) {
  if (shared(SEEN) === true && !again) return;
  setShared(SEEN, true);
  const text = await readTextFile(`${appHome()}/keys.json`).catch(() => null);
  let keys = {};
  try { keys = JSON.parse(text ?? "{}"); } catch {}
  const config = await appConfig().catch(() => ({ tree: "native" }));
  openCard({ kind: "welcome", rows: welcomeRows(keys, config), config: config.path ?? "~/.config/herdr-nvim/config.toml" });
}

export class Card {
  constructor(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  close() {
    closeOverlay(props().overlay);
  }

  // The main button: Install, or Got it.
  submit() {
    const card = props().card;
    this.close();
    if (card.kind === "nvim") {
      run("terminal.open", {
        argv: [`${appHome()}/mods/herdr-nvim/bin/herdr-nvim`, "app-install-nvim", "--pause"],
        place: "tab", name: "安装 Neovim",
      });
    }
  }

  render() {
    const card = props().card, t = theme();
    const button = (id, label, primary, onClick) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(onClick).child(label);
    const mono = (text) => div().text_color(t.accent).font_family("JetBrains Mono").child(text);
    const shell = v_flex().id("herdr-nvim-card").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.key === "enter") this.submit();
        else return;
        cx.stop_propagation();
      })
      .w_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(13);
    const title = (text) => h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(text))
      .child(div().text_size(11).text_color(t.dim).child("Esc"));
    if (card.kind === "nvim") {
      const what = card.found ? `\`${card.bin}\` 是 Neovim ${card.found}` : `\`${card.bin}\` 未找到`;
      return shell
        .child(title(`需要 Neovim ${card.need ?? "0.10"} 或更新版本`))
        .child(div().text_color(t.muted).child(`herdr-nvim 用它运行每个 tab 的 nvim，而 ${what}。`))
        .child(div().text_size(11.5).text_color(t.dim).child(
          "安装会打开一个终端 tab 来安装：优先 Homebrew（brew install neovim），否则用 Neovim 官方 release 装到 ~/.local/share/herdr-nvim/nvim，无需 sudo。装好后再按一次 cmd-e。"))
        .child(h_flex().pt(8).gap(8).justify_end()
          .child(button("card-cancel", "暂不", false, () => this.close()))
          .child(button("card-install", "安装 Neovim", true, () => this.submit())));
    }
    return shell
      .child(title("nvim 已就绪"))
      .child(v_flex().gap(6).pt(4).children(card.rows.map(([key, what]) => h_flex().gap(12)
        .child(div().w(110).flex_none().child(mono(key)))
        .child(div().flex_1().min_w(0).child(what)))))
      .child(div().pt(4).text_size(11.5).text_color(t.dim).child(
        `按键：~/.config/herdr-app/keys.json · 设置：${card.config.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~")}`))
      .child(h_flex().pt(8).justify_end().child(button("card-ok", "知道了", true, () => this.submit())));
  }
}
