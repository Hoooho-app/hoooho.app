# 总控台与费用自动采集

控制台入口 `/ops`，备案期间使用原 Railway Production 原生主机；不恢复暂停域名。仅唯一管理员可访问所有 `/api/ops/*`，前后端均校验身份。费用保留原快照面板，增加自动采集、费用字段和提醒；不进行付款/续费、不预测成本或混算币种。

## 页面与完整流程
- Overview：未查看的新反馈、账单快照/连接失败、到期或额度不足；打开并定位源内容成功后才记已查看，预览不清除。新补充/新快照/新风险指纹不能被旧回执清掉；未查看跨日保留，查看不等于解决。
- 费用监控 `/ops/billing`：板块内选项目，显示真实来源、采集连接、字段与私有截图；可筛选临期/不足、待核验、已读取项目正常。历史截图作为管理内可选兼容入口，日常流程不依赖上传。既有来源仍属于护护记录，其他项目未接入为空；更新全部只作用于所选项目。
- 服务链接 `/ops/services`：只检查服务端登记的应用健康端点，显示状态/HTTP/延迟/时间；未登记不判断在线。接口密钥存在只标“已配置”，不当成连通证明，不发邮件或模型请求。
- 版本管理 `/ops/versions`：显示当前实例的 Railway 提交/部署编号与私有持久启动记录。平台未提供时明确未知；仓库最新提交不代替线上版本，其他项目及原生渠道未接入不伪造。
- 工作台设置 `/ops/settings`：服务端持久保存日期和额度阈值，保存失败保留输入；仅站内提醒，无自动邮件/短信。

## 采集与事实语义
后台每天08:00 Asia/Shanghai串行运行，到期任务在重启后补采；周任务按北京时间7个自然日间隔，来源并发请求合并，单项超时或失败不阻塞其他来源。未授权来源不反复写定时失败历史。重新登录期间暂停定时采集，完成原平台验证后“验证会话并更新”。失败保留旧图/旧事实并标明待核验，相同图片不复制文件，但独立更新已读取字段的核验时间。截图成功不证明费用正常。

默认提醒为30/7/3天、额度剩余20%/5%，可在工作台设置更改。到期按北京时间自然日判断；额度重置日期不当付款日。余额必须有明确币种，正余额没有提醒值时不单独判正常；日期须有含义，无法确认字段保持未知。日采集超过36小时、周采集超过8天不显示正常；历史风险仍显示“上次读取，尚待复核”。自动续费开关是独立事实，未知时不猜测。

## 当前接入与一次性配置
官方域名注册到期事件使用 `https://rdap.verisign.com/com/v1/domain/hoooho.com`，无需登录；只存expiration，不存联系人等无关资料，不将注册到期当扣款日期或自动续费状态。

阿里云（含百炼）、Apple Developer、Railway/Volume、OpenAI、Resend、Cloudflare、GitHub、Figma、ChatGPT/Codex均登记为自动账单区域采集。没有服务端专用持续登录授权时明确“待持续登录授权”，不是已接通。产品调用密钥不等于账单管理授权，不扩张既有密钥权限。

需要两个服务器端配置：
- `OPS_BROWSER_CDP_URL`：管理员已授权的专用账单浏览器CDP连接地址，按秘密保存。不自动创建付费浏览器、不从本机插件导出Cookie。
- `OPS_CAPTURE_PROFILES`：以来源ID为键的JSON，包含供应商真实HTTPS账单URL、唯一截图区域、已登录标志、已审核的隐私遮罩、费用字段及其单位。仅允许源码登记的供应商域名，前端来源URL不能扩大采集目标。

结构示例（选择器仅说明结构，必须根据真实页面核对，不能原样当成接通）：

```json
{
  "railway": {
    "url": "https://railway.com/account/billing",
    "selector": "[data-verified-billing-region]",
    "readySelector": "[data-verified-account-ready]",
    "privacyReviewed": true,
    "maskSelectors": ["[data-private-account]"],
    "currency": "USD",
    "dueKind": "payment",
    "dateFormat": "YYYY-MM-DD",
    "lowBalanceThreshold": 5,
    "fields": { "dueAt": "[data-due]", "balance": "[data-balance]", "quotaRemaining": "[data-remaining]", "quotaLimit": "[data-limit]" }
  }
}
```

账单URL必须是登录后的最终地址，HTTP重定向会暂停并要求核验，不跟随到其他站点。字段在账单区域内只读；日期支持ISO日期/UTC时间，或显式指定MM/DD/YYYY、DD/MM/YYYY；不模糊猜测，不使用OCR或外部模型识别账单。设置了币种后可读该币种符号的金额。自动续费只有与明确配置文本一致才读为开/关。截图限制为唯一账单区域，遮罩隐私；禁止body/html整屏区域，遇到登录/MFA/CAPTCHA不绕过、不提交表单、不处理付款。

## 权限、存储和验收
- `OPS_OWNER_EMAIL` 唯一管理员缺失/格式错误时接口关闭。服务端秘密不出现在JSON、浏览器或日志。
- 原 `/data/ops/billing-sources.json` 和私有 `snapshots/` 保留；图片仅管理员Bearer读取，响应private,no-store，无公开图片链接。
- `overview-receipts.json` 保存独立查看回执；`workspace-settings.json` 保存阈值；`web-releases.json` 保存本实例真实提交记录。
- 普通图片历史保留30天；最新成功图与重要图不自动清理。兼容手动导入仍必须明确确认隐私裁除，不能伪装API来源。
- `npm run test:ops` 覆盖持久化、权限、事实/风险、真实Chromium合成账单截图、页面与完整源定位；外部供应商接通状态必须另行核验，不能用合成测试冒充。
- 发布和未完成的授权项见 `delivery/ops-automation-20261101.md`。
