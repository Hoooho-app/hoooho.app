# TestFlight 1.9.1 启动连接排查（2026-11-02）

## 当前任务与边界
目标是恢复本人 iPhone 上护护的启动访问。当前 main 基线 `f896a02f37e13c24a7996ab3443e8327991249a3`，本轮只做网络诊断与记录，没有改原生代码、重传安装包、切 DNS、恢复备案域名或改健康数据。原生构建与上传回执继续见 [生产入口恢复](testflight-production-entry-20261101.md)。

## 本人明确提供的结果
- 已安装 `0.1.0 (1.9.1)`，不能继续以旧安装包为本次根因。
- App 出现“连接未完成，点此重试”。
- 同一部 iPhone 的 Safari 打开 `https://hooohoapp-production.up.railway.app/nurse-station` 也失败。
- Wi-Fi/蜂窝对照问题被取消后用户要求继续；没有取得结果，不能当作任一网络已成功或均失败。尚未取得 Safari 的具体错误文字。

## 已取得证据及限度
- 执行环境通过 HTTPS 请求首页与 `/api/health` 均 200；`hoooho.com/nurse-station` 503，保留此前备案暂停策略。服务器侧可访问不等于本人手机可访问。
- Railway 原 Production 两服务 Online，当前主应用部署 `2efac27d-9c44-49ef-9c67-6f636e5ed357` SUCCESS，无待应用配置；本轮没有触发发布。生成域名仍挂原服务8080端口，DNS/TLS由Railway管理，没有独立证书状态可供该接口检查。
- AliDNS、Google、Cloudflare 的公开 DoH A 查询均返回 `69.46.46.124`。Google/Cloudflare AAAA查询为NOERROR无答案，AliDNS AAAA为SERVFAIL；这不能单独证明本人手机的解析错误、IPv6故障或运营商拦截。
- 采样近期100条HTTP请求未发现iPhone/iPad User-Agent。该观察不能排除日志窗口外、请求未到应用边缘或其他User-Agent，不能据此断言具体拦截方。
- 执行环境直接系统DNS解析失败属于此执行环境；HTTPS经环境可信代理，读出的证书签发者为OpenAI。因此不能拿这个证书断言原站证书链在iPhone上有效，也不应关闭iPhone证书校验或传输保护。

## 下一步与状态
当前定位为“本人手机访问生产地址失败，具体网络层原因未确定”，尚未恢复，不能标记DONE。先获取Safari失败时的准确文字或截图，区分域名找不到、连接超时、安全连接错误；也可由本人完成蜂窝对照。按证据再选择修复，避免重复上传未改变网络路径的安装包或修改无关网页。保留已有账号、草稿、Cookie与原件，不要求卸载或清空站点数据。
