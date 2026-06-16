# C / C++ 规则

## 权威风格指南

- [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)（Stroustrup & Sutter）
- 格式化 / 静态检查工具：`clang-format`、`clang-tidy`、`cppcheck`

## 提炼的核心规则

1. **资源用 RAII 管理**：用栈对象 / 智能指针（`std::unique_ptr`、`std::shared_ptr`）
   管理资源，避免裸 `new`/`delete` 与手动释放。
2. **优先现代 C++**：用 `auto`、范围 for、`nullptr`、`constexpr`、`std::optional`、
   `std::string_view`，避免 C 风格的裸指针与宏。
3. **const 正确性**：能 `const` 的就 `const`，参数传引用时优先 `const&` 避免拷贝。
4. **头文件自包含**：每个头文件可独立编译，使用 `#pragma once` 或 include guard，
   只 include 真正用到的内容。
5. **命名约定**：类型用 `PascalCase`，函数 / 变量用 `snake_case`（或随项目既有约定），
   常量用 `kCamelCase`，宏全大写且尽量少用。
6. **遵循 Rule of 0/3/5**：要么不写特殊成员函数（Rule of 0），要么完整成员都写。
7. **C 专属**：检查所有返回值与 `errno`，初始化所有变量，`malloc`/`free` 成对，
   头文件用 include guard。
