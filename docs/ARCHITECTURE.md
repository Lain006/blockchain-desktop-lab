# 架构与信任边界

Electron 主进程管理每节点独立 utilityProcess，renderer 通过隔离 preload 发送白名单动作；管理器按稳定 ID 保存配置与链。

Node.js 后端采用 CommonJS；网页采用 Vue 3 Composition API、TypeScript 和 Vite。哈希为固定顺序 JSON 数组编码，数据为字符串，难度固定为三个前导零；创世块和后续块均验证结构与哈希。网络只接受更长且有效的链，等长分叉不合并。

桌面收到有效块后向其他邻居继续转发，CLI 与桌面复用 runtime。

## 数据与边界

- 浏览器/API 数据是不可信输入；前端解析字段，后端共识验证独立完成，网页不声称代替共识验证。
- P2P 输入可能拆包/粘包，按 JSON 层级解析，处理跨包 UTF-8，并限制消息大小。
- HTTP/P2P 默认仅监听本机；没有生产身份认证、钱包、交易签名或真实资产。
- 存档先验证、先写成功再提交内存；无效文件不静默清空，备份恢复会提示。
- 无事务邮件、后台任务调度、搜索引擎发布或内嵌 AI 自动化，因此不设置这些能力的额外文档。

## 文档索引

[用户教程](../README.md) · [流程](FLOWS.md) · [权限](PERMISSIONS.md) · [配置](CONFIGURATION.md) · [测试](TESTING.md) · [截图](SCREENSHOTS.md)
