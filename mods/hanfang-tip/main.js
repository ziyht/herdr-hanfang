// 汉坊·终端清单弹层:悬停轨道图标时在指针处弹出,展示整个空间的终端,
// 触发的那个高亮。等宽排版、字段分色,字体跟随应用的 UI 配置(settings())。
// 关闭自管理:指针进入过弹层则在离开时关;从未进入且超过 0.7s 也关。
import { div, View } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, settings, props, closeOverlay, setShared } from "herdr";

const K = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export default class Tip extends View {
  init(_props, cx) {
    // 关闭由 hanfang-spaces 的看门狗统一裁决;这里只上报自身悬停,
    // 外加一个 60s 泄漏保险(看门狗所在 mod 被换布局等情况)。
    this.gen = null;
    cx.timer.every(60000, () => {
      const ov = props()?.overlay;
      if (ov) closeOverlay(ov);
    });
  }

  render() {
    const t = theme();
    const s = settings();
    const font = (s && s.ui_font) || "Menlo";
    const size = (s && s.ui_font_size) || 12.5;
    const lines = props()?.lines ?? [];
    return v_flex()
      .id("hanfang-tip")
      .size_full()
      .p(6)
      .gap(1)
      .bg(t.popover)
      .font_family(font)
      .on_hover((h) => {
        if (this.gen === null) this.gen = props()?.gen;
        setShared("hanfang.tip.hover", { gen: this.gen, hover: h });
      })
      .children(lines.map((l) => this.row(l, t, font, size)));
  }

  row(l, t, font, size) {
    const mono = (el) => el.font_family(font).text_size(size);
    return h_flex()
      .id(`tip-${l.key}`)
      .h(size + 7)
      .items_center()
      .gap(7)
      .text_size(size)
      .child(mono(div()).w(12).flex_none().text_color(t.accent).child(l.mine ? "▶" : ""))
      .child(
        mono(div())
          .flex_1()
          .min_w(0)
          .truncate()
          .text_color(l.mine ? t.foreground : t.muted)
          .child(l.name),
      )
      .when(l.program, (el) =>
        el.child(mono(div()).flex_none().text_color(t.dim).child(l.program)),
      )
      .when(Number.isFinite(l.pct), (el) => {
        // 占比与用量同色:<50% 绿,50–80% 黄,>80% 红
        const ctxColor = l.pct >= 80 ? t.ansi1 : l.pct >= 50 ? t.ansi3 : t.ansi2;
        return el
          .child(mono(div()).flex_none().text_color(ctxColor).child(`${l.pct}%`))
          .when(l.tokens, (e2) =>
            e2.child(mono(div()).flex_none().text_color(ctxColor).child(l.tokens)),
          );
      });
  }
}
