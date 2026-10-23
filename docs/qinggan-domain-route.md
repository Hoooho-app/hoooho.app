# 情感记愁诗临时域名入口

本次范围：只新增 `/qinggan-jichoushi-notebook/` 受限转发。健康、家庭业务与界面保持原样。基线 origin/main `ff4385aa1714d3ee5644deea47c36326762f40c4`，开始工作时工作区干净。

前端、后端在独立 Railway 项目 `qinggan-jichoushi-web` 与 `qinggan-jichoushi-api` 中运行。后端另挂持久卷，使用独立匿名凭据；不得共享健康账号、家庭账号、AUTH_TOKEN_SECRET 或既有健康/家庭数据。此仓库只将域名路径转发到 `QINGGAN_UPSTREAM_URL`，环境变量必须指向独立前端 HTTPS 根地址。

验收清单：

- 正式名称「情感记愁诗」；两个底部入口「记仇」「翻旧账」。
- 新路径正确转发页面、附件、API；不带尾斜杠的地址重定向。
- 独立记录、语音/图片附件、逐秒计时、翻篇、导出、选择分享与兑现提案由新服务提供。
- Hoooho 与家庭的路径、鉴权、数据和页面不变；健康 Cookie 和身份头不进入新服务。
- 转发单元测试、现有家庭网关测试、构建通过；新服务健康后才发布入口。
- 提交、推送 main、Production 部署与线上入口检查。iPhone 麦克风由真机另行验收。
