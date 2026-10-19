# 电脑端 UI 来源

本目录复用用户明确指定的 `commission-workbench/接稿工作台-空白版.html`，不是 React 手机页面。

- 原 HTML SHA-256：`1f929b4808b9134354d0461a2eed640bb45fe694cc870952feb56555ccd5a3e8`。
- `styles.css` 与该 HTML 的内嵌样式逐字一致（仅换行可不同）。
- `app.js` 保留原页面渲染、表单、筛选、多选、日历联动及全部图片组件；只替换数据读写及存储说明。
- `model.js` 从原脚本提取原始空白数据模型和校验器，前后端共用。
- `storage.js` 连接 `127.0.0.1` 上的本机 SQLite 服务，不向远程服务器发送数据。

原 HTML、原有 React 手机源码以及 Android、云端工程保留。本地安装入口只构建这里的电脑端 UI。
