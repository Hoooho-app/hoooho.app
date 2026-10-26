# 手机刷新后的连接恢复修复

## 证据与边界

用户在2026-10-27手机Safari刷新后看到连接提示，随后截图显示前台与旧对话已加载、右上角“正在连接…”及护士图片失败。用户直接打开同一生产原图后正常显示。

只读核查：Production `1fb7fb10` 在线1/1，健康、域名和证书正常；近期iOS会话返回200、`outcome=valid`、持久Cookie存在。护士原图为完整有效WebP，45658字节。以上不能证明手机当时触发了哪一条本地异常，不能把后续合成复现当成已读取到手机错误日志。

在原版代码的隔离iPhone SE浏览器中，实际复现两条失败路径：

1. 会话已返回有效账号，但Zustand写入`hoooho-app`元数据时抛出QuotaExceededError，整个启动进入“暂时没能连接上”。
2. 同源另一个调用持有`hoooho-browser-session`锁，恢复代码在发出会话GET前耗尽10秒等待并失败。

原始复现日志与截图保存在上一工作树 `.codex-tmp/phone-auth-repro.log` 和 `.codex-tmp/phone-auth-evidence/`。API为显式合成替身；没有访问现有用户健康数据，没有生产写入或模型请求。

## 最小修复

- `useAppStore`的持久化仅对自身元数据缓存的QuotaExceededError/SecurityError降级为内存状态。不清缓存，不删除旧值，不捕获业务/编程错误，不改变正式记录、档案或IDB草稿的事务错误。
- 缓存写入不可用时，成员恢复优先使用服务端已确认的当前成员，再由现有成员归属校验选择。缓存不会成为身份或权限依据。
- 会话GET的可选Web Lock采用`ifAvailable`，被其他标签占用时也可直接向服务器验证；浏览器拒绝锁API时同样只执行会话GET。服务端Cookie、身份与权限仍为依据，不偷取锁，不重放登录、退出或记录写入。实际HTTP失败不在锁降级中重复调用。
- 成功确认未登录状态也计入已有恢复间隔，防止初始pageshow立刻重复读取；30秒后的恢复仍会再次查询。保留精确的一次、之后两次调用断言。

Web Locks的`ifAvailable`及不能与`signal`同时使用的约束已核对[MDN](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request)。实际请求继续沿用原HTTP超时、取消与迟到结果保护。

恢复后的前台交互、护士图、文案、记录流程、模型和供应商保持此前选择性回滚版本。不触碰生产健康记录或登录凭据。

## 验证

- 新缓存边界单测4/4；完整Client 789/789；类型检查/生产构建/diff通过。
- 正式鉴权回归26/26；会话/登录浏览器24项全部通过（原23项整套及新增前台场景分别运行），首次欢迎16/16通过；满缓存和锁占用同时存在时，前台原护士图片实际解码，输入可用，连接提示消失。
- 新增断言涵盖满缓存不清原件、不丢未提交编辑、锁被占用、锁API被拒绝、HTTP错误不重复请求、过期身份仍必须登录。
- 本机递归Auth套件遇到未改动的`password-http-types`清理钩子EBUSY：Windows无法删除仍被子进程打开的`recognition-jobs.sqlite`。不改/跳过该断言；Linux CI增加运行该用例及token撤销用例，并在最终交付明确结果。
- 生产按用户要求仅只读，部署后核对版本、健康和实际静态模块；不创建生产合成账号/记录，不调用生产模型。
- 物理iPhone/Safari未自动验证；手机实际触发原因仍需与上线后反馈区分。

## 交付和恢复

基于正式main `1fb7fb106a395ecf7b111fb1c179db48a048e730` 的隔离分支 `codex/phone-session-recovery-20261027`；原工作树及复现证据保留。

按Production-only流程完成PR、CI、合入及线上只读检查。最终证据存放 `D:/projects/hoooho/outputs/phone-session-recovery-20261027/`。撤销时正常revert本次聚焦提交并重新验证/发布，不回滚数据库，不清理浏览器数据。
