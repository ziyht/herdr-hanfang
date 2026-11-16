#!/bin/bash
# Herdr 界面中文化锁定补丁
# 对「应用每次启动会用内嵌源码重写」的 9 个界面文件做原地中文化 + 文件锁:
#   mods/{confirm,prompt,peek,help} + frame/{settings,palette,welcome,whatsnew,feedback}
# 原理:写中文版后 chmod 444 + chflags uchg,Herdr 启动时写不进去就跳过。
# 译文:yzj160212/herdr-zh(0.1.10)骨架配对借阅 + 移植到本机 0.1.16,代理→agent。
# 用法: ./apply.sh            应用中文并锁定
#       ./apply.sh --restore  还原英文(解锁,下次启动 Herdr 自动接管)
#       ./apply.sh --status   查看锁定状态
# 注意:Herdr 升级后这些文件不会跟进新版,若设置页缺新选项,重跑本脚本前先按
#       orig/ 与新版源码重新对齐(参见 herdr skill 的骨架 diff 流程)。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="$(cd "$HERE/.." && pwd)"
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
unlock() { chflags nouchg "$1" 2>/dev/null || true; chmod 644 "$1" 2>/dev/null || true; }
is_locked() { ls -lO "$1" 2>/dev/null | grep -q uchg; }
case "${1:-apply}" in
  status|--status)
    for t in "${TARGETS[@]}"; do
      f="$BASE/${t##*|}"
      if [ ! -e "$f" ]; then s="不存在"; elif is_locked "$f"; then s="已锁定(中文)"; else s="未锁定(可能被升级覆盖)"; fi
      printf "%-40s %s\n" "${t##*|}" "$s"
    done ;;
  restore|--restore)
    for t in "${TARGETS[@]}"; do
      n="${t%%|*}"; f="$BASE/${t##*|}"
      unlock "$f"; cp "$HERE/orig/$n.js" "$f"
      echo "还原英文: ${t##*|}"
    done
    echo "已还原。下次启动 Herdr 会自动接管这些文件。" ;;
  apply|*)
    for t in "${TARGETS[@]}"; do
      n="${t%%|*}"; f="$BASE/${t##*|}"
      unlock "$f"; cp "$HERE/zh/$n.js" "$f"
      chmod 444 "$f"; chflags uchg "$f" 2>/dev/null || echo "警告: ${t##*|} 锁定失败,重启后可能被覆盖"
      echo "已应用中文并锁定: ${t##*|}"
    done
    echo "完成。重启 Herdr 生效:"
    echo "  osascript -e 'quit app \"Herdr\"'; sleep 3; open -a Herdr" ;;
esac
