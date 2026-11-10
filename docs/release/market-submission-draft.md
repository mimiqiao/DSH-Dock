# 0.3.1 发布记录

目标：deepseek.stream 社区市场（用户指定）。用户已授权公开仓库并替换系统素材。

- 已完成原创 SVG 壁纸和图标替换；当前发行包没有 Apple 图片或标志。
- 添加 MIT 许可证、第三方声明、repository/author/description 与精确兼容范围。
- 保留 @local/desk-workbench 包名、desk 投影和 panel key，避免已有安装身份变化。
- 构建、36 项单元测试、test:browser 与 test:features 通过。
- 发行包 0.3.1 在独立 DSH_HOME 中通过真实 CLI 安装，依赖解析成功；未重启用户 Harness。
- 市场已解析 ZIP，发布者为 mimiqiao；已确认提交成功，市场页面显示“待审核”，尚未公开、暂不可安装。
- 发布文件：dist/dsh-dock-0.3.1.zip、dist/local-desk-workbench-0.3.1.tgz，通过 npm run package 可重新生成。
- deepseek.stream 的开发指南实际要求 package.json、dsh.bundle.patch 与可运行 JavaScript；未凭外部建议添加没有契约依据的 plugin.json。
- AI 精选未实现，不列入发布功能。

当前素材许可证和历史素材范围见 THIRD_PARTY_NOTICES.md。开源项目独立于 DeepSeek 与 Apple，市场提交不是官方背书。

## 提交回执

- 插件 ID：`@local/desk-workbench`，版本 0.3.1，发布者 mimiqiao。
- 市场：https://deepseek.stream/plugins/%40local%2Fdesk-workbench
- 发行文件：https://github.com/mimiqiao/DSH-Dock/releases/tag/v0.3.1
- 当前状态：待审核；市场没有固定审核完成时限。
- 结构化回执见 market-submission.json。
