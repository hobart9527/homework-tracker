# 企业微信语音推送 — 操作指南

## 前置条件

- 一个企业微信管理员账号（免费注册）
- 能访问服务器环境变量配置

---

## 第一步：注册企业微信

1. 打开 [work.weixin.qq.com](https://work.weixin.qq.com/)
2. 点击「立即注册」，选择「企业」类型
3. 填写企业信息（个人开发者也可以注册，不需要营业执照）
4. 注册完成后进入管理后台

---

## 第二步：创建自建应用

1. 管理后台 →「应用管理」→「自建」→「创建应用」
2. 填写应用名称（如「作业打卡」），上传 logo
3. 选择可见范围（至少包含你自己）
4. 创建完成后记录以下信息：

| 信息 | 位置 | 对应环境变量 |
|------|------|------------|
| CorpID | 首页「企业信息」或「我的企业」底部 | `WECOM_CORPID` |
| CorpSecret | 应用详情页 →「Secret」→ 点击查看 | `WECOM_CORPSECRET` |
| AgentID | 应用详情页 → AgentId | `WECOM_AGENTID` |

> CorpSecret 仅在创建时显示一次，请立即保存。

---

## 第三步：配置应用权限

应用详情页 →「企业可信 IP」：添加服务器出口 IP。

如果只是本地 / 内网使用，可跳过。生产环境建议配置。

---

## 第四步：创建群聊 + 获取 chatid

### 方式 A：通过 API 创建（推荐）

```bash
# 1. 获取 access_token
curl "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=你的CORPID&corpsecret=你的CORPSECRET"

# 2. 创建群聊
curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/appchat/create?access_token=ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "作业打卡群",
    "userlist": ["你的企业微信UserId"]
  }'

# 返回值：{"errcode": 0, "errmsg": "ok", "chatid": "wrOgDSDAAA..."}
#                                                    ↑ 这就是 chatid
```

获取 UserId：管理后台 →「通讯录」→ 点击成员 → 账号详情。

### 方式 B：企业微信客户端手动创建

1. 打开企业微信 App → 工作台 → 点击你的应用
2. 在应用内发送消息
3. 配置消息回调后，回调中会包含 ChatId

---

## 第五步：配置环境变量

编辑 `.env.local`：

```bash
WECOM_CORPID=ww1234567890abcdef
WECOM_CORPSECRET=你的CorpSecret
WECOM_AGENTID=1000002
```

重启应用生效。三个变量都配置时自动切换企业微信模式；留空则回退到 iLink bridge。

---

## 第六步：在设置页面添加群

1. 打开 Settings → 家庭通知通道
2. 点击「+ 手动添加微信群」
3. **微信群标识**：填入 chatid（如 `wrOgDSDAAAaMesOMFQTvLdUHDqKqkVmA`）
4. **显示名称**：填入好记的名字（如「Mia 数学作业群」）
5. 点击「添加」

---

## 第七步：关联作业到群

**方式 A：为孩子设置默认群（一次配置，全局生效）**

Settings → 孩子与集成 → 选择孩子 → 默认微信群 → 选择群

**方式 B：为单个作业指定群**

创建/编辑作业时 →「微信推送设置」→ 勾选「发送到微信群」→ 选择目标群

---

## 第八步：测试验证

1. Settings → 家庭通知通道 → 点击「检查发送服务状态」
   - 成功：「企业微信已配置（CorpID: ww123456…），可正常发送」
2. 孩子账号完成一次音频作业打卡
3. 触发队列处理（手动点击或 CRON 调用）
4. 检查企业微信群是否收到音频文件

---

## 自动化

配置 CRON 定时触发，实现全自动发送：

```bash
*/5 * * * * curl -H "x-cron-secret: dev-cron-secret-2026" https://你的域名/api/voice-push/run
```

---

## 故障排查

| 问题 | 可能原因 | 解决 |
|------|---------|------|
| `WECOM_CORPID not configured` | 环境变量未设置或拼写错误 | 检查 `.env.local`，确认大小写 |
| `gettoken failed: invalid corpid` | CorpID 不正确 | 「我的企业」→「企业信息」底部核对 |
| `media upload failed: 40001` | access_token 过期 | 自动刷新，重试即可 |
| `appchat/send failed: 60011` | 无操作该群聊的权限 | 确认应用已加入该群聊 |
| `appchat/send failed: 60012` | chatid 不存在 | 确认 chatid 拼写正确 |
| 群里收不到消息 | 可见范围不包含群成员 | 管理后台 → 应用详情 → 可见范围 |
