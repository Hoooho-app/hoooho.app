# TestFlight 启动恢复与错误定位（2026-11-02）

## 当前事实与纠正
用户明确反馈“还没好”，彻底上划关闭App再启动仍显示原生“连接未完成”。此前“允许后能打开”选项回复不能继续作为已恢复结论；原记录须纠正。Safari截图实际为暂停中的hoooho.com；准确Railway地址已由同一手机成功打开。1.9.1上传源码与启动地址已核对，尚无本机NSError，不能断言联网权限或安装包地址就是根因。

## 任务、范围与普通案例
基线main `8a5514d8d846e076b82f6c38ea155d7551058309`，干净隔离分支`codex/testflight-startup-recovery-20261102`。本人打开护护→首页加载失败→看到可辨认原因、确切版本/入口与系统错误编号→按需打开App系统设置或在Safari检查同一启动地址→本人点重新连接→首次成功打开现有生产页面；仍失败时可截图或主动复制无隐私诊断信息继续定位。旧包不能由网页修复，需完成真实原生CI与新TestFlight分发，未真机恢复前保持未解决。

- 仅改原生启动失败展示及明确点击的启动重试，不改健康前端、API、备案DNS、账号、数据或当前唯一Production。
- 启动GET重试忽略本地响应缓存，保留Cookie/IndexedDB/本地草稿；已进入业务页面后的显式重试沿用原有重载，避免自动重建WebView或重复提交业务。
- 系统错误仅做分类与编号展示；网络不可用包含权限/离线等可能性，不能无证据宣称权限被拒。证书失败不降低TLS校验。
- 诊断只含当前App版本/构建、固定公开启动地址、受控错误域和编号，不读取用户内容/密码/Cookie/令牌、不展示NSError本地化全文或完整userInfo，不自动上传；仅本人点击后复制。
- 设置与Safari由本人点击才打开，不自动授权、跳转、清缓存、自动换服务或更改隐私设置。错误布局在小屏/横屏/大字号可滚动，成功后移除失败层。
- 测试使用DEBUG合成失败→重试→本地WebKit夹具，不发正式业务/模型/邮件；保留已有录音/附件/打印等原生回归，新旧iOS均需实际Mac检查。

## 验收与交付
错误分类/脱敏、初始请求缓存策略、失败详情→人工操作→重试→同页恢复、现有原生回归、新旧系统与归档、精确main提交上传/processing/原内部组分发分别核验；只有本人实体iPhone真实打开才算启动问题恢复。仅诊断能力上线不冒称根因已修复。

## 本地检查
- 原生JavaScript桥7项、Xcode选择器Python3项通过；变更范围与差异检查通过。当前环境无Swift/Xcode，Swift编译、单元与WebKit UI流程不能冒称本地通过，交由现有双系统Mac原生CI执行；只有通过后才触发既有手动TestFlight上传。
- 本轮增加4项原生单元案例：真实系统错误编号与非断言式提示、敏感NSError详情不回显、未知域脱敏/TLS独立分类、相同Production的只读新鲜启动请求；新增1个合成WebKit失败→重试→恢复交互UI案例。

## 实际交付回执与剩余阻塞（北京时间2026-11-02）
- 实现已合入main：`6b6d9008c2f9ed64f7e26f76394510f10e76ba2d`。仅原生启动链路和任务文档变化；共享网页与备案DNS不变，无需重部署相同服务器二进制。
- [原生CI #39](https://github.com/Hoooho-app/hoooho.app/actions/runs/41361565555) 已成功：current与oldest两套iOS各20项单元、4项UI测试通过，current设备归档成功。失败→显示真实编号→本人重试→本地WebKit夹具恢复是合成案例，不是真机Production恢复证明。
- 原生CI对该精确main提交成功后，仅手动触发一次[上传 #10](https://github.com/Hoooho-app/hoooho.app/actions/runs/41362589116)，attempt1，精确源码仍为上述提交。任务及签名清理均SUCCESS。
- Apple版本`0.1.0`、构建`1.10.1`：07:33:46上传成功，07:35:49完成processing。日志分别确认`Successfully uploaded the new binary`与`Successfully finished processing the build 0.1.0 - 1.10.1 for IOS`。
- 07:35时分发状态：BLOCKED。App Store Connect停在登录页并显示身份核验失败，已交还本人恢复登录；当时未核验此新包合规状态、What to Test、原内部组「护护首轮内测」分配或TestFlight可更新状态。不使用其他会话绕过登录，不新增组/测试者，不提交正式App Store审核，不重复上传。此登录阻塞已在下方后续分发回执解除。
- 手机启动问题仍未解决、根因未确定。本人恢复Apple后台登录后，继续处理同一个`0.1.0 (1.10.1)`并加入既有内部组；手机通过TestFlight原位更新，保留已有资料。只有本人实体设备成功进入护护才确认恢复；若仍失败，使用新版页面展示的受控系统错误编号继续排查。

### 已保存的 What to Test
本版调整启动失败后的重新连接，并显示版本、固定启动地址和系统错误编号。请原位更新后打开护护，确认能进入原页面；如仍失败，请截图错误详情，再尝试重新连接。保留登录和本机资料，不需要卸载。设置、Safari检查和复制诊断只在本人点击时执行。

## 登录恢复后的实际分发（08:07核验）
- 本人回复「已登录」后复用同一Chrome的App Store Connect会话，继续处理同一`0.1.0 (1.10.1)`，未重新构建或上传。
- 构建页保存简体中文What to Test，出现Saved。核对原生源码仅Apple系统框架/WKWebView/HTTPS、无独立加密实现或加密依赖后，按现有原生分类在App Encryption Documentation保存`None of the algorithms mentioned above`；[Apple官方说明](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)确认仅使用Apple操作系统内加密无需上传文档。Missing Compliance已解除，没有接受新版开发者协议或提交App Store正式审核。
- 只把新构建加入既有内部组「护护首轮内测」及其原1名测试者，组内Builds页的`0.1.0 (1.10.1)`状态为Testing、有效期90天。原组已有版本保留，未新增组/测试者/外部邀请或扩大账号权限。
- 新观察纠正安装版本假设：此次已登录后台的原测试者状态仍记录`Installed 0.1.0 (1.7.1)`，旧`1.9.1`则仍Missing Compliance、没有测试组。此前按用户回答将1.9.1当作已安装事实的判断缺少Apple分发回执支持，不再据此排除旧包访问暂停域名的可能；后台状态也不能替代用户设备即时版本确认。
- TestFlight分发完成，实体iPhone更新、打开页面及启动故障根因仍待本人实际验证。手机应原位更新到`0.1.0 (1.10.1)`，不卸载；若仍失败，提供新版错误页面显示的系统编号后再定位。不把Testing状态冒称真机启动已恢复。
