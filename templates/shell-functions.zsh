# >>> cmux-persistent-ssh >>>
# persistent terminal sessions — github.com/yigitkonur/cmux-persistent-ssh
# .  = remote ET + zellij  |  , = local zellij  |  .. = plain ET
__cmux_session_name() {
  local ws_name tab_pos
  ws_name=$(cmux tree --workspace "$CMUX_WORKSPACE_ID" 2>/dev/null \
    | grep 'workspace ' | head -1 | sed 's/.*"\(.*\)".*/\1/' \
    | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -d '/')
  tab_pos=$(cmux list-pane-surfaces 2>/dev/null | awk '/^\*/{print NR}')
  echo "${ws_name:-unnamed}-t${tab_pos:-1}"
}

.() {
  local session=$(__cmux_session_name)
  # cleanup: purge EXITED zellij sessions older than {{CLEANUP_DAYS}} days (background)
  ssh {{REMOTE_HOST}} 'zellij list-sessions 2>/dev/null | sed "s/\x1b\[[0-9;]*m//g" \
    | awk "/EXITED/ && /[0-9]+days/ {
        for(i=1;i<=NF;i++) if(\$i ~ /[0-9]+days/) {
          d=\$i; gsub(/days/,\"\",d);
          if(d+0 >= {{CLEANUP_DAYS}}) print \$1
        }
      }" \
    | xargs -I{} zellij delete-session {} 2>/dev/null' &>/dev/null &
  # forward cmux env vars for sidebar integration (cmux-claude-pro)
  printf 'export CMUX_WORKSPACE_ID=%s\nexport CMUX_SURFACE_ID=%s\n' \
    "$CMUX_WORKSPACE_ID" "$CMUX_SURFACE_ID" | ssh {{REMOTE_HOST}} 'cat > /tmp/cmux-fwd.env' 2>/dev/null
  # forward cmux socket for sidebar integration (if symlink exists)
  if [ -S /tmp/cmux-local.sock ]; then
    ssh -N -f -R /tmp/cmux-fwd.sock:/tmp/cmux-local.sock {{REMOTE_HOST}} 2>/dev/null
  fi
  et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}} -c "zellij attach -c $session"
}

,() {
  local session=$(__cmux_session_name)
  zellij attach -c "$session"
}

..() { et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}}; }
# <<< cmux-persistent-ssh <<<
