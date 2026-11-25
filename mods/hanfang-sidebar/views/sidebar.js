// 汉坊侧栏:一个 mod 画整个侧栏 —— 上半「空间轨道」(rail),下半「Agents」,
// 中间一条可拖的分隔条,自己调两块高度(占比存 localStorage "sidebar.split")。
// 布局只挂一块 `{"mod": "hanfang-sidebar"}`,不再拆成两个 mod 两个 block。
import { v_flex, h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { theme } from "herdr";
import Rail from "./rail.js";
import { Agents } from "./agents.js";

const MIN = 0.12; // 任一块最少占 12%
const MAX = 0.85; // Agents 最多占 85%
const KEY = "sidebar.split";

export class Sidebar {
  init(props, cx) {
    this.rail = new Rail();
    this.rail.init(props, cx);
    this.agents = new Agents();
    this.agents.init(props, cx);
    const saved = Number(localStorage.getItem(KEY));
    this.split = Number.isFinite(saved) && saved > MIN && saved < MAX ? saved : 0.5; // Agents 占比
    this.dragging = null;
    this.height = 0;
  }

  render() {
    const t = theme();
    const total = this.height || 800;
    const agentsH = Math.max(90, Math.round(total * this.split));
    return v_flex()
      .id("hanfang-sidebar")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      // 记下自己的高度(拖动时把像素增量换算成占比)。只挂这一个 on_size_change:
      // 同一元素挂两个会互相覆盖,this.height 会停在 0。
      .on_size_change((size, cx) => {
        const first = !this.height;
        this.height = size.height;
        if (first) cx.notify(); // 首次量到真实高度后重排一次,分隔条才落在对的位置
      })
      .child(v_flex().flex_1().min_h(0).child(this.rail.render()))
      .child(this.divider(t))
      .child(v_flex().flex_none().h(agentsH).min_h(0).child(this.agents.render({ topBorder: false, background: t.surface })));
  }

  // 拖动分隔条:窗口级 move/up,指针离开分隔条也继续跟手;松手才落盘。
  divider(t) {
    const active = this.dragging !== null;
    return h_flex()
      .id("sidebar-split")
      .w_full()
      .h(7)
      .flex_none()
      .relative()
      .bg(t.surface)
      .items_center()
      .justify_center()
      .gap(8)
      .cursor_row_resize()
      // 贯穿整宽的 1px 细线:平时 t.border,拖动时强调色
      .child(div().absolute().left(0).right(0).h(1).bg(active ? t.accent : t.border))
      // 压在线上的把手:常显;悬停变宽变亮
      .child(
        div()
          .w(56)
          .h(3)
          .rounded(2)
          .bg(active ? t.accent : t.dim)
          .hover((s) => s.w(72).h(4).bg(t.accent)),
      )
      .when(active, (el) =>
        el.child(div().text_size(10).font_medium().text_color(t.accent).child(`Agents ${Math.round(this.split * 100)}%`)),
      )
      .on_mouse_down("left", (e, cx) => {
        this.dragging = { y: e.position.y, base: this.split };
        cx.notify();
      })
      .on_window_mouse_move((e, cx) => {
        if (!this.dragging || e.pressed_button !== "left") return;
        const total = this.height || 800;
        // 往下拖 = 分隔条往下走 = Agents 变矮(split 是 Agents 占比,所以减)
        const next = this.dragging.base - (e.position.y - this.dragging.y) / total;
        const clamped = Math.min(MAX, Math.max(MIN, next));
        if (Math.abs(clamped - this.split) > 0.001) {
          this.split = clamped;
          cx.notify();
        }
      })
      .on_window_mouse_up("left", (_e, cx) => {
        if (!this.dragging) return;
        this.dragging = null;
        localStorage.setItem(KEY, String(this.split));
        cx.notify();
      });
  }
}
