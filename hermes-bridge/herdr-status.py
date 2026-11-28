#!/usr/bin/python3
"""Herdr 集成桥:hermes hook 事件 → 终端 OSC 7501 状态上报 + 按终端键落盘。

- stdin 收 hermes 的 hook JSON(观察型 hook,无输出、不阻塞、不改内容)
- 往 /dev/tty 写 OSC 7501,让 Herdr 把本会话识别为 agent(图标/状态/Agents 统计);
  非终端环境(gateway 等)写失败则静默跳过
- 有 HC_TERMINAL_ID 时写 ~/.hermes/herdr-status/term/<终端 id>.json:
  {state, session_id, ts, context_tokens?, model?}——UI 按窗格终端 id 直查,
  不用 cwd 猜窗格
- 无 HC_TERMINAL_ID(gateway / cron / desktop / 子 agent)不落盘,物理隔离
"""
import json
import os
import sys
import time

STATUS_DIR = os.path.expanduser("~/.hermes/herdr-status")
TERM_DIR = os.path.join(STATUS_DIR, "term")
GC_MARKER = os.path.join(TERM_DIR, ".gc")            # 清扫节流 marker(mtime 计时)
LEGACY_MARKER = os.path.join(STATUS_DIR, ".legacy-cleaned")  # 旧格式清理节流 marker
GC_INTERVAL_SEC = 3600        # 清扫最多一小时一次,避免每个事件都扫目录
TERM_TTL_SEC = 7 * 86400      # 终端记录 7 天没更新即视为死窗格

EVENTS = (
    "pre_llm_call",
    "on_session_end",
    "pre_api_request",
    "post_api_request",
    "on_human_input_request",
    "on_human_input_resolved",
)

# Hermes 回合结束后会在同一会话里跑"后台回顾"回合(记忆/技能整理),它会触发
# pre_llm_call 并把状态改成 working —— 用户眼里就是"活干完了图标又开始闪"。
# 这些内部提示词以固定文字开头,直接忽略,不让它们影响状态。
INTERNAL_PROMPTS = (
    "review the conversation above",
    "update the skill library",
    "summarize the conversation",
)


def is_internal_turn(payload) -> bool:
    msg = payload.get("user_message")
    if isinstance(msg, dict):
        msg = msg.get("content")
    elif isinstance(msg, (list, tuple)):
        msg = " ".join(str(m.get("content") if isinstance(m, dict) else m) for m in msg)
    text = str(msg or "").strip().lower()
    return any(text.startswith(p) for p in INTERNAL_PROMPTS)

# on_human_input_request 的 kind → OSC 7501 的 blocked kind
HUMAN_KINDS = {"clarify": "question", "approval": "permission", "sudo": "auth"}


def state_of(event, payload):
    # 顶层字段 + extra 包一层都认(真实 wire 是顶层)
    extra = {**payload, **(payload.get("extra") or {})}
    if event == "pre_llm_call":
        if is_internal_turn(payload):
            return None  # 后台回顾回合:不算"在干活"
        return "working"
    if event == "on_human_input_request":
        # 即将阻塞等人:clarify 提问 / 危险命令审批 / sudo 密码
        return "blocked"
    if event == "on_human_input_resolved":
        # 人已响应,回合继续
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


def term_key():
    """HC_TERMINAL_ID → 记录文件名;无终端环境返回 None(不落盘)。

    `/` 换成 `_`:id 要直接当文件名用。
    """
    tid = (os.environ.get("HC_TERMINAL_ID") or "").strip()
    if not tid:
        return None
    return tid.replace("/", "_")


def as_int(v):
    """context_tokens 只要整数;非法值当缺省。"""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def write_term(key, rec):
    """增量合并 + tmp/os.replace 原子写:保留其它事件写入的字段。"""
    os.makedirs(TERM_DIR, exist_ok=True)
    out = os.path.join(TERM_DIR, key + ".json")
    merged = {}
    try:
        with open(out, encoding="utf-8") as f:
            loaded = json.load(f)
        if isinstance(loaded, dict):
            merged = loaded
    except (OSError, ValueError):
        pass
    # 同一窗格换了会话(上个会话没走 on_session_end):旧会话的用量字段作废
    if merged.get("session_id") not in (None, rec.get("session_id")):
        merged = {}
    merged.update(rec)
    tmp = os.path.join(TERM_DIR, "." + key + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False)
    os.replace(tmp, out)


def remove_term(key):
    """on_session_end:窗格记录随会话消失。"""
    try:
        os.unlink(os.path.join(TERM_DIR, key + ".json"))
    except OSError:
        pass


def maybe_gc(now):
    """稀疏清扫:删 term/ 下 mtime 超 7 天的记录。

    用 .gc marker 的 mtime 节流到 ≥1 小时一次,不给每个事件加目录扫描开销。
    """
    try:
        if now - os.path.getmtime(GC_MARKER) < GC_INTERVAL_SEC:
            return
    except OSError:
        pass
    cutoff = now - TERM_TTL_SEC
    try:
        with os.scandir(TERM_DIR) as entries:
            for ent in entries:
                if not ent.name.endswith(".json"):
                    continue
                try:
                    if ent.stat().st_mtime < cutoff:
                        os.unlink(ent.path)
                except OSError:
                    continue
    except OSError:
        return
    try:
        with open(GC_MARKER, "w", encoding="utf-8") as f:
            f.write(str(int(now)))
    except OSError:
        pass


def sweep_legacy(now):
    """清掉根下旧格式(会话 json 与 _latest.json)。

    v2 起根下不再放记录;旧文件会让老 mod 读到过期状态。
    用 marker 的 mtime 节流到 ≥1 小时一次:旧版 hook 若还在跑(装机前并存),
    它每回合都会重新写根下文件,单次清理会漏;节流保证既扫得到又不每事件扫目录。
    """
    try:
        if now - os.path.getmtime(LEGACY_MARKER) < GC_INTERVAL_SEC:
            return
    except OSError:
        pass
    try:
        with os.scandir(STATUS_DIR) as entries:
            for ent in entries:
                if not (ent.is_file() and ent.name.endswith(".json")):
                    continue
                try:
                    os.unlink(ent.path)
                except OSError:
                    continue
    except OSError:
        return
    try:
        with open(LEGACY_MARKER, "w", encoding="utf-8") as f:
            f.write(str(int(now)))
    except OSError:
        pass


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return
    if not isinstance(payload, dict):
        return
    event = payload.get("hook_event_name") or payload.get("event") or ""
    if event not in EVENTS:
        return
    # 真实 wire 格式:字段在顶层(旧版/合成样例会包一层 extra)——两层合并后再判,
    # 否则 post_api_request 的 finish_reason / assistant_tool_call_count 读不到,
    # 每个事件都落回默认值 working,回合结束后图标一直闪。
    extra = payload.get("extra") or {}
    fields = {**payload, **extra}
    session = str(payload.get("session_id") or "unknown")
    state = state_of(event, fields)

    now = int(time.time())
    sweep_legacy(now)

    key = term_key()
    if key:
        if event == "on_session_end":
            remove_term(key)
        else:
            # 只有真的判定出状态才覆盖,否则保留上一次(增量合并)
            rec = {"session_id": session, "ts": now}
            if state:
                rec["state"] = state
            if event == "pre_api_request":
                tokens = as_int(
                    extra.get("approx_input_tokens", payload.get("approx_input_tokens"))
                )
                if tokens is not None:
                    rec["context_tokens"] = tokens
                model = extra.get("model") or payload.get("model")
                if model:
                    rec["model"] = str(model)
            try:
                write_term(key, rec)
                maybe_gc(now)
            except OSError:
                pass

    if state:
        seq = "\x1b]7501;state=" + state
        if state == "blocked":
            k = str(payload.get("kind") or (payload.get("extra") or {}).get("kind") or "")
            seq += ":kind=" + HUMAN_KINDS.get(k, "question")
        seq += ":app=hermes\x1b\\"

        try:
            with open("/dev/tty", "w") as tty:
                tty.write(seq)
        except OSError:
            pass


if __name__ == "__main__":
    main()
