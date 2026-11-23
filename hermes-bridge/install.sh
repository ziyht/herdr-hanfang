#!/bin/bash
# Hermes ↔ Herdr 状态桥安装(详见 README.md)
set -e
H="$HOME/.hermes/agent-hooks/herdr-status.py"
mkdir -p "$HOME/.hermes/agent-hooks"
cp "$(dirname "$0")/herdr-status.py" "$H"
chmod +x "$H"
for ev in pre_llm_call on_session_end pre_api_request post_api_request pre_tool_call post_tool_call; do
  hermes config set "hooks.$ev" "[{\"command\": \"$H\", \"timeout\": 20}]" >/dev/null
done
hermes hooks revoke "$H" >/dev/null 2>&1 || true
hermes --accept-hooks -z "回复:ok" >/dev/null
echo "安装完成,doctor 检查:"
hermes hooks doctor | tail -8
