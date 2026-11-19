#!/usr/bin/env python3
"""zh-mods-patch 引擎：对已安装 mod 的源文件做精确字符串替换（汉化）。
- dicts/<mod>.json : {"英文原文(源码片段,模板保留${})": "中文译文"}
- pristine/<mod>/  : 首次 apply 时的原版快照（--restore 用）
- 幂等：译文替换后原文消失，重跑 = no-op；升级后重跑，匹配不到的词条报告为 missing
"""
import json, os, shutil, subprocess, sys

HOME = os.environ.get("HERDR_APP_HOME", os.path.expanduser("~/.config/herdr-app"))
HERE = os.path.dirname(os.path.abspath(__file__))
MODS = os.path.join(HOME, "mods")
SKIP_FILES = {".herdr-nvim", "runtime-stamp", "jsconfig.json"}
SKIP_DIRS = {".cache", "bin", "node_modules", ".git"}

def mod_files(mod):
    root = os.path.join(MODS, mod)
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            if f in SKIP_FILES or f.endswith((".png", ".svg", ".d.ts", ".error")):
                continue
            if f.endswith((".js", ".json")):
                out.append(os.path.join(dirpath, f))
    return out

def apply_mod(mod, do_apply=True):
    d = os.path.join(HERE, "dicts", mod + ".json")
    if not os.path.exists(d):
        print(f"  {mod}: 没有字典，跳过")
        return True
    dic = json.load(open(d, encoding="utf-8"))
    pris = os.path.join(HERE, "pristine", mod)
    if do_apply and not os.path.exists(pris):
        shutil.copytree(os.path.join(MODS, mod), pris,
                        ignore=shutil.ignore_patterns(".cache"))
        print(f"  {mod}: 已保存原版快照")
    applied = already = 0
    found = set()
    for path in mod_files(mod):
        text = open(path, encoding="utf-8").read()
        orig = text
        for en, zh in dic.items():
            if en in text:
                n = text.count(en)
                text = text.replace(en, zh)
                applied += n
                found.add(en)
            elif zh in text:
                already += 1
                found.add(en)
        if text != orig:
            open(path, "w", encoding="utf-8").write(text)
    missing = [en for en in dic if en not in found]
    print(f"  {mod}: 替换 {applied} 处，已应用 {len(found)}/{len(dic)} 条" + (f"，未匹配 {len(missing)} 条" if missing else ""))
    for en in missing[:8]:
        print(f"    ✗ {en[:60]}")
    if len(missing) > 5:
        print(f"    …共 {len(missing)} 条未匹配（可能 mod 已升级改了文案）")
    return True

def restore_mod(mod):
    pris = os.path.join(HERE, "pristine", mod)
    if not os.path.exists(pris):
        print(f"  {mod}: 没有快照，无法还原"); return False
    dest = os.path.join(MODS, mod)
    subprocess.run(["rm", "-rf", dest], check=True)
    shutil.copytree(pris, dest)
    print(f"  {mod}: 已还原为快照版本（若 mod 已升级，建议重装后再 apply）")
    return True

def main():
    args = sys.argv[1:]
    mode = "apply"
    if args and args[0] in ("--restore", "--status"):
        mode = {"--restore": "restore", "--status": "status"}[args[0]]
        args = args[1:]
    mods = args or [f[:-5] for f in os.listdir(os.path.join(HERE, "dicts")) if f.endswith(".json")]
    print(f"zh-mods-patch: {mode} [{' '.join(mods) if mods else '全部'}]")
    for m in mods:
        if mode == "apply":
            apply_mod(m)
            r = subprocess.run(["herdr-app", "check", os.path.join(MODS, m)],
                               capture_output=True, text=True)
            ok = "check passed" in (r.stdout + r.stderr)
            print(f"  herdr-app check: {'✓ 通过' if ok else '✗ 失败!'}")
            if not ok:
                print(r.stdout[-500:] or r.stderr[-500:]); sys.exit(1)
        elif mode == "restore":
            restore_mod(m)
        else:
            print(f"  {m}: 字典 {len(json.load(open(os.path.join(HERE, 'dicts', m + '.json'))))} 条")

if __name__ == "__main__":
    main()
