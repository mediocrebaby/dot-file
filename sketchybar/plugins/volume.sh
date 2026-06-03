#!/usr/bin/env bash
# 输出 "音量|是否静音",例如 "44|false" 或 "0|true"。
osascript \
  -e 'set v to get volume settings' \
  -e 'return ((output volume of v) as string) & "|" & ((output muted of v) as string)' \
  2>/dev/null
