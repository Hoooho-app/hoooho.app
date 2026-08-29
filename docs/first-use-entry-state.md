# 首次使用入口状态

`GET /api/account/entry-state` 是首页入口判断的服务端事实来源，响应为：

```json
{
  "familyMemberCount": 1,
  "hasValidHealthRecord": true
}
```

- `familyMemberCount` 统计当前账号仍存在的家庭成员。
- `hasValidHealthRecord` 在当前账号曾成功保存至少一条非空 `HealthEventRecord` 时为 `true`，成员删除不会抹掉这一账户级完成事实。
- 只有空白 `HealthEvent` 外壳时仍为 `false`。
- 即使 `hasValidHealthRecord` 为 `true`，`familyMemberCount === 0` 仍强制进入零成员兜底首页。

新账号登录不再自动创建“我”。`POST /api/members/self` 用于用户明确选择“我自己”或完成本人资料时按需、幂等地创建本人角色。
