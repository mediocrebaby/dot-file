# komorebi_provider —— sketchybar 的 komorebi 事件提供器(C++ helper)
#
# 用法:
#   make          编译出 ./komorebi_provider
#   make clean     删除产物
#
# 依赖(均为 macOS 自带,无需额外安装):
#   · clang++ (Xcode Command Line Tools),C++17
#   · 框架 CoreFoundation / CoreGraphics / ImageIO
#   · CommonCrypto(md5,随 libSystem 自动链接)
# 第三方头文件已 vendored 于 vendor/(sketchybar.h、mach.h、json.hpp),无需联网。

BIN        := komorebi_provider
SRC        := main.cpp
DEPS       := vendor/mach.h vendor/sketchybar.h vendor/json.hpp

BIN2       := rime_provider
SRC2       := rime_provider.cpp
DEPS2      := vendor/mach.h vendor/sketchybar.h

CXX        ?= clang++
# -Wno-deprecated-declarations:抑制 task_get_special_port / CC_MD5 的弃用告警。
CXXFLAGS   := -std=c++17 -O2 -Wall -Wno-deprecated-declarations
FRAMEWORKS := -framework CoreFoundation -framework CoreGraphics -framework ImageIO

all: $(BIN) $(BIN2)

$(BIN): $(SRC) $(DEPS)
	$(CXX) $(CXXFLAGS) $(SRC) $(FRAMEWORKS) -o $(BIN)

$(BIN2): $(SRC2) $(DEPS2)
	$(CXX) $(CXXFLAGS) $(SRC2) -o $(BIN2)

clean:
	rm -f $(BIN) $(BIN2)

.PHONY: all clean
