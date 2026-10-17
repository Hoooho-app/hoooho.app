# 家庭协作隔离工作区

本模块不改变任何原有 `accountId/memberId` 所有权，不对旧业务 API 扩权。

## 实际交付范围

- 2 位成人的独立账号，指定 Hoooho ID 的 24 小时单用邀请，双方明确接受。
- 创建时指定孩子，新孩子不自动加入。照顾者可明确关联本人的孩子档案，或建立个人孩子副本。
- 正式记录先保存到本人现有档案，主动预览并按批次发布快照。原始 AI 对话、关联 IDs、未关联附件、其他孩子均不发布。
- 提供来源、发生/创建/共享时间、修订、疑似重复提示、源版本变化拦截与逆序撤回批次。不会合药量、自动去重、覆盖两份档案。
- 共享原件附件由隔离路由代理读取，每次检查当前授权与原件归属，不发公开 URL。
- 到期停止新批次共享，历史可读/导出；撤销授权立即阻止后续所有工作区 API/附件访问。已导出或已经下载的资料无法远程删除。
- 本人原始记录始终在本人的正常档案里，因此退出不需要付费取回资料。

这不是全部日历、健康档案、提醒和编辑接口的双向实时同步。页面会如实说明。当前只共享 `health-event-records` 正式记录的文字快照及选中记录关联附件；生长、接种等独立资料库不隐式开放。没有后台静默发布。

## 中央接线

`new FamilySharingService({dataDirectory, attachmentReader: existingEventAttachmentService, entitlement})`

`entitlement(accountId, now)` 必须是服务端能力，返回 `{ active, mode, expiresAt? }`。不传时仅 `FAMILY_SHARING_INTERNAL_ACCOUNTS` 指定的真实注册账号可以开内部测试家庭，默认无正式能力。不要使用客户端会员布尔值，不自动起七天计时，也不锁已有免费功能。

app 复用当前认证 `readAccountId`：`familySharingRoute(pathname)` → `familySharingResult(service, accountId, route, method, input)`。普通结果 JSON `private,no-store`；`result.file` 分支以附件、`nosniff` 与 `private,no-store` 返回 Buffer，不进行 JSON 序列化。POST 请求上限为 `FAMILY_SHARING_BODY_LIMIT`。

Vite 可接 `familySharingApiPlugin({dataDirectory, attachmentReader, entitlement})`，它支持真实浏览器会话并验证同源；无浏览器会话仅接受非 browserSession、非 purpose 的旧令牌。前端路由导入 `src/features/family-sharing/FamilySharingPage.tsx`（建议 `/family-sharing`）。

账户生命周期接线：`familyOwnerLifecycle(dataDirectory, accountId, { mergeInto? })`（`lifecycle.mjs`）。删除账户时在旧资料清理前调用；guest合并时在同一账户事务中以guest ID调用并传`mergeInto`。不转移任何家庭授权：清理其拥有的空间、其他空间的参与者/来源/批次/邀请/审计标识；管理员删号会关闭空间，其他照顾者个人原记录不动。registered-only本来不会有guest家庭，仍会清理幽灵邀请，不让guest合并继承跨账号权限。同ID原地升级返回不变。

孩子删除前调用 `familyChildLifecycle(dataDirectory, accountId, memberId)`。删除共享主孩子会移除相应工作区范围，并使旧邀请失效；空间已无孩子时关闭空间。删除照顾者的个人关联孩子只移除其关联和快照，其他源记录不动，不留姓名生日或旧附件授权。

模块还会在每次查阅检查原账号、原孩子与原记录存在且归属匹配，删除或失效来源不会继续展示。正式上线家庭协作前应把管理员转让及所有跨账号业务闭环作为独立验收项。默认关闭正式创建，不把这部分描述成已售会员功能。

## 验证

`node --test server/family-sharing/family-sharing-service.test.mjs`

`node server/family-sharing/mobile-acceptance.mjs`：独立合成数据和临时存储，390×844与375×667浏览器操作创建、邀请、双方发布、退出与撤权，不触碰生产数据。

覆盖默认关闭、身份/范围/接受、24小时到期、邀请替换/重放/并发席位、私有资料、源变化、重复批次、不同作者疑似重复、个人副本与退出、到期可读、附件撤权、原件删除和批次修订撤回。
