# hack-chat.simple-bot
本机器人是基于WebSocket协议开发的Hack.Chat聊天辅助工具，提供消息管理、用户统计、命令系统等功能，直接在控制台运行，无需依赖。

# 版本介绍:
1. bot 这是一个精简版本，提供基础功能 
2. lounge_bot 这是一个在 bot.js 的基础上拥有特殊命令的版本，提供身份认证
3. sunldigv3_bot 这是一个文件夹，包括前端代码与后端代码，功能与 lounge_bot 相同，但有图形化界面

# bot.js 功能：
<li>!help - 显示所有可用命令说明</li>
<li>!roll - 随机生成1-6的骰子点数</li>
<li>!stats - 显示频道活跃用户排行榜</li>
<li>!save - 导出当前聊天记录为JSON文件</li>
<li>!afk - 设置/取消离开状态</li>
注： bot.js 默认加入 room ，默认名称为 bot_

# lounge_bot 功能
<li>在 bot.js 的基础上新增特殊命令</li>
<li>分别为：</li>
<li>!s [name] 禁言某人</li>
<li>!t [name] 取消禁言某人</li>
<li>!con [text] 控制bot输出 text </li>

如果想要改管理员
需将代码中类似于这样的：

 ``` javascript
 const authCode = msg.nick.startsWith('sun') ? 'sun' : null;
  
  if(authCode === 'sun') {
    this.silencedUsers.set(targetUser, true);
```
所有 sun 改为其他的，如全部改为 123 ，
这种情况下所有名称最前面有 123 的用户都有权限使用特殊命令
注： lounge_bot 默认加入 lounge ，默认名称为 sunldigv3_bot


# 使用方法 01
<li>打开浏览器控制台</li>
<li>将 bot.js 里的代码直接粘贴进去</li>
<li>找到这里： channel: "room",  其中 room 为房间名，可自定义（不要带"?"）</li>
<li>找到这里： botName: "bot_",  其中 bot_ 为bot名，可自定义</li>
<li>按回车即可运行</li>

# 使用方法 02
<li>将 sunldigv3_bot 文件夹下载解压</li>
<li>运行 index.html bot 会自动加入</li>
<li>关闭 index.html bot 会自动退出</li>

# 对于移动设备，如手机
<li>可以下载 via 浏览器</li>
<li>下载项目代码，在文件查看器里复制代码</li>
<li>回到 via 浏览器，在菜单中点击 添加书签 </li>
<li>名称自定义，如：bot</li>
<li>在网页 URL 中输入 javascript: [项目代码]</li>
<li>保存，在任意页面打开书签界面，点击保存的书签即可运行</li>

*注：此项目不会长期维护，仅提供框架。*
