#!/usr/bin/python3
"""Herdr 集成桥:hermes hook 事件 → 终端 OSC 7501 状态上报 + 用量落盘。

- stdin 收 hermes 的 hook JSON(观察型 hook,无输出、不阻塞、不改内容)
- 往 /dev/tty 写 OSC 7501,让 Herdr 把本会话识别为 agent(图标/状态/Agents 统计);
  非终端环境(gateway 等)写失败则静默跳过
- ~/.hermes/herdr-status/<session>.json 供 spaces-rail-zh 读取:
  {state, cwd, session_id, ts, context_tokens?, model?}
- 同目录 _latest.json 汇总全部活跃记录(按时间倒序,供 mod 一次读取)
"""
import json
import os
import sys
import time

STATUS_DIR = os.path.expanduser("~/.hermes/herdr-status")
MAX_FILES = 60      # 汇总上限,超出只保留最新
STALE_SEC = 86400   # 单条记录超过一天未更新即从汇总剔除

EVENTS = ("pre_llm_call", "on_session_end", "pre_api_request", "post_api_request", "pre_tool_call", "post_tool_call")

# 只有 clarify(等用户输入)关心 pre/post_tool_call;其它工具不表态,避免状态抖动
INPUT_TOOLS = {"clarify"}


def session_cwd(session_id):
    """会话的真实工作目录(state.db 的 sessions.cwd);查不到返回 None。"""
    try:
        import sqlite3

        db = os.path.expanduser("~/.hermes/state.db")
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
        try:
            row = con.execute("SELECT cwd FROM sessions WHERE id = ?", (session_id,)).fetchone()
        finally:
            con.close()
        return row[0] if row and row[0] else None
    except Exception:
        return None


def state_of(event, payload):
    extra = payload.get("extra") or {}
    if event == "pre_llm_call":
        return "working"
    if event == "pre_tool_call":
        # clarify 等用户输入:blocked(Herdr 的「需要你」)
        return "blocked"
    if event == "post_tool_call":
        # 用户已作答,回合继续
        return "working"
    if event == "post_api_request":
        # 回合级判定:这次响应还要调工具(working),没有工具调用即最终回复(done)。
        # 字段缺失时不表态(返回 None,不覆盖既有状态)。
        tools = extra.get("assistant_tool_call_count")
        if isinstance(tools, int):
            return "working" if tools > 0 else "done"
        finish = str(extra.get("finish_reason") or "").lower()
        if not finish:
            return None
        return "working" if "tool" in finish else "done"
    if event == "on_session_end":
        done = payload.get("completed", extra.get("completed"))
        failed = payload.get("failed", extra.get("failed"))
        interrupted = payload.get("interrupted", extra.get("interrupted"))
        if failed:
            return "error"
        if interrupted or not done:
            return "idle"
        return "done"
    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    event = payload.get("hook_event_name") or payload.get("event") or ""
    if event not in EVENTS:
        return
    # pre/post_tool_call 只关心等用户输入的工具(clarify),其余不表态
    if event in ("pre_tool_call", "post_tool_call"):
        if (payload.get("tool_name") or (payload.get("extra") or {}).get("tool_name")) not in INPUT_TOOLS:
            return
    session = str(payload.get("session_id") or "unknown")
    cwd = payload.get("cwd") or os.getcwd()
    state = state_of(event, payload)
    # 真实 wire 格式:事件字段包在 extra 里(合成样例是平铺的,两层都兼容)
    extra = payload.get("extra") or {}

    rec = {"state": state or "working", "cwd": cwd, "session_id": session, "ts": int(time.time())}
    # Herdr 终端环境自带 HC_TERMINAL_ID,记录之供 mod 精确匹配(非 Herdr 环境无此项)
    if os.environ.get("HC_TERMINAL_ID"):
        rec["terminal"] = os.environ["HC_TERMINAL_ID"]
    # 会话真实 cwd:mod 按 pane.cwd 与它对应(gateway 会话的 payload cwd 不可用)
    scwd = session_cwd(session)
    if scwd:
        rec["session_cwd"] = scwd
    if event == "pre_api_request":
        rec["context_tokens"] = extra.get("approx_input_tokens", payload.get("approx_input_tokens"))
        rec["model"] = extra.get("model") or payload.get("model")

    try:
        os.makedirs(STATUS_DIR, exist_ok=True)
        out = os.path.join(STATUS_DIR, session + ".json")
        # 增量合并:保留其它事件写入的字段(如 context_tokens),只更新本事件带来的
        merged = {}
        try:
            with open(out, encoding="utf-8") as f:
                merged = json.load(f)
        except (OSError, ValueError):
            pass
        merged.update(rec)
        tmp = os.path.join(STATUS_DIR, "." + session + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False)
        os.replace(tmp, out)
        rebuild_latest()
    except OSError:
        pass

    if state:
        seq = f"\x1b]7501;state={state}"
        if state == "blocked":
            seq += ":kind=question"
        seq += ":app=hermes\x1b\\"
        try:
            with open("/dev/tty", "w") as tty:
                tty.write(seq)
        except OSError:
            pass


def rebuild_latest():
    """汇总所有未过期记录到 _latest.json(时间倒序)。"""
    now = time.time()
    recs = []
    for name in os.listdir(STATUS_DIR):
        if not name.endswith(".json") or name.startswith(".") or name == "_latest.json":
            continue
        path = os.path.join(STATUS_DIR, name)
        try:
            if now - os.path.getmtime(path) > STALE_SEC:
                continue
            with open(path, encoding="utf-8") as f:
                recs.append(json.load(f))
        except (OSError, ValueError):
            continue
    recs.sort(key=lambda r: r.get("ts", 0), reverse=True)
    tmp = os.path.join(STATUS_DIR, "._latest.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(recs[:MAX_FILES], f, ensure_ascii=False)
    os.replace(tmp, os.path.join(STATUS_DIR, "_latest.json"))


if __name__ == "__main__":
    main()
