# 成长数据参考值

身高与体重曲线在最新记录数值同一行右侧展示「标准参考值」，使用现有 WHO 儿童生长标准（2006）LMS 数据中对应性别、测量时精确月龄的 P50 中位数。小数月龄沿用曲线的 LMS 插值；身高为 cm，体重为 kg，均显示一位小数。

参考日期来自各指标最新的已保存记录，不受未保存的测量日期或输入草稿影响。暂无记录、缺少有效出生日期或性别、超出 0–60 月适用范围时显示「暂不可用」。免费基础曲线仍使用 WHO。新增「多参考对照」使用 CDC/NCHS 2000 官方身高与年龄别体重 LMS 数据（24–240 月），不改变测量记录；只有已获得该功能或服务已包含时开放。2 岁以下不提供 CDC 兑换入口，超出当前 WHO 0–60 月范围时不生成 WHO 百分位。

同一页面先显示测量表单，再显示最新记录与曲线。测量表单不再显示标题和日期输入，新测量使用当天日期；旧日期草稿不恢复。记录列表通过「体重曲线」右侧的第三项进入，保留原有历史、编辑、删除及返回草稿恢复流程。

验证：`npm run test:client`、`node --test server/growth/growth-measurement-service.test.mjs`、`npm run build`、`npm run test:e2e:growth-data`。在线页面验收须使用隔离虚构 API 数据，不修改真实健康记录。


## 多参考对照（who-cdc-v1）

- 商品：`growth-comparison`，30 树芽获得，正式入口 `/health-profile/basic`。所有获得状态来自 `/api/care-journey/entitlements`，不使用本地伪造所有权。无权限只进入树芽兑换，成长记录与免费 WHO 功能保留。
- 数据：CDC 官方 `statage.csv` 和 `wtage.csv`，男女、身高、体重各 218 个点。来源：https://www.cdc.gov/growthcharts/cdc-data-files.htm ，实际 CSV 地址及 SHA-256 见 `cdcGrowthReferenceData.ts`。取自官方 2000 年参考，下载日期 2026-10-18，不将下载年份称为标准版本。
- CDC 0.5 月采样点按实际间距插值；24 月和 240 月为边界，不外推。测试用官方 24 月男童 P50（86.45220101 cm、12.6707633 kg）及 P3（79.91084447 cm）核对。
- 同一条已保存测量分别计算 WHO 与 CDC 百分位及 P50。共同适用的 24–60 月记录使用相同横纵轴；手机端并列数值、纵向排列两幅曲线以保证可读。参考人群不同，不平均百分位、不合成得分、不据此给诊断。超出 WHO 适用范围仅展示 CDC，WHO 明示不适用。
- 美国 CDC 参考适用于美国人群比较，CDC 在美国临床场景建议出生至 2 岁用 WHO、2 岁及以上用 CDC：https://www.cdc.gov/growth-chart-training/hcp/overview/recommended.html 。该建议不替代中国地区参考选择。
- CDC 复用说明：https://www.cdc.gov/Other/imagereuse.html 。保留来源，不暗示 CDC 背书。中国 WS/T 423—2022、英国、日本、Fenton 等尚未接入或授权未完成，不显示为已获得、可兑换标准，不扣除树芽。

多参考专项验证：`node --import ./scripts/register-node-ts-loader.mjs --test src/features/health-profile/utils/childGrowthReference.test.ts src/pages/HealthProfile/growthRecordsExperience.test.ts`；`tests/health-profile-growth-card/growth-reference.spec.ts` 包含获得状态和低龄禁止兑换回归。
