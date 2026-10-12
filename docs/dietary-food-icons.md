# Hoooho 忌口卡食物图标

素材来自上传的 Hoooho-food-icons.zip，16 个图标保留透明 WebP。静态文件在 `public/food-icons/webp-96`、`webp-144`，文件名使用英文标识和内容哈希，沿用现有 immutable 缓存策略。manifest 记录实际路径与字节数；没有引入运行时依赖。

`dietaryFoodIcons.ts` 统一解析现有 foodId，再对无 ID 的历史名称使用有限的精确别名。鳕鱼的既有 `cod` ID 使用鱼类图标，`lamb-mutton` 使用羊肉；火龙果、其他奶制品、其他豆类与未知名称继续单字占位。映射只负责图示，不改变过敏分类、忌口范围、原始名称或翻译规则。

卡片和编辑清单共用 `DietaryFoodIcon`，40 CSS px 固定占位、object-fit: contain，默认只请求 96px。加载中和失败时保持原单字占位，加载成功后移除圆形底色，完整名称始终独立显示。现有添加入口是文字输入表单，没有另一个图形选择器。

现有 Canvas 导出保留布局与文字，按可见食物去重加载 144px 同源图片，等待 decode 后绘制；每张图片的网络与解码总预算为 5 秒，失败或超时回退原单字，全部图片并行等待。未匹配、隐藏食物不请求导出图片。

`npm run test:food-icons` 核验数量、哈希、尺寸、透明像素和体积，纳入现有图片构建检查。映射与加载超时用 Client 测试验证；页面、编辑、语言、资源请求、失败回退及实际 PNG 绘制用现有 dietary-card Playwright 测试，含 Chromium 和 iPhone SE 参数下的 WebKit 自动化。WebKit 自动化不等同于真实 iPhone Safari 保存验收。
