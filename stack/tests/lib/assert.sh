# Tiny test assertions (stack/tests/README.md). Source it; it sets no shell options.
#
#   t_init <title>              start a run
#   t_ok <name> <command...>    passes when the command exits 0; on failure the last 20 lines of
#                               its output are printed under the check
#   t_eq <name> <expected> <actual>
#   t_done                      prints "<title>: <n> passed, <m> failed" as the last line;
#                               returns 1 when m > 0 or n = 0

T_TITLE="" T_PASSED=0 T_FAILED=0

t_init() { T_TITLE="${1:?t_init needs a title}"; T_PASSED=0; T_FAILED=0; }

t_ok() {
  local _t_name="$1" _t_out _t_rc
  shift
  _t_out="$(mktemp)"
  "$@" >"$_t_out" 2>&1
  _t_rc=$?
  if [ "$_t_rc" -eq 0 ]; then
    echo "ok - $_t_name"; T_PASSED=$((T_PASSED + 1))
  else
    echo "not ok - $_t_name"; T_FAILED=$((T_FAILED + 1))
    tail -n 20 "$_t_out" | sed 's/^/    /'
  fi
  rm -f "$_t_out"
  return 0
}

t_eq() {
  if [ "$2" = "$3" ]; then
    echo "ok - $1"; T_PASSED=$((T_PASSED + 1))
  else
    echo "not ok - $1"; T_FAILED=$((T_FAILED + 1))
    printf '    expected: %s\n    actual:   %s\n' "$2" "$3"
  fi
  return 0
}

t_done() {
  echo "$T_TITLE: $T_PASSED passed, $T_FAILED failed"
  [ "$T_FAILED" -eq 0 ] && [ "$T_PASSED" -gt 0 ]
}
