#!/bin/bash
# 汉坊安装器 —— 符号链接架构:仓库即现场。
# 自有件(布局/hanfang-*/-zh mod/programs/my-icons/主题)符号链接进 ~/.config/herdr-app,
#   现场热编辑=改仓库文件,git status 即时可见,消灭"两边同步"问题。
# 社区件(better-*/branch-*/herdr-nvim*)拷贝 + zh-mods-patch 字典汉化(就地改,不能链)。
# 幂等:重复运行只修复缺失/断链;现场若有独立新内容,先回写仓库再链,不丢改动。
# 用法: ./install.sh          环境变量 HERDR_APP_HOME 可覆盖目标根。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

OWN_MODS=(hanfang-spaces hanfang-sidebar hanfang-tip files-zh machine-add-zh menu-zh new-menu-zh pane-zh picker-zh toast-zh workspace-chrome-zh workspace-status-zh worktree-zh)
COMMUNITY_MODS=(better-sidebar better-tabs better-changes better-files branch-pr branch-issue herdr-nvim herdr-nvim-header)

mkdir -p "$APP/mods" "$APP/layouts" "$APP/themes"

link() { # $1=仓库源 $2=现场目标 —— 现场有独立新内容先回写仓库,再(重)建链接
  local src="$1" dst="$2"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    if [ -d "$dst" ]; then
      if ! diff -r --exclude='gpui-kit.d.ts' --exclude='jsconfig.json' "$dst" "$src" >/dev/null 2>&1; then
        echo "  ⚠️ 现场有新改动,回写仓库: $dst"
        rsync -a --delete --exclude='gpui-kit.d.ts' --exclude='jsconfig.json' "$dst/" "$src/"
      fi
    else
      cmp -s "$dst" "$src" || { echo "  ⚠️ 现场有新改动,回写仓库: $dst"; cp "$dst" "$src"; }
    fi
    rm -rf "$dst"
  fi
  [ -L "$dst" ] || ln -s "$src" "$dst"
}

echo "== 1 自有件 → 符号链接(仓库即现场) =="
for m in "${OWN_MODS[@]}"; do link "$HERE/mods/$m" "$APP/mods/$m"; done
link "$HERE/layouts/hanfang.json" "$APP/layouts/hanfang.json"
link "$HERE/programs.json" "$APP/programs.json"
link "$HERE/my-icons" "$APP/my-icons"
[ -f "$HERE/themes/catppuccin.json" ] && link "$HERE/themes/catppuccin.json" "$APP/themes/catppuccin.json"
echo "  ${#OWN_MODS[@]} mod + 布局 + programs + my-icons + 主题 ✅"

echo "== 2 社区件 → 拷贝 + 字典汉化 =="
for m in "${COMMUNITY_MODS[@]}"; do rsync -a --delete "$HERE/mods/$m/" "$APP/mods/$m/"; done
if [ -d "$APP/zh-mods-patch" ] && [ -x "$APP/zh-mods-patch/apply.sh" ]; then
  "$APP/zh-mods-patch/apply.sh" | tail -4
else
  echo "  (zh-mods-patch 未安装——如需社区面板中文: cp -R $HERE/zh-mods-patch $APP/ && $APP/zh-mods-patch/apply.sh)"
fi

echo "== 3 验收 =="
ok=0; fail=0
for m in "${OWN_MODS[@]}" "${COMMUNITY_MODS[@]}"; do
  if herdr-app check "$APP/mods/$m" >/dev/null 2>&1; then ok=$((ok+1)); else fail=$((fail+1)); echo "  ❌ $m"; fi
done
echo "check: $ok/$((ok+fail)) 通过"
herdr-app do layout.switch --name hanfang >/dev/null 2>&1 || true
echo "完成。可选后续:第三步 zh-patch(原生界面)、第四步 hermes-bridge(见 README)、keys.json 键位合并。"
