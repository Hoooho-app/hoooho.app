# Second data audit remediation acceptance

Base: `661562b5135e342e779ec2937a0c4d7df168439e` (includes PR #467 latency changes).

Scope: repair the 25 confirmed new/extended findings and one known residual from the second audit. Preserve styles, model/provider configuration, navigation, existing original text and data. No destructive migration or new production dependency.

## Per-finding acceptance

| ID | Required result |
| --- | --- |
| R2-001 | AI 标题与结构化摘要反转不确定／双重否定含义；标题保留不能排除/双重否定的完整含义，不能写成症状未发生。 |
| R2-002 | 重复短引文绑定首次出现，误拦正确记录并漏掉跨日错误；多个同词出现时不能任意以首次index定位来判断该字段的否定与日期；需可核实的唯一证据位置/完整分句。 |
| R2-003 | 部分日期字符串忽略显式时区并截断毫秒；已明确提供Z或+05:45时按该偏移解释；无法支持的格式应明确拒绝，不静默改为上海时间或丢小数。 |
| R2-004 | 同版本草稿并发编辑均成功，先前修改被覆盖；同version发生并发冲突应至少一个409，或串行合并两个编辑；不能两个成功并静默丢数据。 |
| R2-005 | 更改显式时区仍复用旧草稿时间；输入时区属于发生时间语义，改时区后需重新解析/核对为10:00Z，不能忽略明确传入上下文。 |
| R2-006 | 就诊材料嵌套的 2 月 30 日被滚动为 3 月 2 日；归一化前校验真实自然日；4xx，整次不持久化。 |
| R2-007 | 省略材料或 journal:null 绕过原件保留保护；旧记录有材料时，不论新材料缺失还是null都执行原件保留约束；拒绝或保留现有原件。 |
| R2-008 | 日常规则修改时区后仍按首版时区生成计划；新版生效后的新条目按新版时区生成实际时刻与自然日；历史条目保留原时区。 |
| R2-009 | 撤回／删除提醒误删父事件，独立备注无法读取；撤回确认或删除提醒不得留下引用不存在event的独立记录；后续独立资料应保持可访问或按明确删除契约一致处理。 |
| R2-010 | 成员删除后排敏观察和计划仍能写入孤儿数据；涉及新增/更新健康资料的旧ID写入应核验当前成员仍存在；与已正确返回404的saveRecord及成长update保持一致。 |
| R2-011 | 排敏观察完全同刻时缺少 ID 降序稳定排序；按AGENTS.md既有occurredAt DESC → createdAt DESC → id DESC合同排序。 |
| R2-012 | 夏令时切换附近七日趋势重复或漏掉自然日；七日趋势按当前时区连续7个自然日生成，每日唯一，属于该区间的有效观察按真实当地日期恰好出现一次。 |
| R2-013 | 正式支持的旧家族史 conditions 在新列表消失；把已正式支持的历史多疾病逐项投影，保留共享详情歧义。 |
| R2-014 | 旧数据中的 null 子项导致有效条目无法撤销删除；旧异常元素不应让仍展示、可操作的有效项撤销崩溃。 |
| R2-015 | 重复档案 ID 保存成功，编辑第一条却改写第二条；重复身份应在写入拒绝或在操作前报告歧义；不可把正确版本校验和另一个目标组合执行。 |
| R2-016 | “医生明确”状态在食品分析丢失个人已知冲突；支持的历史明确状态在食品工厂与档案/忌口/交接一致。 |
| R2-017 | 反馈补充缺少原子边界，造成超额图片或删除后孤儿；在持久化时基于最新总量校验明确的10图上限；超额请求4xx且不遗留文件。 删除/补充应有原子所有权检查或串行边界，失败补充清理文件与元数据。 |
| R2-018 | 不同超长幂等键被截成相同键，第二份反馈未保存；超出现有80字符上限应4xx，或保留完整键身份；不能把原本不同键改成同一个。 |
| R2-019 | 运营同图并发上传绕过去重，产生重复历史与文件；既有相同成功图片顺序去重契约在重叠保存时同样只保留一份。 |
| R2-020 | 允许输入的长中文密码尾部不同仍能登录；不同的允许输入密码应被区分，或在注册时明确拒绝不能完整验证的输入；不能静默忽略末尾。 |
| R2-021 | 注册错误字段类型被隐式转换为密码／昵称；用户名与密码按公开前端DTO的字符串契约校验；错误结构明确4xx且不创建账户。 |
| R2-022 | 否定／不确定语句的变体仍可裁剪为肯定症状保存；对确定给出的限定不能允许裁剪后当当前肯定事项保存；不能只保护几个短邻接模板。 |
| R2-023 | 宽泛否定关键词检查误拦合法完整引文；合法修饰词与不同分句作用域不等于删除当前字段否定，正确资料应能核对保存。 |
| R2-024 | 错误主体／历史／假设提取仍可写为儿童当前症状；明确其他主体、历史或假设限定不能只依赖模型自报current/缺省time；错输出须阻断或保留限定核对，不能当已发生当前事实。 |
| R2-025 | 不可解码 codec 的 WAV 仍触发上游转写调用边界；本地能明确识别的不支持/不可解码音频应在ASR出站前解释性拒绝。 |
| KNOWN-001 | 混合饮食＋脸颊发红仍可遗漏身体观察结构化事项；不能把明确身体观察静默漏出结构化事项；至少应提示未覆盖原话核对。 |

R2-004 already passes on the base commit because PR #467 added an atomic draft-edit transaction. This branch adds a cross-instance legacy single-edit regression; it does not claim to have authored the existing fix.

## Necessary shared boundaries

- Record creation and reminder withdrawal share a short persistence barrier, preserving independently appended records and their event.
- Shared clinical evidence preserves qualification, source occurrence and literal body observations; the deterministic fact provider uses the same assertion scope. Fault injection is not a measurement of cloud model accuracy.
- Both the business draft and the older organization-preview path preserve complete numeric timestamps, offsets, seconds, milliseconds and date/clock whitespace.
- Nickname type validation applies to account updates as well as registration. Production and Vite password login pass raw request fields to validation.
- Password changes revoke both browser sessions and existing bearer authorization, including legacy-token restoration. Revision proofs reveal neither passwords nor stored hashes.

## Password compatibility

New credentials use a versioned full-password SHA256 digest (with a domain prefix) followed by bcrypt cost 12, retaining the existing 6–64 JavaScript-character limit. Unchanged short legacy bcrypt credentials still work. Legacy candidates with 72 or more UTF-8 bytes are ambiguous and cannot authenticate as passwords or prefixes; no guessed migration occurs.

The existing password page reuses its existing email-code controls for bound-email recovery and allows resending after the server cooldown. Existing sessions can bind an email first. A legacy account with neither a bound email nor a usable session cannot be automatically recovered from its truncated hash. No account data or old hashes are rewritten on read.

## Validation and release

The first full browser run and a fixture-corrected replay exposed one additional direct dependency: business credential errors (`CODE_INCORRECT`, `CODE_ATTEMPTS_EXCEEDED`, `INVALID_CURRENT_PASSWORD`, `INVALID_CREDENTIALS`) use HTTP 401 but do not invalidate the existing session. The shared API client previously restored and replayed them, then displayed a blocking login overlay. `FIX-EXTRA-001` now preserves those errors for correction without recovery or replay; genuinely unauthorized responses still restore or suspend as before. Client regressions cover both initial and post-recovery rejection, corrected submission, and actual session expiry. Final browser acceptance includes wrong-code and wrong-current-password correction.

Release integration includes `48a10c94bf809d900475384b08d32f666d2a4a58` from main. Its new care, tools and family-sharing endpoints also require current credential revisions; the shared care guard now checks these before accepting even a fresh same-account cookie. Family-sharing's development handler resolves an explicit bearer through that same guard, preserving cookie-only access while refusing a bearer/cookie actor mismatch. Production and Vite HTTP regressions cover normal access, cross-account read/write refusal and a stale bearer paired with a fresh cookie. Two backend prompt phrases use the current 健康随记 product name to satisfy the newly integrated terminology contract.

- [x] Exact reproductions and normal controls verified independently in isolated storage / local HTTP.
- [x] Known redness omission is rejected with the original retained; complete extraction can retry and save in the same draft.
- [x] Final full server/client suite, TypeScript, build and whitespace checks on frozen source, including the additional credential-error correction.
- [ ] Real browser data operations at mobile widths; emulation is not physical iPhone/Safari acceptance.
- [ ] Commit/push/main integration and exact-commit Staging verification. Initial push attempts were blocked; the user has now explicitly authorized upload and deployment, and release integration is in progress.
- [ ] Required real-email acceptance for the password recovery dependency.
- [ ] Exact-commit Production verification after Staging.

Runtime evidence is delivered separately from repository source. Earlier invalid audio fixtures remain recorded as invalid; the correct extensible PCM fixture has a real subtype GUID and its unsupported-GUID control must fail before ASR.
