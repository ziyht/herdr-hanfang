#!/bin/bash
# Herdr 界面中文化锁定补丁 v2
# 对「应用每次启动会用内嵌源码重写」的 9 个界面文件做原地中文化 + 文件锁:
#   mods/{confirm,prompt,peek,help} + frame/{settings,palette,welcome,whatsnew,feedback}
# 原理: 写中文版后 chmod 444 + chflags uchg, Herdr 启动时写不进去就跳过。
# 译文: yzj160212/herdr-zh(0.1.10)骨架配对借阅 + 移植到本机 0.1.16, 代理→agent。
#
# v2 改进:
#   1. 目标根 = ${HERDR_APP_HOME:-~/.config/herdr-app}, 任意位置可运行
#      (v1 取脚本上级目录, 从 repo 里直接跑会九个全报「不存在」)
#   2. 升级检测: apply 成功后把 Herdr 版本写入 $APP/zh-patch/.applied-version;
#      版本不符时 apply 默认拒绝并给移植指引, --force 强制
#   3. 基线漂移预检: live 与 orig/、zh/ 均不一致且未锁定 → 默认中止
#   4. 逐文件容错: 单个失败不再中断整批, 末尾汇总, 有失败退出非零
#   5. --status 增加「基线」列; 版本升级时置顶警告
#   6. --restart: 应用/还原成功后自动重启 Herdr
#
# 用法: ./apply.sh [--force] [--restart]     应用中文并锁定
#       ./apply.sh --restore [--restart]     还原英文(解锁, 下次启动 Herdr 自动接管)
#       ./apply.sh --status                  查看锁定与基线状态
# 环境变量: HERDR_APP_HOME 覆盖目标根目录(默认 ~/.config/herdr-app)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MARKER_DIR="$APP/zh-patch"
MARKER="$MARKER_DIR/.applied-version"

TARGETS=(
  "confirm|mods/confirm/main.js"
  "prompt|mods/prompt/main.js"
  "peek|mods/peek/main.js"
  "help|mods/help/main.js"
  "settings|frame/settings/main.js"
  "palette|frame/palette/main.js"
  "welcome|frame/welcome/main.js"
  "whatsnew|frame/whatsnew/main.js"
  "feedback|frame/feedback/main.js"
)

MODE=apply; FORCE=0; RESTART=0
usage() {
  cat <<'U'
用法: apply.sh [--force] [--restart]     应用中文并锁定
      apply.sh --restore [--restart]     还原英文
      apply.sh --status                  查看锁定与基线状态
选项: --force    跳过版本门检与漂移预检
      --restart  操作成功后自动重启 Herdr
环境: HERDR_APP_HOME 覆盖目标根(默认 ~/.config/herdr-app), 任意目录均可运行本脚本
U
}
for a in "$@"; do
  case "$a" in
    apply|--apply)   MODE=apply ;;
    restore|--restore) MODE=restore ;;
    status|--status)   MODE=status ;;
    --force)    FORCE=1 ;;
    --restart)  RESTART=1 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "未知参数: $a" >&2; usage; exit 2 ;;
  esac
done

app_version() {
  { herdr-app --version 2>/dev/null \
    || defaults read /Applications/SSH/Herdr.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null \
    || defaults read /Applications/Herdr.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null; } \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}
unlock()    { chflags nouchg "$1" 2>/dev/null || true; chmod 644 "$1" 2>/dev/null || true; }
is_locked() { ls -lO "$1" 2>/dev/null | grep -q uchg; }
marked_version() { cat "$MARKER" 2>/dev/null || true; }
herdr_restart() {
  echo "重启 Herdr …"
  osascript -e 'quit app "Herdr"' 2>/dev/null || true
  sleep 3
  open -a Herdr
  echo "已重启。"
}

[ -d "$APP" ] || { echo "错误: 应用目录不存在: $APP (可用 HERDR_APP_HOME 覆盖)" >&2; exit 1; }

case "$MODE" in
status)
  VER="$(app_version)"; MARKED="$(marked_version)"
  MBASE="译文 v$MARKED"; [ -n "$MARKED" ] || MBASE="译文(基线未记录)"
  if [ -n "$MARKED" ] && [ -n "$VER" ] && [ "$MARKED" != "$VER" ]; then
    echo "⚠️  Herdr 已升级: 译文基线 $MARKED → 当前 $VER, 界面可能缺新选项"
    echo "    流程: --restore → 按 RECIPE 移植(orig/ 对齐新版) → 再 apply"
  fi
  printf '%-34s %-16s %s\n' "文件" "状态" "基线"
  for t in "${TARGETS[@]}"; do
    n="${t%%|*}"; f="$APP/${t##*|}"
    if   [ ! -e "$f" ];                        then st="不存在 ⚠️";   base=""
    elif is_locked "$f";                       then st="已锁定(中文)"; base="$MBASE"
    elif cmp -s "$HERE/orig/$n.js" "$f";       then st="未锁定(英文)"; base="对齐"
    elif cmp -s "$HERE/zh/$n.js"   "$f";       then st="未锁定(中文)"; base="对齐"
    else                                            st="未锁定 ⚠️";    base="漂移"
    fi
    printf '%-34s %-16s %s\n' "${t##*|}" "$st" "$base"
  done
  ;;

apply)
  VER="$(app_version)"
  if [ -z "$VER" ]; then
    echo "警告: 无法确定 Herdr 版本, 跳过版本门检" >&2
  else
    MARKED="$(marked_version)"
    if [ -n "$MARKED" ] && [ "$MARKED" != "$VER" ]; then
      if [ "$FORCE" -eq 0 ]; then
        echo "错误: Herdr 已从 $MARKED 升级到 $VER, 当前译文基于旧版。" >&2
        echo "  正确流程: --restore 还原英文 → 按 RECIPE 重新移植(orig/ 对齐新版) → 再 apply" >&2
        echo "  或 --force 强制应用(旧界面, 可能缺新选项)" >&2
        exit 1
      fi
      echo "警告: --force 跳过版本门检(译文基线 $MARKED ≠ 当前 $VER)"
    fi
  fi
  # 基线漂移预检
  drift=0
  for t in "${TARGETS[@]}"; do
    n="${t%%|*}"; f="$APP/${t##*|}"
    if [ ! -e "$f" ]; then
      echo "⚠️  目标不存在: ${t##*|}"; drift=1; continue
    fi
    if ! is_locked "$f" && ! cmp -s "$HERE/orig/$n.js" "$f" && ! cmp -s "$HERE/zh/$n.js" "$f"; then
      echo "⚠️  基线漂移: ${t##*|} (live 与 orig/、zh/ 均不一致, 可能 app 重写过)"
      drift=1
    fi
  done
  if [ "$drift" -eq 1 ] && [ "$FORCE" -eq 0 ]; then
    echo "错误: 存在漂移/缺失, 默认中止。按 README「升级」一节的骨架 diff 流程重新移植, 或 --force" >&2
    exit 1
  fi
  # 逐文件应用(单文件失败不中断)
  fail=0
  for t in "${TARGETS[@]}"; do
    n="${t%%|*}"; f="$APP/${t##*|}"
    if [ ! -e "$f" ]; then echo "❌ 跳过(不存在): ${t##*|}"; fail=1; continue; fi
    unlock "$f"
    if ! cp "$HERE/zh/$n.js" "$f"; then echo "❌ 失败: ${t##*|}"; fail=1; continue; fi
    chmod 444 "$f"
    chflags uchg "$f" 2>/dev/null || echo "警告: ${t##*|} 锁定失败, 重启后可能被覆盖"
    echo "已应用中文并锁定: ${t##*|}"
  done
  if [ "$fail" -eq 0 ]; then
    mkdir -p "$MARKER_DIR"; [ -n "$VER" ] && echo "$VER" > "$MARKER"
    echo "完成。"
    if [ "$RESTART" -eq 1 ]; then herdr_restart
    else echo "重启 Herdr 生效: osascript -e 'quit app \"Herdr\"'; sleep 3; open -a Herdr (或加 --restart)"; fi
  else
    echo "存在失败项, 详见上方 ❌ 行。" >&2
    exit 1
  fi
  ;;

restore)
  fail=0
  for t in "${TARGETS[@]}"; do
    n="${t%%|*}"; f="$APP/${t##*|}"
    if [ ! -e "$f" ]; then echo "❌ 跳过(不存在): ${t##*|}"; fail=1; continue; fi
    unlock "$f"
    if ! cp "$HERE/orig/$n.js" "$f"; then echo "❌ 失败: ${t##*|}"; fail=1; continue; fi
    echo "还原英文: ${t##*|}"
  done
  rm -f "$MARKER"
  if [ "$fail" -eq 0 ]; then
    echo "已还原(版本标记已清除)。下次启动 Herdr 会自动接管这些文件。"
    [ "$RESTART" -eq 1 ] && herdr_restart
  else
    echo "存在失败项, 详见上方 ❌ 行。" >&2
    exit 1
  fi
  ;;
esac
