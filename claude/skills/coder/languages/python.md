# Python 规则

## 权威风格指南

- [PEP 8 – Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [PEP 257 – Docstring Conventions](https://peps.python.org/pep-0257/)
- 格式化 / Lint 工具：`black`（或 `ruff format`）、`ruff` / `flake8`、`mypy`（类型检查）

## 提炼的核心规则

1. **命名约定**：函数 / 变量 / 模块用 `snake_case`，类用 `PascalCase`，
   常量用 `UPPER_SNAKE_CASE`，受保护成员前缀 `_`。
2. **缩进与行宽**：4 空格缩进，行宽遵循工具配置（PEP 8 为 79，多数项目用 88/100）。
3. **类型注解**：公共函数的参数与返回值加类型注解，提升可读性与可检查性。
4. **EAFP 风格**：优先 `try/except` 而非层层 `if` 预检查，符合 Python 习惯。
5. **善用语言特性**：用列表 / 字典推导式、上下文管理器（`with`）、`enumerate`、
   `zip`、f-string，避免手写索引循环与字符串拼接。
6. **docstring**：模块 / 类 / 公共函数写 docstring，说明用途、参数与返回值。
7. **避免可变默认参数**：不要用 `def f(x=[])`，用 `None` 加内部初始化。
8. **导入规范**：导入分组（标准库 / 第三方 / 本地）并排序，避免 `from x import *`。
