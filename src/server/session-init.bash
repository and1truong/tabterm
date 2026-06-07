# Sourced via `bash --rcfile` for each console session shell.
# Pull in the user's normal interactive config first, then our prompt.
[ -f ~/.bashrc ] && source ~/.bashrc

# ---------------------
# Bash prompt
# ---------------------
function parse_git_branch {
  git branch --no-color 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/(\1)/'
}

function proml {
  local        BLUE="\[\033[0;34m\]"
  local         RED="\[\033[0;31m\]"
  local   LIGHT_RED="\[\033[1;31m\]"
  local       GREEN="\[\033[0;32m\]"
  local LIGHT_GREEN="\[\033[1;32m\]"
  local       WHITE="\[\033[1;37m\]"
  local  LIGHT_GRAY="\[\033[0;37m\]"
  case $TERM in
    xterm*)
    TITLEBAR='\[\033]0;\u@\h:\w\007\]'
    ;;
    *)
    TITLEBAR=""
    ;;
  esac

PS1="${TITLEBAR}\
$BLUE[$RED\$(date +%H:%M)$BLUE]\
$BLUE[$RED\u@\h:\w$GREEN\$(parse_git_branch)$BLUE]\
$GREEN\$ "
PS2='> '
PS4='+ '
}
proml

# ---------------------
# Optional startup command (set by tabterm for "claude" sessions). The marker
# file lets us run the command plain on first launch and with --continue on
# subsequent ones, so closing/reopening the browser tab resumes the conversation.
# When the command exits the user falls back to interactive bash.
# ---------------------
if [ -n "$STARTUP_COMMAND" ]; then
  if [ -n "$STARTUP_MARKER" ] && [ -f "$STARTUP_MARKER" ]; then
    eval "$STARTUP_COMMAND --continue"
  else
    [ -n "$STARTUP_MARKER" ] && { mkdir -p "$(dirname "$STARTUP_MARKER")"; touch "$STARTUP_MARKER"; }
    eval "$STARTUP_COMMAND"
  fi
fi
