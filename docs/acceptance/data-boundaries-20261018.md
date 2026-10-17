# Data input and display remediation — 2026-10-18

Base: `3ae4093fe468897a0a6b864610aff2fefd89ff28`.

Scope: resolve the 44 confirmed findings from the data audit. Preserve the design system, layout, navigation, normal data contracts and existing records. No data migration or deletion is part of this change.

## Acceptance contract

- Reject malformed JSON and invalid structures before mutation in production and Vite API paths.
- Preserve raw text, negation, occurrence times, child ownership, administration routes and idempotent save identity.
- Validate calendar dates, numeric types, image/audio bytes, nested archive rows and normalized identifiers.
- Keep list, dietary card, handoff and visit report projections consistent with saved facts.
- Keep reminder occurrence IDs unique across DST gaps; surface unresolved local times instead of moving doses. Reject schedules exceeding the existing 100000 occurrence budget, and keep oversized legacy data readable without expanding it.
- Check both browser search entrances, normal input, failed input preservation and save/read-back. No visual assertions or style changes are required.

## Finding inventory

| ID | Existing audit aliases | Required correction |
| --- | --- | --- |
| DATA-001 | ED-001, MR-001 | 多药记录和提醒完成时把非口服方式改为口服 |
| DATA-002 | HIA-AI-001 | 包装声称或储存说明被并入配料，漏报已知牛奶冲突 |
| DATA-003 | MR-002 | 夏令时缺失时刻产生重复剂次，完成一剂同时完成两项 |
| DATA-004 | BLF-001 | 图片反馈并发重试返回不存在的成功 ID，并遗留孤儿文件 |
| DATA-005 | ED-002 | 睡眠空值或数字0被转换为1970年并计算出数千万分钟 |
| DATA-006 | ED-003 | 幂等键跨孩子复用返回旧孩子成功结果，新输入未保存 |
| DATA-007 | ED-004 | 基础随记接口可保存跨人物、跨账号的用药/就医关联ID |
| DATA-008 | ED-005, MR-004, HIA-AI-005 | 不存在的发生日期被自动改成另一真实日期 |
| DATA-009 | ED-006 | 仅修改睡眠occurredAt导致列表时间与睡眠区间矛盾 |
| DATA-010 | ED-007 | 已完成就诊事实允许实际出院时间在2099年 |
| DATA-011 | ED-008 | 药品ID在trim后发生重复，两个用药条目共享同一ID |
| DATA-012 | ED-010, BLF-006 | 附件字段类型错误被静默丢弃，仍返回保存成功 |
| DATA-013 | ED-012 | 结构化体温缺乏字段专属校验，0℃、999℃及“很热”字符串均可持久化 |
| DATA-014 | HIA-AI-002 | “不是过敏”可被错误输出反转成肯定过敏后保存 |
| DATA-015 | HIA-AI-003 | 允许录入的长原话保存时静默截为5000字 |
| DATA-016 | HIA-AI-004 | 超长文字与图片一起提交时文字被直接清空 |
| DATA-017 | HIA-AI-007 | 非红屁股的混合阳性症状遗漏没有拦截 |
| DATA-018 | HIA-AI-008 | 查最近一次发烧只返回最新的“没有发烧”，遮住真正最近发烧 |
| DATA-019 | HIA-AI-012 | 合法历史日期加时分被忽略日期，凌晨报未来、白天静默保存为当天 |
| DATA-020 | MR-003 | 布尔值和数组被转换为真实体重、奶量和用药剂量 |
| DATA-021 | MR-005 | 编辑允许把身高体重全部清空，仍保留为confirmed测量 |
| DATA-022 | MR-006 | 删除孩子后，旧测量仍可通过ID编辑成功 |
| DATA-023 | MR-007 | 创建儿童时跳过未满8周岁约束，与编辑规则不一致 |
| DATA-024 | MR-009, MR-014 | 作息生效日与排敏安排允许无效日期落库 |
| DATA-025 | MR-010 | 计划中部分非法时刻被静默丢弃，少生成服药提醒 |
| DATA-026 | MR-011 | 长期提醒被残留结束日期截断 |
| DATA-027 | MR-012 | 食物名称错误类型被强转，超长名称被静默截断 |
| DATA-028 | MR-013 | 未知记录状态被自动升级成有效观察 |
| DATA-029 | PF-001 | 畸形档案深层结构保存成功，后续档案列表读取持续抛异常 |
| DATA-030 | PF-002 | 相同历史明确过敏在档案被当待排查，忌口卡和交接单仍按明确过敏 |
| DATA-031 | BLF-004 | 账户头像仅验证前缀，损坏或非图片内容也保存成功 |
| DATA-032 | BLF-005 | 反馈正文与补充接受对象/布尔值，展示变成乱码式字符串 |
| DATA-033 | BLF-007 | 反馈图片与运营截图只检查文件头，损坏 PNG 仍成功持久化 |
| DATA-034 | BLF-008 | 运营反馈非法状态会把处理中事项重置为已收到 |
| DATA-035 | ED-009, MR-008, BLF-002, BLF-003 | 异常请求体未正确校验，多个接口返回500 |
| DATA-036 | ED-011 | 事件标题传错类型会静默转换为空标题 |
| DATA-037 | HIA-AI-006 | 非法25点90分抛RangeError而非可解释校验错误 |
| DATA-038 | HIA-AI-009 | 今日与今天的检索分类不一致，否定观察变成直接匹配 |
| DATA-039 | HIA-AI-010 | 昨天和今天的复合日期口语查询返回空 |
| DATA-040 | HIA-AI-011 | 仅RIFF/WAVE魔数的损坏WAV仍请求ASR |
| DATA-041 | PF-003 | 服务接受编辑分类或亲属关系并返回保存，但分组字段不变 |
| DATA-042 | PF-004 | 就诊资料可保存相同ID的不同段落，按ID编辑存在多段连带覆盖 |
| DATA-043 | BLF-009 | 运营费用来源接受无效网址和对象名称 |
| DATA-044 | BLF-010 | 运营手动上传可用 method 字段绕过隐私确认 |

## Verification

Use `TZ=Asia/Shanghai` for the existing local suites. Run the server tests with synthetic accounts and isolated temporary stores; cloud model, OCR and ASR responses are fixtures unless explicitly marked live.

Required checks: build/typecheck and asset contracts; all server and client suites; original audit probes with post-fix assertions; data-only browser flows; isolated Railway Staging deployment and synthetic HTTPS acceptance before Production and its acceptance. Count leaf tests separately from parent containers. Keep old fixture/selector exclusions explicit.

The symptom tracking fixture accepts only equivalent throat-pain phrases for `咽喉痛`; assertions on polarity, change, time and linked fact identity remain unchanged. Child creation fixtures use a birthday within the existing under-eight-year constraint.

Model wording coverage remains bounded by evidence validation and the existing deterministic parser. A local fixture pass does not establish live model accuracy, latency, or physical iPhone/Safari behavior. Ambiguous prose is not automatically turned into a medical finding.
