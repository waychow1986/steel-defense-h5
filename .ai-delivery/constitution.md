# 项目宪章

## 产品与架构

- 保持已批准的业务意图和范围。
- 优先选择满足已批准需求的最简单架构。
- 记录重大决策和有充分理由的例外。

## 安全与隐私

- 凭据保留在服务端；支持时使用 managed identity。
- 验证输入、执行 least privilege，绝不记录 secret 或客户内容。

## 测试与质量

- 每项用户可见能力都必须具有可独立执行的验收场景。
- 外部 integration 必须针对真实测试服务执行 contract、integration 和 end-to-end 测试；
  Mock 不能替代 functional acceptance 证据。