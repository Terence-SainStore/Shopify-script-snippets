# Shopify Script Snippets（内部）

团队内部共享的页面脚本包，配合开源工具 [SnippetBox](https://github.com/terenzzzz/SnippetBox) 使用。

> 本仓库建议设为 **私有**；开源的是 SnippetBox 扩展，不是这些业务脚本。

## 使用方法

1. 克隆并安装 [SnippetBox](https://github.com/terenzzzz/SnippetBox)：

```bash
git clone https://github.com/terenzzzz/SnippetBox.git
# Chrome → chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选 SnippetBox/extension/
```

2. 克隆本脚本仓库（任意位置即可）：

```bash
git clone <本仓库地址> Shopify-script-snippets
```

3. 在 SnippetBox 里绑定脚本目录：

- 打开扩展弹窗 → **目录**（或扩展详情里的「扩展程序选项」）
- 点 **选择文件夹…**，选中本仓库根目录（`Shopify-script-snippets`）

4. 打开目标网页 → 点扩展图标 → 运行脚本

浏览器会记住目录授权；若提示重新授权，再到设置页点一次即可。同事更新脚本后 `git pull`，再打开弹窗即可看到最新文件。

## 添加脚本

1. 复制 `_template.js` 到任意分类目录并改名
2. 填写「脚本名称」「用途」注释
3. 用 IIFE 编写逻辑；可选挂载 `window.__toolbox`
4. 提交到本仓库； `git pull` 后刷新扩展弹窗即可

## 目录约定

```text
Shopify-script-snippets/
├── _template.js          # 以下划线开头 → SnippetBox 忽略
└── shopify/              # 业务相关（可继续加 work/、ops/ 等任意分类）
    └── site-info.js
```

- 递归扫描全部 `.js`
- 子目录路径作为分类
