# 快捷健康随记照片

快捷听写照片沿用健康随记附件边界，但在健康随记创建前先作为当前人物的私有草稿上传。

## 数据链路

1. 客户端使用现有 `prepareHealthImage` 处理 JPEG、PNG、WebP；单张原图上限 25MB，处理后目标不超过 3MB。
2. 每张照片独立上传到 `/api/quick-records/:draftId/photos`。服务端重新检查文件魔数、解码有效性、像素与 5MB 二进制上限。
3. 二进制文件写入 `DATA_DIRECTORY/quick-record-photo-files/`；`quick-record-photo-drafts.json` 与 `event-attachments.json` 只保存私有元数据和不透明存储键，不保存 Base64。
4. 确认保存时，`QuickRecordService` 校验照片属于当前账号、当前人物和当前草稿，再把原话、健康随记记录和照片关联到同一个 event/record。照片关联失败会回滚新建的 event/record，草稿保留以便重试。
5. 保存成功后草稿标记为已消费；取消时删除未消费草稿。超过 24 小时的草稿由后续照片请求机会性清理，已被正式附件引用的文件不会删除。

## 权限与访问

- 所有草稿、删除、列表和文件读取接口都要求现有 Bearer 会话。
- 账号与人物归属在服务端校验；正式附件读取还会校验健康随记归属。
- 图片内容只能通过鉴权接口读取，不生成公开永久 URL。
- API 响应不返回磁盘存储键、内容哈希或 Base64。
