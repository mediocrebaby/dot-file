#!/usr/bin/env bash
# 输出内存已用百分比(= 100 - 系统空闲百分比)。
free=$(memory_pressure 2>/dev/null | awk '/free percentage/{gsub(/%/,"",$NF); print $NF}')
[ -z "$free" ] && free=0
echo $((100 - free))
