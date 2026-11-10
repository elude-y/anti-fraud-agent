SafeAgent 首页/数据洞察/历史记录 样式改动
==========================================

本包只包含样式相关改动共 5 个文件（不含 package.json 等无关改动）。

文件清单
--------
M  src/app/home.module.css       首页背景：浅灰蓝底 + 淡蓝渐变 + 32px 网格
M  src/app/workspace.module.css  新增 .gridPage（网格背景）与 .cursorGlow（鼠标光晕）
M  src/app/insights/page.tsx     挂载 <CursorGlow />，main 加 gridPage 类
M  src/app/history/page.tsx      同上
A  src/components/cursor-glow.tsx 新增：鼠标坐标写入 CSS 变量（rAF，不触发重渲染）

应用方式
--------
解压后覆盖到项目根目录（保留 src 目录结构），然后：
  npm run dev     # 本地看效果
  npm run build   # 构建

设计要点
--------
1. 首页：background-color #eaf1fb + 158deg 淡蓝渐变（18%→7%→0）+ 32px 直角网格（8%）
2. insights / history：浅灰蓝 #eff3f9 + 双层网格（24px 细 / 120px 主）+ 边缘压暗
3. 鼠标光晕：radial-gradient(280px circle ... 10% 衰减到 30%)，仅 insights / history
4. 已处理 hover 设备判断与 prefers-reduced-motion，触屏与减弱动效下不渲染光晕

兼容性
------
只在新增的 .gridPage 类上生效，不影响 /analyze 与 /cases 页面。