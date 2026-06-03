#!/usr/bin/env bash
# 输出 CPU 使用率整数百分比(user + sys)。
# top -l 2 取第二次采样更准(首次采样基于开机至今的累计)。
top -l 2 -n 0 2>/dev/null \
  | grep '^CPU usage' | tail -1 \
  | sed 's/.*: \([0-9.]*\)% user, \([0-9.]*\)% sys.*/\1 \2/' \
  | awk '{printf "%.0f", $1 + $2}'
