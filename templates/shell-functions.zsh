# >>> cmux-persistent-ssh >>>
# persistent terminal sessions — github.com/yigitkonur/cmux-persistent-ssh
# .  = remote ET + zellij  |  , = local zellij  |  .. = plain ET
__cmux_session_name() {
  local ws_name tab_pos
  ws_name=$(cmux tree --workspace "$CMUX_WORKSPACE_ID" 2>/dev/null \
    | grep 'workspace ' | head -1 | sed 's/.*"\(.*\)".*/\1/' \
    | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
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
  et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}} -c "zellij attach -c $session"
}

,() {
  local session=$(__cmux_session_name)
  zellij attach -c "$session"
}

..() { et -k {{ET_KEEPALIVE}} {{REMOTE_HOST}}; }
# <<< cmux-persistent-ssh <<<