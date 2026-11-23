// 空间轨道:侧栏里的紧凑空间列表。每行一个空间,终端只画图标、横向换行排列;
// 图标颜色跟随状态(agent: working/blocked/done/idle,普通 shell 为中性色),
// 悬停显示终端名,右键弹出与终端区一致的菜单(关闭、改名、分屏…)。
import { div, svg, image, View } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, run, openOverlay, theme, shared, setShared } from "herdr";

const TEXT = { caption: 11, label: 12.8 };

// 与其它画空间头像的 mod 相同的每色一强色表。
const AVATAR_COLORS = {
  ansi6: "#22a99a",
  ansi3: "#e3814f",
  ansi4: "#5b8def",
  ansi5: "#8b7cf6",
  ansi2: "#3fae6a",
  ansi1: "#d9649a",
};

// 状态 → 主题色(沿用应用的色彩机制:t.working/blocked/done/idle/unknown)。
function tone(t, status) {
  return status ? (t[status] ?? t.unknown) : t.muted;
}

function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

// 运行中:agent 报告 working,或 shell 前台有程序在执行
// (zsh 跑命令、nvim、kubectl…;与 better-sidebar 的 busy 判定一致)。
function running(p) {
  return p.status === "working" || !(p.program?.shell || p.program?.agent);
}

// 「运行中」的慢闪烁:黄色,一个来回 1.6 秒,原生动画(仅可见时运行)。
const PULSE = { from: 1, to: 0.35, period: 1600 };

export default class Rail extends View {
  init(_props, cx) {
    this.updateColors(spaces());
    cx.timer.every(1000, (cx) => this.updateColors(spaces()));
  }

  // 空间头像配色共享给应用自己的空间菜单;在数据同步时做,不在 render 里。
  updateColors(sp) {
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const ids = new Set(sp.map((p) => p.id));
    const kept = Object.fromEntries(
      Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)),
    );
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[p.id] = palette.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
  }

  menu(tab, target) {
    openOverlay({
      mod: "menu-zh",
      kind: "popup",
      width: 200,
      height: 260,
      props: { tab, target },
    });
  }

  // ── 一个空间:名字行 + 终端图标横排 ────────────────────────────────────────

  avatar(s, t) {
    const color = (shared("space.colors") ?? {})[s.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (AVATAR_COLORS[color] ?? t[color]);
    return h_flex()
      .size(16)
      .flex_none()
      .rounded(4)
      .bg(fill)
      .items_center()
      .justify_center()
      .text_size(10)
      .font_bold()
      .text_color("#ffffff")
      .child([...s.name][0]?.toUpperCase() ?? "?");
  }

  spaceRow(s, t) {
    return h_flex()
      .id(`rail-space-${s.id}`)
      .h(24)
      .mx(8)
      .mb(2)
      .px(6)
      .flex_none()
      .gap(6)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .when(s.active, (el) => el.bg(t.selected))
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", () => this.menu("space", { id: s.id }))
      .child(this.avatar(s, t))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .tooltip(s.name)
          .text_size(TEXT.label)
          .text_color(s.active ? t.foreground : t.muted)
          .child(s.name),
      )
      .child(
        div()
          .flex_none()
          .text_size(TEXT.caption)
          .text_color(tone(t, s.status))
          .child(glyph(s.status)),
      );
  }

  // 一个终端的图标块:运行中变黄慢闪烁;其余状态着状态色;
  // 不可着色的图片图标加状态角点。
  chip(p, t) {
    const busy = running(p);
    const color = busy ? t.ansi3 : tone(t, p.status);
    const program = p.program ?? {};
    const label = p.title || program.name || "终端";
    let icon = program.icon
      ? program.tint
        ? svg(program.icon).size(13).text_color(color)
        : image(program.icon).size(13)
      : div()
          .text_size(TEXT.caption)
          .text_color(color)
          .child([...(program.name ?? "?")][0]?.toUpperCase() ?? "?");
    if (busy) icon = icon.loop("opacity", PULSE);
    return h_flex()
      .id(`rail-term-${p.pane}`)
      .relative()
      .size(22)
      .flex_none()
      .rounded(6)
      .items_center()
      .justify_center()
      .cursor_pointer()
      .when(p.focused, (el) => el.bg(t.selected))
      .when(!p.focused, (el) => el.hover((st) => st.bg(t.hover)))
      .tooltip(program.name && program.name !== label ? `${label} · ${program.name}` : label)
      .on_click(() => {
        run("tab.select", { id: p.tab });
        run("pane.focus", { terminal: p.terminal });
      })
      .on_mouse_down("right", () => this.menu("pane", { pane: p.pane, terminal: p.terminal }))
      .child(icon)
      .when(program.icon && !program.tint, (el) =>
        el.child(
          div()
            .absolute()
            .right(-1)
            .bottom(-1)
            .size(5)
            .rounded(3)
            .bg(color)
            .when(busy, (d) => d.loop("opacity", PULSE)),
        ),
      );
  }

  plusChip(s, t) {
    return h_flex()
      .id(`rail-new-${s.id}`)
      .size(22)
      .flex_none()
      .rounded(6)
      .items_center()
      .justify_center()
      .cursor_pointer()
      .text_color(t.dim)
      .hover((st) => st.bg(t.hover).text_color(t.foreground))
      .tooltip("新建标签页")
      .on_click(() => run("tab.new", { space: s.id }))
      .child(div().text_size(13).child("+"));
  }

  chips(s, t) {
    const order = new Map((s.tabs ?? []).map((tab, i) => [tab.id, i]));
    const mine = panes()
      .filter((p) => order.has(p.tab) && p.terminal)
      .sort((a, b) => order.get(a.tab) - order.get(b.tab));
    return h_flex()
      .id(`rail-chips-${s.id}`)
      .flex_wrap()
      .gap(4)
      .px(8)
      .pb(6)
      .flex_none()
      .children(mine.map((p) => this.chip(p, t)))
      .child(this.plusChip(s, t));
  }

  // 远程机器的分隔标签(本机不占一行)。
  machineLabel(m, t) {
    return h_flex()
      .id(`rail-machine-${m}`)
      .h(18)
      .mt(8)
      .px(10)
      .flex_none()
      .gap(5)
      .items_center()
      .text_size(TEXT.caption)
      .text_color(t.dim)
      .child(svg("mods/better-sidebar/icons/server.svg").size(11).text_color(t.dim))
      .child(m);
  }

  // ── 整体 ────────────────────────────────────────────────────────────────

  newSpaceButton(t) {
    return h_flex()
      .id("rail-space-new")
      .flex_none()
      .px(5)
      .rounded(5)
      .cursor_pointer()
      .text_color(t.dim)
      .hover((st) => st.bg(t.hover).text_color(t.foreground))
      .tooltip("新建空间")
      .on_click(() => run("space.new"))
      .child(div().text_size(14).child("+"));
  }

  header(t) {
    // Agents 总数徽标(原组合视图标签条上的统计),点击跳到下一个 agent。
    const n = agents().length;
    return h_flex()
      .h(31)
      .pl(16)
      .pr(10)
      .flex_none()
      .items_center()
      .justify_between()
      .text_size(TEXT.label)
      .text_color(t.dim)
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child("空间")
          .when(n > 0, (el) =>
            el
              .child(div().text_color(t.border).child("·"))
              .child(
                h_flex()
                  .id("rail-agents-count")
                  .gap(4)
                  .items_center()
                  .rounded(5)
                  .px(4)
                  .cursor_pointer()
                  .hover((st) => st.bg(t.hover))
                  .tooltip("所有空间的 agent 总数 · 点击跳到下一个")
                  .on_click(() => run("agent.next"))
                  .child(div().text_color(t.muted).child("Agents"))
                  .child(div().text_color(t.foreground).child(String(n))),
              ),
          ),
      )
      .child(this.newSpaceButton(t));
  }

  grouped(sp, t) {
    const out = [];
    let seen = undefined; // undefined=还没遇到过机器;null=本机
    for (const s of sp) {
      const m = s.machine ?? null;
      if (m !== seen) {
        if (m !== null) out.push(this.machineLabel(m, t));
        seen = m;
      }
      out.push(this.spaceRow(s, t));
      out.push(this.chips(s, t));
    }
    return out;
  }

  render() {
    const t = theme();
    return v_flex()
      .id("spaces-rail-root")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_size(13)
      .child(this.header(t))
      .child(
        v_flex()
          .id("rail-body")
          .flex_1()
          .min_h(0)
          .pt(4)
          .pb(10)
          .overflow_y_scrollbar()
          .mode("always")
          .children(this.grouped(spaces(), t)),
      );
  }
}
