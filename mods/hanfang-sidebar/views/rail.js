// 空间轨道:侧栏里的紧凑空间列表。每行一个空间,终端只画图标、横向换行排列;
// 图标颜色跟随状态(agent: working/blocked/done/idle,普通 shell 为中性色),
// 悬停显示终端名,右键弹出与终端区一致的菜单(关闭、改名、分屏…)。
import { div, svg, image, View } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, terminals, run, openOverlay, closeOverlay, theme, settings, shared, setShared, hc, readTextFile, home, exec, playSound } from "herdr";
import { PRStatusObserver, prPlaceKey, prAppearance } from "../git/pr-status.js";

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

// 断连机器的重连状态(模块级;热重载即重置,无持久化需求)。
const RECONN = {};

// 状态 → 主题色(沿用应用的色彩机制:t.working/blocked/done/idle/unknown)。
function tone(t, status) {
  return status ? (t[status] ?? t.unknown) : t.muted;
}

function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

// 运行中:agent 报告 working,或 shell 前台有程序在执行
// (zsh 跑命令、nvim、kubectl…;与 better-sidebar 的 busy 判定一致)。
// hermes 例外:由 OSC 状态驱动(agent-hooks 桥),无状态时不闪,避免误报。
function running(p) {
  if (isHermes(p)) return p.status === "working";
  return p.status === "working" || !(p.program?.shell || p.program?.agent);
}

// 「运行中」的慢闪烁:黄色,一个来回 1.6 秒,原生动画(仅可见时运行)。
const PULSE = { from: 1, to: 0.35, period: 1600 };

// pi agent:按程序表识别(与 over9k 的判定一致)。
function isPi(p) {
  return p.app === "pi" || p.program?.key === "pi";
}

// hermes agent:OSC 7501 上报 app=hermes(agent-hooks/herdr-status.py 桥)。
function isHermes(p) {
  return p.app === "hermes" || p.program?.key === "hermes";
}

// 终端名 → 状态文件名:hook 侧落盘时把 / 换成 _(见 hermes-bridge/herdr-status.py),
// 远端窗格的终端名形如 "vps/t7",这边必须同样处理才能对上。
const termKey = (term) => String(term).replace(/\//g, "_");

// hermes 会话状态词 → Herdr 状态槽(error 归入 idle,不虚报 blocked);
// 面板 OSC 只在启动时报一次 idle,非 working 状态一律以会话记录为准。
const HERMES_STATE = { working: "working", done: "done", idle: "idle", error: "idle", blocked: "blocked" };

// hermes 页脚(Hermes 自己渲染的那行):
//   " ☤ DeepSeek-V4.1-Flash-1017 · 327K/1M · [███░░░░░░░] 31% · ◎ 66.5% · …"
// 直接用它的用量/上限/占比:模型换不换、窗口多大都不用猜,和用户看到的一致。
function hermesFooter(text) {
  for (const line of (text ?? "").split("\n").reverse()) {
    const m = /(\d+(?:\.\d+)?)\s*([kKmM])?\s*\/\s*(\d+(?:\.\d+)?)\s*([kKmM])\b[^\n]*?(\d+(?:\.\d+)?)\s*%/.exec(line);
    if (!m) continue;
    const scale = (u) => (/m/i.test(u ?? "") ? 1e6 : /k/i.test(u ?? "") ? 1e3 : 1);
    return { used: Math.round(Number(m[1]) * scale(m[2])), limit: Math.round(Number(m[3]) * scale(m[4])), pct: Number(m[5]) };
  }
  return null;
}

// 页脚读不到时(无终端会话)的兜底:按模型记住页脚报过的窗口(localStorage),
// 从没见过的模型按 1M 算——比原来写死 131072 靠谱得多。
const WINDOWS_KEY = "rail.context.windows";

// pi 的页脚行:"↑5.5k ↓72 8.6%/66k (auto) …" —— 取上下文占比(参照 over9k)。
function piFooter(text) {
  // 页脚如 "↑5.5k ↓72 8.6%/66k …":占比 + 分母(上下文上限,66k / 1.0M)
  for (const line of (text ?? "").split("\n").reverse()) {
    const m = /(?:^|\s)(\d+(?:\.\d+)?)%\/([0-9.]+[kKmM])\b/.exec(line);
    if (m) {
      const n = parseFloat(m[2]);
      const limit = /[mM]$/.test(m[2]) ? n * 1e6 : n * 1e3;
      return { pct: Number(m[1]), limit };
    }
  }
  return null;
}

// 占比配色:<50% 绿,50–80% 黄,>80% 红(主题的 ansi 色)。
function contextColor(t, pct) {
  return pct >= 80 ? t.ansi1 : pct >= 50 ? t.ansi3 : t.ansi2;
}

// 拖动排序的落点指示线:atTop = 画在行顶,否则画在底边。
function dropLine(t, atTop) {
  return div()
    .absolute()
    .left(0)
    .right(0)
    .h(2)
    .rounded(1)
    .bg(t.accent)
    .when(atTop, (line) => line.top(0))
    .when(!atTop, (line) => line.bottom(0));
}

export default class Rail extends View {
  init(_props, cx) {
    // 机器折叠(参照 orca 的机器分隔:点机器头折叠整组,localStorage 持久)。
    this.foldedMachines = new Set(JSON.parse(localStorage.getItem("rail.machines.folded") ?? "[]"));
    this.updateColors(spaces());
    cx.timer.every(1000, (cx) => this.updateColors(spaces()));
    // pi agent 的上下文占比:轮询各 agent 屏幕末尾的页脚(参照 over9k)。
    // 拖动排序状态:pressed = 按下的空间下标,over = 指针所在行,dragged = 刚拖过(抑制随后的 click)
    this.pressed = null;
    this.over = null;
    this.dragged = false;
    this.piContext = {}; // terminal address -> 上下文百分比
    // hermes 页脚直接读出来的用量/上限/占比:terminal address -> {used, limit, pct}
    this.hermesScreen = {};
    // 模型 -> 窗口(从页脚学到后记住,JSON 兜底时用)
    try { this.windows = JSON.parse(localStorage.getItem(WINDOWS_KEY) ?? "{}"); } catch { this.windows = {}; }
    this.polling = false;
    this.pollContext(cx);
    cx.timer.every(5000, (cx) => this.pollContext(cx));
    // hermes 会话状态:窗格按终端名直读 ~/.hermes/herdr-status/term/<terminal>.json
    // (agent-hooks/herdr-status.py 按 HC_TERMINAL_ID 落盘,终端本身就是身份,不用匹配)。
    this.termRecs = {}; // terminal -> {session_id, state, context_tokens, model, ts}
    this.termPolling = false;
    this.pollHermes(cx);
    cx.timer.every(1000, (cx) => this.pollHermes(cx));
    // 终端清单弹层:悬停状态驱动(看门狗负责关闭)
    this.tipChipHovered = false;
    this.tipBothLeftAt = 0;
    this.tipGen = 0;
    cx.timer.every(100, () => this.tipWatchdog());
    // PR 状态徽标(收编自 better-sidebar 的 pr-status.js;gh 查询,60s 自节流)
    this.pr = new PRStatusObserver();
    this.refreshPRs(cx);
    cx.timer.every(3000, (cx) => this.refreshPRs(cx));
  }

  // 空间的检出位置:第一个终端的 cwd,否则空间自己的 folder。
  place(s) {
    const tabs = new Set((s.tabs ?? []).map((c) => c.id));
    const pane = panes().find((p) => tabs.has(p.tab) && p.cwd);
    return { machine: s.machine, folder: pane?.cwd || s.folder, branch: pane?.branch ?? null };
  }

  refreshPRs(cx) {
    this.pr.refresh(
      spaces().filter((s) => this.place(s).folder).map((s) => this.place(s)),
      cx,
    );
  }

  // 空间行右端的 PR 徽标:状态图标着状态色,悬停出标题,点击开浏览器。
  prBadge(s, t) {
    const place = this.place(s);
    if (!place.folder) return null;
    const prs = (this.pr.entries.get(prPlaceKey(place.machine, place.folder))?.prs ?? []).filter(Boolean);
    const badge = h_flex().gap(4).flex_none().items_center();
    if (!prs.length) return badge;
    const pr = prs[0];
    const st = prAppearance(pr, t);
    return badge
      .child(
        h_flex()
          .id(`rail-pr-${s.id}-${pr.number}`)
          .gap(3)
          .items_center()
          .cursor_pointer()
          .text_color(st.color)
          .when(this.pressed === null, (el) => el.tooltip(`${pr.repository}#${pr.number} · ${st.label}\n${pr.title}`))
          .on_click(() => exec("open", [pr.url]).catch(() => {}))
          .child(svg(`mods/hanfang-sidebar/icons/${st.icon}.svg`).size(12).flex_none().text_color(st.color)),
      )
      .when(
        prs.length > 1,
        (el) =>
          el
            .text_size(TEXT.caption)
            .text_color(t.dim)
            .when(this.pressed === null, (el) => el.tooltip(prs.map((p) => `${p.repository}#${p.number}`).join("\n")))
            .child(`+${prs.length - 1}`),
      );
  }

  // 每 1s:对每个 hermes 窗格读它自己终端名的状态文件。文件不存在(会话还没写过、
  // 或 on_session_end 刚删掉)就当我没记录,不猜、不兜底。
  pollHermes(cx) {
    if (this.termPolling) return; // 上一轮还没读完,别叠(cx.spawn 不排队)
    this.termPolling = true;
    cx.spawn(async (cx) => {
      try {
        const next = {};
        for (const p of panes()) {
          if (!p.terminal || !isHermes(p)) continue;
          let rec = null;
          try {
            const raw = await readTextFile(`${home()}/.hermes/herdr-status/term/${termKey(p.terminal)}.json`);
            if (raw) rec = JSON.parse(raw);
          } catch {
            /* 缺文件/正在原子替换:本轮跳过该窗格 */
          }
          if (!rec || typeof rec !== "object") continue;
          next[p.terminal] = {
            session_id: rec.session_id ?? null,
            state: rec.state ?? null,
            context_tokens: typeof rec.context_tokens === "number" ? rec.context_tokens : null,
            model: rec.model ?? null,
            ts: rec.ts ?? 0,
          };
        }
        const sig = JSON.stringify(next);
        if (sig === JSON.stringify(this.termRecs)) return;
        this.soundHermes(this.termRecs, next);
        this.termRecs = next;
        // 发布给 Agents 侧栏(同一个 sidebar 实例):它按窗格终端查同一份数据。
        setShared("hanfang.term", next);
        cx.notify();
      } finally {
        this.termPolling = false; // 中途抛错也别把轮询焊死
      }
    });
  }

  // 状态跳变提示音:同一会话 working → done/blocked 且没盯着那个终端 → 播放
  // (对齐 Herdr 原生 sounds 的"没在看才响"语义)。按 session_id 比,不看终端,
  // 这样会话中途换窗格也不会漏响;从没见过的会话(刚启动)不算跳变。
  soundHermes(prev, next) {
    const prevState = new Map();
    for (const r of Object.values(prev ?? {})) {
      if (r?.session_id) prevState.set(r.session_id, r.state);
    }
    const live = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p]));
    for (const [term, r] of Object.entries(next)) {
      const was = r.session_id ? prevState.get(r.session_id) : undefined;
      if (was === undefined || was === r.state) continue;
      if (r.state !== "done" && r.state !== "blocked") continue;
      if (live.get(term)?.focused) continue;
      playSound(r.state);
    }
  }

  // 一个窗格的 hermes 记录:终端名直查。没有就是没有——不再按 cwd 猜、不看时效、不排序。
  hermesRec(p) {
    return this.termRecs[p.terminal] ?? null;
  }

  pollContext(cx) {
    if (this.polling) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      const mine = panes().filter((p) => p.terminal && (isPi(p) || isHermes(p)));
      let changed = false;
      for (const p of mine) {
        const r = await hc(["read", p.terminal, "--lines", "12"]).catch(() => null);
        if (isHermes(p)) {
          // hermes:同一块屏的页脚里就有 Hermes 自己算的用量/上限/占比
          const f = hermesFooter(r?.stdout);
          if (JSON.stringify(this.hermesScreen[p.terminal]) !== JSON.stringify(f ?? null)) {
            if (f) this.hermesScreen[p.terminal] = f;
            else delete this.hermesScreen[p.terminal];
            changed = true;
          }
          // 顺手把该模型的真实窗口记住,供页脚读不到时兜底
          if (f) {
            const rec = this.hermesRec(p);
            const model = rec?.model ?? null;
            if (model && this.windows[model] !== f.limit) {
              this.windows[model] = f.limit;
              localStorage.setItem(WINDOWS_KEY, JSON.stringify(this.windows));
            }
          }
          continue;
        }
        const f = piFooter(r?.stdout);
        if (f === null) {
          if (p.terminal in this.piContext) {
            delete this.piContext[p.terminal];
            changed = true;
          }
        } else if (JSON.stringify(this.piContext[p.terminal]) !== JSON.stringify(f)) {
          this.piContext[p.terminal] = f;
          changed = true;
        }
      }
      const live = new Set(mine.map((p) => p.terminal));
      for (const k of Object.keys(this.piContext)) {
        if (!live.has(k)) {
          delete this.piContext[k];
          changed = true;
        }
      }
      for (const k of Object.keys(this.hermesScreen)) {
        if (!live.has(k)) {
          delete this.hermesScreen[k];
          changed = true;
        }
      }
      // 发布给 Agents 侧栏(hanfang-sidebar):它显示同一批终端的 token 占比,
      // 直接用这里从 Hermes 页脚读到的数,避免两处各算一套、数字对不上。
      const pubSig = JSON.stringify(this.hermesScreen);
      if (pubSig !== this.ctxSig) {
        this.ctxSig = pubSig;
        setShared("hanfang.context", this.hermesScreen);
      }
      this.polling = false;
      if (changed) cx.notify();
    });
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
      .opacity(0.55)
      .bg(fill)
      .items_center()
      .justify_center()
      .text_size(10)
      .font_bold()
      .text_color("#ffffff")
      .child([...s.name][0]?.toUpperCase() ?? "?");
  }

  // 空间状态:应用给的 s.status 基于面板 OSC(hermes 恒 idle),这里按空间内
  // 各 agent 的有效状态取最紧急自算,与轨道图标/agents 列表一致。
  spaceStatus(s) {
    const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
    const tabs = new Set((s.tabs ?? []).map((c) => c.id));
    let best = null;
    for (const p of panes()) {
      if (!tabs.has(p.tab)) continue;
      const rec = isHermes(p) ? this.hermesRec(p) : null;
      let st = rec ? (HERMES_STATE[rec.state] ?? p.status) : p.status;
      if (st === "done" && p.focused) st = "idle";
      if (st && (best === null || (RANK[st] ?? 9) < (RANK[best] ?? 9))) best = st;
    }
    return best ?? s.status;
  }

  // 一行空间。拖动排序(0.1.18 窗口级 move/up):指针离开本行、甚至拖出侧栏仍跟手;
  // 松手落在哪一行就把该空间移到那一位(space.move,1 = 第一个)。只在同一台机器内允许。
  spaceRow(s, t, i) {
    const row = h_flex()
      .id(`rail-space-${s.id}`)
      .relative()
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
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .on_click(() => {
        // 拖完松手也会算一次点击:别把刚排好的空间又切过去。
        if (this.dragged) {
          this.dragged = false;
          return;
        }
        run("space.select", { id: s.id });
      })
      .on_mouse_down("left", (_e, cx) => {
        this.pressed = i;
        this.over = i;
        this.dragged = false;
        // 开始拖:收起已经在显示的悬停弹层,并重绘(其它行的悬停提示同时撤掉)
        this.tipPending = null;
        this.tipChipHovered = false;
        if (this.tipId) { closeOverlay(this.tipId); this.tipId = null; }
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu("space", { id: s.id }))
      .on_window_mouse_move((e, cx) => this.dragOver(i, s, e, cx))
      .on_window_mouse_up("left", (_e, cx) => this.dropOn(i, cx))
      .child(this.avatar(s, t))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(TEXT.label)
          .text_color(s.active ? t.foreground : t.muted)
          .child(s.name),
      )
      .child(
        div()
          .flex_none()
          .text_size(12)
          .text_color(tone(t, this.spaceStatus(s)))
          .child(glyph(this.spaceStatus(s))),
      )
      .child(this.prBadge(s, t));
    // 落点指示线(往上拖):显示在本行顶部。往下拖那条画在目标空间终端清单的下方
    // (见 chips()),否则会插在空间行与它自己的终端图标之间。
    if (this.pressed !== null && this.over === i && this.pressed > i)
      row.child(dropLine(t, true));
    return row;
  }

  // 窗口级移动命中:指针在本元素框内、且按下的是同一台机器的空间时,把它记为落点。
  // 空间行和它下面的终端清单都挂这个,往哪块上瞄都算落在这个空间。
  dragOver(i, s, e, cx) {
    if (this.pressed === null || e.pressed_button !== "left") return;
    const b = e.bounds;
    const inside = b && e.local_position.x >= 0 && e.local_position.y >= 0 &&
      e.local_position.x <= b.width && e.local_position.y <= b.height;
    if (!inside) return;
    const src = spaces()[this.pressed];
    if (!src || (src.machine ?? null) !== (s.machine ?? null)) return;
    if (this.over !== i) {
      this.over = i;
      this.dragged = true;
      cx.notify();
    }
  }

  // 松手落位:每行都收到窗口级 release,只有目标行(i === over)才处理。
  dropOn(i, cx) {
    if (this.pressed === null || i !== this.over) return;
    const from = this.pressed;
    this.pressed = null;
    this.over = null;
    if (from !== i) {
      const target = spaces()[from];
      if (target) run("space.move", { id: target.id, index: i + 1 });
      this.dragged = true;
    }
    cx.notify();
  }

  // 一个终端的上下文占比:pi 取屏幕页脚,hermes 取会话记录;无数据返回 {}。
  ctxPct(q, rec = null) {
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
    let pct = this.piContext[q.terminal];
    if (pct !== undefined)
      return {
        pct: pct.pct,
        detail: `上下文 ${pct.pct}%`,
        tokens: `${k(Math.round((pct.limit * pct.pct) / 100))}/${k(pct.limit)}`,
      };
    // hermes:优先用页脚里 Hermes 自己算的那一套(和终端里显示的一致);
    // 页脚读不到(无终端会话/正在滚动)时才退回 JSON 里的 context_tokens。
    const screen = this.hermesScreen?.[q.terminal];
    if (screen) return { pct: screen.pct, detail: `上下文 ${screen.used}/${screen.limit} tok(${screen.pct}%)`, tokens: `${k(screen.used)}/${k(screen.limit)}` };
    rec = rec ?? (isHermes(q) ? this.hermesRec(q) : null);
    // 记录里只有状态、没有 token 数(该会话还没报过 pre_api_request):不画进度条。
    if (!rec || typeof rec.context_tokens !== "number") return {};
    const window = this.windows?.[rec.model ?? ""] ?? 1000000;
    pct = Math.min(100, Math.round((rec.context_tokens / window) * 1000) / 10);
    return { pct, detail: `上下文 ${rec.context_tokens}/${window} tok(${pct}%)`, tokens: `${k(rec.context_tokens)}/${k(window)}` };
  }

  // 弹层看门狗:图标和弹层都不在悬停(宽限 300ms 过渡)才关闭。
  tipWatchdog() {
    // 拖动排序时一律不弹悬停弹层(也不留残留)
    if (this.pressed !== null) {
      this.tipPending = null;
      this.tipChipHovered = false;
      if (this.tipId) { closeOverlay(this.tipId); this.tipId = null; }
      return;
    }
    if (this.tipPending) {
      if (!this.tipChipHovered) this.tipPending = null;
      else if (Date.now() - this.tipPending.at >= 100) {
        const { p, all } = this.tipPending;
        this.tipPending = null;
        this.openTip(p, all);
      }
    }
    if (!this.tipId) return;
    const ph = shared("hanfang.tip.hover");
    const popupHovered = ph && ph.gen === this.tipGen && ph.hover;
    if (this.tipChipHovered || popupHovered) {
      this.tipBothLeftAt = 0;
      return;
    }
    if (!this.tipBothLeftAt) this.tipBothLeftAt = Date.now();
    else if (Date.now() - this.tipBothLeftAt > 300) {
      closeOverlay(this.tipId);
      this.tipId = null;
    }
  }

  // 悬停:弹整个空间的终端清单(hanfang-tip 弹层,指针处弹出)。
  // 关闭由弹层自管理:指针移入弹层则保持,离开才关;直接移开 0.7s 后自闭。
  tipHover(on, p, all) {
    if (this.pressed !== null) { // 正在拖动:不追踪悬停,不弹
      this.tipChipHovered = false;
      this.tipPending = null;
      return;
    }
    // 延时 100ms:悬停满时限才真正弹(由看门狗兑现);提前离开则取消
    this.tipChipHovered = on;
    this.tipPending = on ? { p, all, at: Date.now() } : null;
  }

  openTip(p, all) {
    if (this.tipId) closeOverlay(this.tipId);
    this.tipGen += 1;
    const s = settings();
    // 与 hanfang-tip 显示字号一致(弹层收 1.5,行高按它算)。
    const size = Math.max(9, (s.ui_font_size ?? 12.5) - 1.5);
    const list = all ?? [p];
    // 名称回退链:重命名过的标签页名 > 终端名(hc)> 程序设置的标题 > 程序名;
    // 拆分标签页(同名多行)拼上各自的标题以示区分。
    const terms = new Map(terminals().map((x) => [x.address, x.name ?? null]));
    const lines = list.map((q) => {
      const program = q.program ?? {};
      const space = spaces().find((s) => (s.tabs ?? []).some((tb) => tb.id === q.tab));
      const tab = space?.tabs?.find((tb) => tb.id === q.tab) ?? {};
      const siblings = list.filter((x) => x.tab === q.tab).length;
      const base = terms.get(q.terminal) || q.title || program.name || "终端";
      const name = tab.name ? (siblings > 1 ? `${tab.name} · ${base}` : tab.name) : base;
      const { pct, tokens } = this.ctxPct(q);
      return {
        key: q.pane,
        mine: q.pane === p.pane,
        name,
        program: program.name && program.name !== name ? program.name : null,
        pct,
        tokens: tokens ?? null,
        tab: q.tab,
        terminal: q.terminal,
      };
    });
    this.tipId = openOverlay({
      mod: "hanfang-tip",
      kind: "popup",
      props: { lines, gen: this.tipGen },
      width: 360,
      height: 12 + lines.length * (size + 8),
      ...(this.tipAt ? { at: this.tipAt } : {}),
    });
  }

  // 一个终端的图标块:运行中变黄慢闪烁;其余状态着状态色;
  // 不可着色的图片图标加状态角点。
  chip(p, t, all = null) {
    // hermes:会话记录驱动状态(working=黄闪)与上下文占比;其余走通用逻辑。
    const rec = isHermes(p) ? this.hermesRec(p) : null;
    const busy = rec ? rec.state === "working" : running(p);
    // 有效状态:hermes 用会话记录(done 被盯着看时按原生语义转 idle),其余用面板状态。
    let eff = rec ? (HERMES_STATE[rec.state] ?? p.status) : p.status;
    if (eff === "done" && p.focused) eff = "idle";
    const color = busy ? t.ansi3 : tone(t, eff);
    const program = p.program ?? {};
    const { pct } = this.ctxPct(p, rec);
    const hasBar = pct !== undefined;
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
      .on_hover((h) => this.tipHover(h, p, all))
      .on_mouse_move((e) => {
        // 记录图标位置,弹层定位到其正下方
        this.tipAt = { x: e.bounds.x, y: e.bounds.y + e.bounds.height + 6 };
      })
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
            .when(hasBar, (d) => d.top(-1))
            .when(!hasBar, (d) => d.bottom(-1))
            .size(5)
            .rounded(3)
            .bg(color)
            .when(busy, (d) => d.loop("opacity", PULSE)),
        ),
      )
      // 上下文进度条:图标底部,底轨 18px,1px 高,填充宽度=占比,颜色随占比变。
      .when(hasBar, (el) =>
        el
          .child(div().absolute().left(2).right(2).bottom(2).h(1).bg(t.border))
          .when(pct > 0, (e) =>
            e.child(
              div()
                .absolute()
                .left(2)
                .bottom(2)
                .h(1)
                .w(Math.max(1, Math.round((18 * pct) / 100)))
                .bg(contextColor(t, pct)),
            ),
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
      .when(this.pressed === null, (el) => el.tooltip("新建标签页"))
      .on_click(() => run("tab.new", { space: s.id }))
      .child(div().text_size(13).child("+"));
  }

  chips(s, t, i) {
    // 按标签页分组:一个 tab 内的多个窗格(拆分)框进同一个背景框,表示是一起的。
    const groups = (s.tabs ?? [])
      .map((tab) => panes().filter((p) => p.tab === tab.id && p.terminal))
      .filter((ps) => ps.length > 0);
    const all = groups.flat();
    const part = (ps, i) => {
      const cells = ps.map((p) => this.chip(p, t, all));
      if (ps.length === 1) return cells[0];
      return h_flex()
        .id(`rail-split-${s.id}-${i}`)
        .flex_none()
        .p(2)
        .gap(3)
        .rounded(7)
        .bg(t.canvas)
        .border(1)
        .border_color(t.border)
        .items_center()
        .children(cells);
    };
    const chips = h_flex()
      .id(`rail-chips-${s.id}`)
      .relative()
      .flex_wrap()
      .gap(4)
      .pl(14)
      .pr(8)
      .pb(5)
      .flex_none()
      .on_window_mouse_move((e, cx) => this.dragOver(i, s, e, cx))
      .on_window_mouse_up("left", (_e, cx) => this.dropOn(i, cx))
      .children(groups.map(part))
      .child(this.plusChip(s, t));
    // 落点指示线(往下拖):画在本空间终端清单的下方——插到空间行与它自己的终端图标
    // 之间是错的,整个空间(行 + 终端)作为一个整体移动。
    if (this.pressed !== null && this.over === i && this.pressed < i) chips.child(dropLine(t, false));
    return chips;
  }

  // 机器分组头(参照 orca 的分隔方式):机器之间一条 1px 规则线(首台无),
  // 栏本身是 26px 悬停圆角条——chevron 折叠整机(localStorage 持久)、monitor/server
  // 图标、semibold 前景色名称、右端 6px 连接圆点(绿=连通/灰=断)。space 之间不再画线
  // (分隔靠机器段与行悬停,orca 同样做法)。
  // 断连(layout="unavailable")时灰显 + 「重连」小按钮;机器注册了就永远显示,
  // 不因断连从侧栏消失(现实逻辑:断连≠不存在)。
  machineHeader(m, t, isLocal, isFirst, layout = "ready", count = 0) {
    const dead = !isLocal && layout === "unavailable";
    const st = dead ? RECONN[m] : null;
    const key = isLocal ? "__local__" : m;
    const folded = this.foldedMachines.has(key);
    const bar = h_flex()
      .id(`rail-machine-${isLocal ? "local" : m}`)
      .h(26)
      .mx(8)
      .mt(isFirst ? 2 : 0)
      .pl(4)
      .pr(6)
      .flex_none()
      .gap(6)
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .when(this.pressed === null, (el) => el.tooltip(dead ? (st?.error ? `${m} 无法连接:${st.error}` : `${m} 无法连接`) : folded ? "展开分组" : "折叠分组"))
      .on_click((_e, cx) => {
        if (!this.foldedMachines.delete(key)) this.foldedMachines.add(key);
        localStorage.setItem("rail.machines.folded", JSON.stringify([...this.foldedMachines]));
        cx.notify();
      })
      .child(svg(`mods/hanfang-sidebar/icons/chevron-${folded ? "right" : "down"}.svg`).size(12).flex_none().text_color(t.dim))
      .child(
        svg(isLocal ? "mods/hanfang-sidebar/icons/monitor.svg" : "mods/hanfang-sidebar/icons/server.svg")
          .size(13)
          .flex_none()
          .text_color(dead ? t.dim : t.muted),
      )
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .font_semibold()
          .text_size(12)
          .text_color(dead ? t.dim : t.foreground)
          .child(isLocal ? "本机" : m),
      )
      .when(dead, (el) =>
        el.child(
          div()
            .id(`rail-reconnect-${m}`)
            .flex_none()
            .px(5)
            .rounded(4)
            .text_size(10.5)
            .text_color(t.muted)
            .cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(m, cx); })
            .child(st?.busy ? "重连中…" : "重连"),
        ))
      .when(folded, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(String(count))))
      .child(
        div()
          .size(6)
          .mx(2)
          .rounded(3)
          .flex_none()
          .bg(dead ? t.dim : t.ansi2)
          .when(this.pressed === null, (el) => el.tooltip(dead ? (st?.busy ? "重连中" : "未连接") : "已连接")),
      );
    // 机器间一条规则线;首台之前没有。
    return v_flex()
      .id(`rail-machine-section-${isLocal ? "local" : m}`)
      .flex_none()
      .when(!isFirst, (el) => el.child(div().h(1).mx(10).mt(10).mb(6).flex_none().bg(t.border)))
      .child(bar);
  }

  // 立即重连:非破坏性,只触发 hc machine login;成功后 machines()/spaces() 自动重渲染回正常态。
  reconnect(name, cx) {
    const st = RECONN[name] ??= { busy: false, error: null };
    if (st.busy) return;
    st.busy = true;
    st.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "login", name]);
        if (r.code !== 0) {
          let msg;
          try { msg = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
          throw new Error(msg || r.stderr || r.stdout || "连接失败");
        }
        st.busy = false;
      } catch (e) {
        st.busy = false;
        st.error = String(e.message ?? e);
      }
      cx.notify();
    });
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
      .when(this.pressed === null, (el) => el.tooltip("新建空间"))
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
                  .when(this.pressed === null, (el) => el.tooltip("所有空间的 agent 总数 · 点击跳到下一个"))
                  .on_click(() => run("agent.next"))
                  .child(div().text_color(t.muted).child("Agents"))
                  .child(div().text_color(t.foreground).child(String(n))),
              ),
          ),
      )
      .child(this.newSpaceButton(t));
  }

  // 分组:机器段(见 machineHeader)+ 该机空间;空间之间不画线,由行悬停与段结构分隔。
  grouped(sp, t) {
    // 机器注册表(machines() 恒含已注册机器,断连的 layout="unavailable"):
    // 断连时 space.machine 会被读成 null,只按 space 分组会让机器整组消失——
    // 所以分组 = space 的 machine ∪ 注册表,断连机器仍显示(灰态,见 machineHeader)。
    const mstate = new Map(machines().filter((x) => x.name).map((x) => [x.name, x.layout]));
    const out = [];
    let seen = "__none__"; // 哨兵:还没遇到过任何机器
    let first = true;
    const shown = new Set();
    // 每台机器的空间数(机器折叠时在头右侧显示)。
    const counts = new Map();
    for (const s of sp) {
      const k = s.machine ?? "__local__";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i];
      const m = s.machine ?? null; // null=本机
      if (m !== seen) {
        const key = m ?? "__local__";
        out.push(this.machineHeader(m, t, m === null, first, m === null ? "ready" : (mstate.get(m) ?? "ready"), counts.get(key) ?? 0));
        if (m) shown.add(m);
        seen = m;
        first = false;
      }
      if (this.foldedMachines.has(m ?? "__local__")) continue; // 折叠:跳过该机空间
      out.push(this.spaceRow(s, t, i));
      out.push(this.chips(s, t, i));
    }
    // 注册了但当前没有 space 挂靠的断连机器(其 space 被并入本机组):尾部补灰态分组头。
    for (const [name, layout] of mstate) {
      if (!shown.has(name) && layout === "unavailable") {
        out.push(this.machineHeader(name, t, false, false, "unavailable"));
      }
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
