# >>> cmux-persistent-ssh >>>
# persistent terminal sessions — github.com/yigitkonur/cmux-persistent-ssh
# .  = remote ET + zellij  |  , = local zellij  |  .. = plain ET
__cmux_session_name() {
  local ws_name ws_ref tab_pos
  local tree_out=$(cmux tree --workspace "$CMUX_WORKSPACE_ID" 2>/dev/null)
  ws_name=$(echo "$tree_out" | grep 'workspace ' | head -1 | sed 's/.*"\(.*\)".*/\1/' \
    | tr ' ' '-' | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9_-]//g; s/^-*//; s/-*$//')
  tab_pos=$(cmux list-pane-surfaces 2>/dev/null | awk '/^\*/{print NR}')
  # fallback: unnamed workspaces get "ssh-{ref_number}" to avoid collisions
  if [[ -z "$ws_name" ]]; then
    ws_ref=$(echo "$tree_out" | grep 'workspace ' | head -1 | sed 's/.*workspace:\([0-9]*\).*/\1/')
    ws_name="ssh-${ws_ref:-0}"
  fi
  echo "${ws_name}-t${tab_pos:-1}"
}

.() {
  local session=$(__cmux_session_name)
  # cleanup: purge EXITED zellij sessions older than {{CLEANUP_DAYS}} days (background)
  ssh {{REMOTE_HOST}} 'zellij list-sessions 2>/dev/null | sed "s/\x1b\[[0-9;]*m//g" \
    | awk "/EXITED/ { for(i=1;i<=NF;i++) if(\$i ~ /^[0-9]+days$/) { d=\$i; sub(/days$/,\"\",d); if(d+0>={{CLEANUP_DAYS}}) { print \$1; break } } }" \
    | xargs -I{} zellij delete-session {} 2>/dev/null' &>/dev/null &
  # cmux-claude-pro: forward env + socket (all background, non-blocking)
  {
    printf 'export CMUX_WORKSPACE_ID=%s\nexport CMUX_SURFACE_ID=%s\n' \
      "$CMUX_WORKSPACE_ID" "$CMUX_SURFACE_ID" | ssh {{REMOTE_HOST}} 'umask 077 && cat > ~/.cmux-fwd.env' 2>/dev/null
    if [ -S /tmp/cmux-local.sock ]; then
      ssh -N -f -R /tmp/cmux-fwd.sock:/tmp/cmux-local.sock {{REMOTE_HOST}} 2>/dev/null
    fi
  } &>/dev/null &
  # connect (session name is safe — only [a-z0-9_-])
  et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}} -c "zellij attach -c $session"
}

,() {
  local session=$(__cmux_session_name)
  zellij attach -c "$session"
}

..() { et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}}; }
# <<< cmux-persistent-ssh <<<
