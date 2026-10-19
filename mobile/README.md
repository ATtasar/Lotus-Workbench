# 接稿工作台 · 手机版

在线入口：[打开手机版](https://attasar.github.io/Lotus-Workbench/mobile/)

本目录单独保存手机版的入口、源码和构建脚本。桌面版仍在仓库根目录，两者使用不同网址，不会自动跳转。

手机版保留稿件、单主、模板、日历统计和四个图片组件，使用底部导航、日期点选、稿件卡片和底部编辑面板。图片组件可在“参数设置”和“效果预览”之间切换。

## 文件与构建

- `index.html`：手机端发布入口，内含全部样式和脚本，可独立打开。
- `src/core.js`、`src/base.css`：手机版自己的业务逻辑和基础样式副本。
- `src/mobile.js`、`src/mobile.css`：手机界面与触屏适配。
- `src/index.html`：构建入口模板。
- `build.mjs`：仅生成本目录的 `index.html`，不修改桌面版。

在仓库根目录执行：

```sh
npm run build:mobile
npm run dev
```

在本地服务地址后加上 `/mobile/` 查看手机版，也可用 `/Lotus-Workbench/mobile/` 检查发布子路径。修改手机版时只编辑本目录，并同时提交生成的 `mobile/index.html`。

## 独立数据

初次打开为空白。手机版使用 IndexedDB 数据库 `lotus-mobile-v1`，备用本地存储键为 `lotus-mobile-fallback-v1`，与桌面版和此前的本地手机预览均分开，不会读取或覆盖它们的记录。

订单、图片和模板保存在当前设备的浏览器中。需要迁移时，可在工作台设置中手动导出、导入备份；两个版本之间没有自动同步。
