# 自动分类可视化工作台 Implementation Plan

> **For Codex:** Use executing-plans to implement this plan task-by-task in this session. 用户已授权计划后直接实现；不提交、不推送。

**Goal:** 将 Harness 中跨会话的工作与成果自动分类、聚合并呈现在可交互的物件桌面，支持真实内容预览和回原会话继续。

**Architecture:** 保留 Harness session summary projection，升级为可重放的纯数据模型；分类区分工作主题、成果格式和状态。客户端以固定桌面物件作为分类入口，打开后浏览真实成果；完整内容按需经认证文件接口读取，避免把大文件塞入 summary。没有文件的工作保留讨论摘要，重复文件修改聚合为版本。

**Tech Stack:** JavaScript ESM、React（Harness 注入）、Zod、Node test runner；无额外模型调用。

---

### Task 1: 核实契约和保留原件
- 读取本机 Harness 的 projection、session、present、文件访问和布局接口实现。
- 原文件备份至 /tmp/desk-workbench-before-20261109。
- 记录真实事件格式、导航与认证文件读取方式；不假设接口。

### Task 2: 可重放的分类模型
Files: 新建 model.js、tests/model.test.js；修改 index.js。
- 用可持久化 pending 调用状态替换进程级 Map，保证缓存恢复和跨会话互不污染。
- 收集 deliverables/presented、成功写入文件、附件、回复及用户主题。
- 自动识别演示、网页应用、图片、视频、音频、文档、数据、代码、其他；HTML 根据内容和上下文区分演示与网页。
- 按路径/附件身份聚合同一作品，记录修订；讨论摘要按工作会话聚合。
- 区分运行、需回应、问题与已有结果；分类不确定时保留其他。
- Run: node --test tests/model.test.js；覆盖重放、失败工具、文件格式、多成果、无文件讨论、版本去重、历史多于12件。

### Task 3: 物件桌面和内容浏览
Files: 新建 client-source.js、scripts/build-client.js；生成 client.js；更新 package.json。
- 暖色桌面：投影幕、电脑、相框、播放器、音箱、书架、数据夹、工具箱、便签板承载分类；物件展示计数和最新成果。
- 分类抽屉支持主题、状态及搜索；所有会话保留来源关联。
- 点击作品先查看：HTML隔离预览、图片、媒体、PDF、文本；Office 文件提供真实文件下载/打开入口，不假装原生可播放。
- 按当前源码支持的接口导航回原会话，不自动发消息。
- 支持键盘、关闭、窄屏、加载/失败/空态，管理 Blob URL 和请求生命周期。

### Task 4: 集成与验证
Files: tests/client.test.js、README.md、locale/*；需要时新增独立演示测试夹具。
- Run: npm test、npm run build、node --check index.js、node --check client.js。
- 使用真实格式事件夹具验证 Host 注册和摘要到客户端的完整链路。
- 用浏览器验证桌面、分类、预览、返回和窄屏；演示数据只用于独立测试入口，不混入真实插件。
- 核实当前安装指向，采用可逆更新；记录能验证与无法验证的边界。

## 验收标准
- 跨会话自动归类，多种成果可同时出现；无文件讨论可找回。
- 桌面物件有实际入口；文件内容可查看或明确提供对应打开方式。
- 同一文件修订聚合，未成功执行不冒充作品；历史不因12条货架丢失。
- 回到正确来源会话，不新增未经用户要求的提示消息。
- 有测试结果和实际渲染证据；未验证能力明确记录。

## 执行结果 · 2026-11-09

- [x] Task 1：核实本机 Harness 0.2.2-rc.1 的真实事件、文件与导航契约；保留原件。
- [x] Task 2：实现可恢复 pending、真实文件元数据、部分补丁处理、助手交付链接、分类与聚合；14 项 Node 测试通过。
- [x] Task 3：实现 10 类物件桌面、进展便签、筛选搜索、内容预览、PPTX 简版翻页、原会话导航与移动布局。
- [x] Task 4：完成独立浏览器交互验证、实际 Electron 加载和真实历史会话读取；打包文件检查通过。

实际联调发现的补充：
- 冷历史会话不能仅依赖列表中的旧投影缓存，客户端需要按需 refreshProjections；以两个并发后台读取。
- userQuestions 的 active 状态用于“等你回应”，不能只靠 turn/end 字符串推断。
- 旧格式/不可读取会话仍按真实会话标题保留在“待整理”中，不伪造摘要，也不静默迁移。
- 旧文件可能已被删除；真实环境验证了 404 错误和重试状态，不能把测试夹具的图片成功误报为真实旧文件可用。

PPTX 简版预览为计划内“真实文件可查看”的增强，复杂排版与旧二进制 PPT 仍需对应应用。方法、验证证据和限制已写入 README 与验证记录。未提交、推送或发布。
