// 汉坊·Sidebar:一个 mod 画整个侧栏(轨道 + Agents),另有 footer / panel-toggle 两个零件视图。
// 布局里不传 view 就是整个侧栏;其他布局要拆开时用 props.view 选零件。
import { View } from "gpui-kit";
import { props } from "herdr";
import { Agents } from "./views/agents.js";
import { Sidebar } from "./views/sidebar.js";
import { Footer } from "./views/footer.js";
import { PanelToggle } from "./views/panel-toggle.js";

const PARTS = { sidebar: Sidebar, agents: Agents, footer: Footer, "panel-toggle": PanelToggle };

export default class BetterSidebar extends View {
  init(given, cx) {
    const Part = PARTS[props()?.view] ?? Sidebar; // 默认 = 整个侧栏(轨道 + Agents)
    this.part = new Part();
    this.part.init(given, cx);
  }

  render(cx) {
    return this.part.render(cx);
  }
}
