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

- 打开扩展侧边栏 → **目录**（或扩展详情里的「扩展程序选项」）
- 点 **选择文件夹…**，选中本仓库根目录（`Shopify-script-snippets`）

4. 打开目标网页 → 点扩展图标打开侧边栏 → 运行脚本

浏览器会记住目录授权；若提示重新授权，再到设置页点一次即可。同事更新脚本后 `git pull`，再打开侧边栏即可看到最新文件。

> SnippetBox 使用 Chrome Side Panel，点页面不会自动关闭（原生 popup 失焦必关）。

## 添加脚本

1. 复制 `_template.js` 到任意分类目录并改名
2. 填写「脚本名称」「用途」注释
3. 用 IIFE 编写逻辑；可选挂载 `window.__toolbox`
4. 提交到本仓库； `git pull` 后在侧边栏点「刷新」即可

## 目录约定

```text
Shopify-script-snippets/
├── _template.js                 # 以下划线开头 → SnippetBox 忽略
├── shopify/                     # 通用 Shopify 调试
│   ├── info/
│   ├── cart/
│   ├── product/
│   ├── theme/
│   ├── analytics/               # meta-pixels / datalayer-peek
│   └── utils/
└── shokz/                       # Shokz 业务专用
    └── free-gift-rules.js
```

- 递归扫描全部 `.js`
- 子目录路径作为分类（SnippetBox 侧边栏里会显示为 `shopify/cart`、`shokz` 等）

## 脚本一览

| 分类 | 脚本 | 用途 |
|------|------|------|
| shopify/info | `site-info` | 店铺 / 主题 / 市场 / 页面 / App 总览 |
| shopify/cart | `cart-info` | 购物车摘要、行项目、清空 / 改数量 |
| shopify/product | `product-info` | 商品与变体、选中状态、价格库存 |
| shopify/theme | `section-inspector` | 列出 Section，点击定位高亮 |
| shopify/utils | `clear-storage` | 清理 localStorage / sessionStorage / Cookie |
| shopify/utils | `outline-layout` | 布局描边，排查溢出 / Section 轮廓 |
| shopify/utils | `broken-images` | 高亮破图 / 空 src / 懒加载未就绪 |
| shopify/analytics | `meta-pixels` | 检测 GTM / GA4 / Meta / TikTok / Klaviyo 等 |
| shopify/analytics | `datalayer-peek` | 查看 dataLayer 最近事件，可监听 push |
| shokz | `free-gift-rules` | 可视化 `#FreeGiftConfig` 买赠规则，对照购物车命中 |
