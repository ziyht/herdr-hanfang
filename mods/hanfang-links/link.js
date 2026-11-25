// ⌘(Ctrl)+点击终端里的文件路径:交给 herdr-nvim,在**点击处所在标签页**的 nvim 里
// 打开该文件并跳到行号(`path:42`、`:5-12`、`#L5-L12` 由 Herdr 解析成 link.line)。
//
// 只在能真处理时接管:
//   - link.path 为空(远程、未解析、非 UTF-8)→ 交回 Herdr 原生打开方式
//   - 点击发生在别的机器上 → 本机 nvim 打不开,交回
//   - herdr-nvim 的 open-link 非零退出(没装 nvim / 该标签页拉不起 nvim)→ 交回
// 规则本身(mod.json 的 link_handlers)已经按源码扩展名过滤过,普通词汇不会被抓走。
import { exec, appHome } from "herdr";

const bin = () => `${appHome()}/mods/herdr-nvim/bin/herdr-nvim`;

export async function handleLink({ link, source }) {
  const path = link?.path;
  if (!path) return "pass";
  if (source?.machine) return "pass";
  const target = link.line ? `${path}:${link.line}` : path;
  const ctx = JSON.stringify({
    space: source?.space ?? null,
    tab: source?.tab ?? null,
    terminal: source?.terminal ?? null,
    cwd: source?.cwd ?? null,
  });
  try {
    const r = await exec(bin(), ["open-link", target, "--ctx", ctx], { cwd: source?.cwd ?? undefined });
    if (r && r.code === 0) return "handled";
  } catch {
    // 掉到 pass:让 Herdr 用它自己的打开方式
  }
  return "pass";
}
