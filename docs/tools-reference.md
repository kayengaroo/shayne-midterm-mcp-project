# Tools reference

All inputs are zod `strictObject`s (unknown keys rejected). Successful calls return one text block containing JSON. Failures return `isError: true` and `Error: <message>`. Paths are always **relative to the workspace root**. Every call is logged.

| Tool | Changes data? | Purpose |
|---|---|---|
| `list_files` | no | List a directory |
| `read_file` | no | Read a text file / line range |
| `write_file` | yes | Create or replace a file |
| `str_replace` | yes | Exact-text edit |
| `delete_file` | yes | Soft-delete a file |
| `search_files` | no | grep-like search |
| `git_status` | no | Uncommitted changes |
| `git_diff` | no | Unified diff |
| `git_log` | no | Recent commits |
| `git_commit` | yes | Stage + commit (checkpoint) |
| `handoff_read` | no | Read handoff files |
| `handoff_update` | yes | Update handoff files |

## list_files
`path` (default `.`), `recursive` (false), `max_entries` (1-1000, default 200) -> `{entries:[{path,type,size?}], truncated}`. Hides `.git`/`.env*`; never follows symlinks.

## read_file
`path`, `start_line` (>=1, default 1), `max_lines` (1-5000, default 500) -> `{path, version, total_lines, start_line, end_line, truncated, content}`. Errors: not found, directory, binary file, file larger than `MAX_FILE_BYTES`.

## write_file
`path`, `content` (<= `MAX_FILE_BYTES`), `overwrite` (false), `if_version` (16 hex chars, optional) -> `{path, bytes, version, created}`. Fails if the file exists without `overwrite`/`if_version`; fails with "Version conflict" if `if_version` is stale. Creates parent folders. Cannot write handoff files or `.trash/`.

## str_replace
`path`, `old_str` (1-100000 chars), `new_str`, `replace_all` (false), `if_version` -> `{path, replacements, version}`. `old_str` must match exactly once (unless `replace_all`); "not found" and "appears N times" errors tell the agent how to fix the call. `$` sequences in `new_str` are literal.

## delete_file
`path`, `confirm` (must be `true`) -> `{deleted, moved_to}`. Moves the file to `.trash/<timestamp>-<id>-<name>`. Only regular files; not handoff files or `.trash` entries.

## search_files
`query` (1-200), `path` (default `.`), `regex` (false), `case_sensitive` (false), `max_results` (1-200, default 50) -> `{matches:[{path,line,text}], files_scanned, truncated}`. Skips binary/oversized files, hidden names, `.trash`, symlinks; scans at most 5000 files; lines are cut to 500 chars before matching.

## git_status / git_diff / git_log
- `git_status {}` -> `{branch, clean, entries:[{status,path}]}`
- `git_diff {path?, staged=false, max_bytes=20000}` -> `{diff, truncated}`
- `git_log {max_count=10 (1-50), path?}` -> `{commits:[{hash,author,date,subject}]}`

Operate on the workspace's own repo (auto-created on first start).

## git_commit
`message` (1-200), `paths` (optional list, <= 50; default all changes) -> `{commit, message}`. "Nothing to commit." if clean. No push, no other git commands, hooks disabled, `.env*` excluded.

## handoff_read
`file` (`PROJECT_STATE|PLAN_LOG|CHECKPOINTS|DECISIONS|all`, default all), `tail_lines` (1-2000, default 200) -> `{files:[{file, version, total_lines, truncated, content}]}`. Missing files are re-created from templates.

## handoff_update
`file`, `mode` (`replace`|`append`), `agent` (`[A-Za-z0-9._ -]`, 1-40), `content` (1-20000), `if_version`. `PROJECT_STATE` = replace with `if_version` required; the other three = append-only (entry stamped `### <ISO time> | <agent>`). -> `{file, version, bytes}`. Details: [handoff-protocol.md](handoff-protocol.md).

## Limitations
Text files only (UTF-8); no directory create/delete/rename or move tool; versions are content hashes (not a lock, only a check at write time); search is not indexed.
