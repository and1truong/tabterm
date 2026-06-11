# Loaded as $ZDOTDIR/.zshrc for each tabterm console session. tabterm points
# ZDOTDIR here so it can layer status markers + an optional startup command on
# top of the user's own zsh config WITHOUT editing their dotfiles. The bash
# equivalent is session-init.bash (sourced via `bash --rcfile`).

# Restore the user's real config dir, then load their interactive config exactly
# as a plain `zsh -i` would. _TABTERM_HOME_ZDOTDIR carries whatever ZDOTDIR the
# user had before we overrode it (empty = they used the default, $HOME).
if [[ -n "$_TABTERM_HOME_ZDOTDIR" ]]; then
  export ZDOTDIR="$_TABTERM_HOME_ZDOTDIR"
else
  unset ZDOTDIR
fi
_tabterm_cfg="${ZDOTDIR:-$HOME}"
# The user's ~/.zshenv was already sourced at the normal startup phase by the
# zdotdir's .zshenv shim; here we just load their interactive ~/.zshrc.
[[ -f "$_tabterm_cfg/.zshrc" ]] && source "$_tabterm_cfg/.zshrc"
unset _tabterm_cfg _TABTERM_HOME_ZDOTDIR

# ---------------------
# Shell running/idle indicator via OSC-133 shell-integration markers (same as
# the bash init). The tabterm proxy watches the PTY stream for these and toggles
# the session's sidebar status. add-zsh-hook composes with the user's own
# precmd/preexec hooks, so their prompt theme keeps working.
#   ESC ]133;C ST  command start → running
#   ESC ]133;D ST + ESC ]133;A ST  command done + prompt start → idle
# Skipped for AI sessions (STARTUP_COMMAND set): the AI binary is the foreground
# command and reports its own turn boundaries via hooks.
# ---------------------
if [[ -z "$STARTUP_COMMAND" ]]; then
  autoload -Uz add-zsh-hook
  _tabterm_preexec() { printf '\e]133;C\e\\'; }
  _tabterm_precmd()  { printf '\e]133;D\e\\\e]133;A\e\\'; }
  add-zsh-hook preexec _tabterm_preexec
  add-zsh-hook precmd _tabterm_precmd
fi

# ---------------------
# Optional startup command (AI sessions). Mirrors session-init.bash: pin the
# conversation UUID, choosing --resume when a transcript already exists and
# --session-id otherwise. On exit the user drops back to interactive zsh.
# ---------------------
if [[ -n "$STARTUP_COMMAND" ]]; then
  if [[ -n "$STARTUP_SESSION_ID" ]]; then
    PROJECT_KEY="${PWD//[\/.]/-}"
    if [[ -f "$HOME/.claude/projects/$PROJECT_KEY/$STARTUP_SESSION_ID.jsonl" ]]; then
      eval "$STARTUP_COMMAND --resume $STARTUP_SESSION_ID"
    else
      eval "$STARTUP_COMMAND --session-id $STARTUP_SESSION_ID"
    fi
  else
    eval "$STARTUP_COMMAND"
  fi
fi
