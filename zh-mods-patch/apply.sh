#!/bin/sh
# zh-mods-patch：第三方 mod 的字典式汉化（就地补丁 + 热重载即时生效）
# 用法：
#   ./apply.sh              # 应用全部字典（幂等；升级 mod 后重跑）
#   ./apply.sh herdr-nvim   # 只应用指定 mod
#   ./apply.sh --restore    # 还原为原版快照（若 mod 已升级，建议重装后再 apply）
#   ./apply.sh --status     # 查看各字典条目数
# 升级流程：升级 mod（重跑其 installer / rsync / go install）→ ./apply.sh
#   能匹配的词条自动翻好；匹配不到的（上游改了文案）会列出来，人工补进 dicts/*.json。
exec python3 "$(dirname "$0")/apply.py" "$@"
