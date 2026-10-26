# 权限与操作范围

本项目是本机课程实验，没有登录、角色、数据库权限表或生产认证。权限来自当前电脑用户能够运行程序和访问本机服务的事实，不应把课程端口暴露到公网。

| 入口 | 读取 | 写入/副作用 |
|---|---|---|
| 观测网页 | GET /nodes、/nodeInfo、/blocks、/peers | 无目录管理、挖矿和删块按钮 |
| 后端 CLI | 链、连接、目录 | open/api/connect/mine/observe/unobserve/exit |
| 课程 HTTP API | GET 快照 | POST /mineBlock、/addPeer，均校验输入；无生产认证 |
| 桌面管理 IPC | 状态、事件 | 限制操作名与来源窗口；renderer无任意shell/文件API |
| 数据文件 | 当前系统用户的 userData/lab | 仅主进程配置和节点存储逻辑写入；不提供永久删除按钮 |

仓库不需要 secret，也不应加入 .env、私钥、token、用户存档或聊天记忆。字体等第三方素材保留各自许可证。
