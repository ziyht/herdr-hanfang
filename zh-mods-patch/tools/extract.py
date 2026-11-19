#!/usr/bin/env python3
"""提取 JS 源文件里的字符串字面量（用户可见文案候选）。
递归下降：处理单/双引号转义、嵌套 ${} 的模板字符串、注释跳过。"""
import sys, json, re

def extract(src):
    out, i, n = [], 0, len(src)
    line = 1
    def adv(k):
        nonlocal i, line
        for _ in range(k):
            if i < n and src[i] == "\n": line += 1
            i += 1
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i+1] == "/":
            while i < n and src[i] != "\n": adv(1)
            continue
        if c == "/" and i + 1 < n and src[i+1] == "*":
            adv(2)
            while i + 1 < n and not (src[i] == "*" and src[i+1] == "/"): adv(1)
            adv(2); continue
        if c in "\"'":
            q, start = c, i
            adv(1)
            buf = []
            while i < n and src[i] != q:
                if src[i] == "\\":
                    adv(1)
                    if i < n: buf.append(src[i]); adv(1)
                else: buf.append(src[i]); adv(1)
            adv(1)
            out.append(("s", "".join(buf), line))
            continue
        if c == "`":
            start_line = line
            adv(1)
            buf, parts, cur = [], [], []
            depth = 0
            while i < n:
                ch = src[i]
                if depth == 0 and ch == "\\":
                    adv(1)
                    if i < n: buf.append(src[i]); adv(1)
                    continue
                if depth == 0 and ch == "`": adv(1); break
                if depth == 0 and ch == "$" and i + 1 < n and src[i+1] == "{":
                    adv(2); depth = 1; parts.append("".join(buf)); buf = []
                    continue
                if depth > 0:
                    if ch == "{": depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            parts.append(("expr", "".join(buf))); buf = []
                            adv(1); continue
                    adv(1); continue
                buf.append(ch); adv(1)
            if parts:
                out.append(("t", (parts, "".join(buf)), start_line))
            else:
                out.append(("s", "".join(buf), start_line))
            continue
        adv(1)
    return out

UI_HINT = re.compile(r"[A-Za-z]")
SKIP = re.compile(r"^(mods/|icons/|frame/|https?://|#|[0-9]+$)")
def candidates(path):
    src = open(path, encoding="utf-8").read()
    res = []
    for kind, val, line in extract(src):
        texts = []
        if kind == "s": texts = [val]
        else:
            parts, tail = val
            for p in parts:
                if isinstance(p, str) and p.strip(): texts.append(p)
            if tail.strip(): texts.append(tail)
        for t in texts:
            t2 = t.strip()
            if not t2 or not UI_HINT.search(t2): continue
            if SKIP.match(t2): continue
            if t2 in ("use strict",): continue
            res.append({"file": path.split("mods/")[-1], "line": line, "text": t2})
    return res

if __name__ == "__main__":
    all_res = []
    for p in sys.argv[1:]:
        all_res += candidates(p)
    for r in all_res:
        print(json.dumps(r, ensure_ascii=False))
