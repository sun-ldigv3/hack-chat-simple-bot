(function(){
const CONFIG = {
  server: "wss://hack.chat/chat-ws",
  channel: "lounge",
  botName: "sunldigv3_bot",
  commands: {
    help: "!help",
    roll: "!roll",
    stats: "!stats",
    save: "!save",
    afk: "!afk",
    specialHelp: "!help s",
    silence: "!s",
    unsilence: "!t",
    customCon: "!con",
    mute: "!mute",       
    checkin: "!checkin",  
    upper: "!upper",      
    lower: "!lower",      
    reply: "!reply",      
    userinfo: "!userinfo",
    msglist: "!msglist"   
  },
  commandDescriptions: {
    help: "显示所有可用命令及其说明",
    roll: "掷一个1-6的随机骰子",
    stats: "显示当前频道用户活跃度统计",
    save: "将聊天记录导出为JSON文件",
    afk: "设置/取消离开状态(AFK)",
    specialHelp: "显示特殊命令(需要权限)帮助",
    silence: "永久禁言指定用户",
    unsilence: "解除用户永久禁言",
    customCon: "发送自定义内容",
    mute: "临时禁言用户[格式：!mute 用户名 分钟数]",
    checkin: "每日签到，统计连续签到天数",
    upper: "文本转大写[格式：!upper 需要转换的文本]",
    lower: "文本转小写[格式：!lower 需要转换的文本]",
    reply: "引用历史消息回复（用!msglist查ID）",
    userinfo: "查询用户信息（默认查自己）",
    msglist: "显示最新5条消息ID及内容"
  },
  debug: true
};
const bot = {
  ws: null,
  afkUsers: new Map(),
  silencedUsers: new Map(), // 优化：存储禁言过期时间戳（永久禁言存Infinity）
  messageHistory: [],
  userActivity: new Map(),
  checkinRecords: new Map(),  // 签到记录：key=用户名，value={lastDate: 上次签到日期, continuous: 连续天数}
  messageIdMap: new Map(),    // 消息ID映射：key=自增ID，value=消息对象
  nextMessageId: 1,           // 消息自增ID计数器
  scheduledIntervals: [],     // 定时器存储（用于临时禁言检查）

  init() {
    this.connect();
    this.startMuteCheckTimer(); // 启动临时禁言过期检查
    console.log(`[${CONFIG.botName}] 初始化完成`);
  },

  connect() {
    this.ws = new WebSocket(CONFIG.server);
    
    this.ws.onopen = () => {
      console.log(`[${CONFIG.botName}] WebSocket连接成功`);
      this.joinChannel();
    };
    
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if(CONFIG.debug) console.log('收到消息:', msg);
        this.recordMessage(msg); // 记录消息（已扩展ID功能）
        
        if(msg.cmd === 'chat') {
          const text = msg.text.trim();
          // 检查是否被禁言（优化：判断过期时间）
          if(this.isSilenced(msg.nick)) {
            const remain = Math.ceil((this.silencedUsers.get(msg.nick) - Date.now()) / 60000);
            this.sendChat(`你已被禁言，剩余${remain > 0 ? remain : 0}分钟`, msg.nick);
            return; // 禁言用户无法发送消息（原有仅提醒，优化后拦截）
          }
          this.handleCommands(msg, text);
          this.handleAFK(msg);
        }
      } catch(e) {
        console.error('消息解析错误:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('连接已关闭，5秒后尝试重连...');
      setTimeout(() => this.connect(), 5000); // 新增断线重连
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket错误:', err); // 新增错误日志
    };
  },

  // 记录消息（扩展：添加消息ID，限制历史长度）
  recordMessage(msg) {
    if(msg.cmd === 'chat') {
      const msgWithId = {
        id: this.nextMessageId++,
        nick: msg.nick,
        text: msg.text,
        time: new Date().toISOString()
      };
      this.messageHistory.push(msgWithId);
      this.messageIdMap.set(msgWithId.id, msgWithId);

      // 限制历史记录长度（避免内存溢出）
      if(this.messageHistory.length > 1000) {
        const deletedMsg = this.messageHistory.shift();
        this.messageIdMap.delete(deletedMsg.id);
      }

      const count = this.userActivity.get(msg.nick) || 0;
      this.userActivity.set(msg.nick, count + 1);
    }
  },

  handleCommands(msg, text) {
    switch(text) {
      case CONFIG.commands.help:
        this.sendHelp(msg.nick);
        break;
      
      case "?":
        this.sendChat("我也很不解。", msg.nick);
        break;
      
      case CONFIG.commands.roll:
        this.sendChat(`🎲 随机骰子结果: ${Math.floor(Math.random() * 6) + 1}`, msg.nick);
        break;
      
      case CONFIG.commands.stats:
        this.sendUserStats(msg.nick);
        break;
      
      case CONFIG.commands.save:
        this.saveChatHistory();
        break;
      
      case CONFIG.commands.afk:
        this.toggleAFK(msg.nick);
        break;
      
      case CONFIG.commands.specialHelp:
        this.sendSpecialHelp(msg.nick);
        break;

      case CONFIG.commands.checkin:
        this.handleCheckin(msg.nick);
        break;

      case CONFIG.commands.msglist:
        this.sendMsgList(msg.nick);
        break;
    }

    if(text.startsWith(CONFIG.commands.silence + ' ')) {
      this.handleSilence(msg, text);
    } else if(text.startsWith(CONFIG.commands.unsilence + ' ')) {
      this.handleUnsilence(msg, text);
    } else if(text.startsWith(CONFIG.commands.customCon + ' ')) {
      this.handleCustomCon(msg, text);
    }

    else if(text.startsWith(CONFIG.commands.mute + ' ')) {
      this.handleTempMute(msg, text);
    }

    else if(text.startsWith(CONFIG.commands.upper + ' ')) {
      const content = text.slice(CONFIG.commands.upper.length + 1);
      this.handleTextConvert(msg.nick, content, 'upper');
    }

    else if(text.startsWith(CONFIG.commands.lower + ' ')) {
      const content = text.slice(CONFIG.commands.lower.length + 1);
      this.handleTextConvert(msg.nick, content, 'lower');
    }

    else if(text.startsWith(CONFIG.commands.reply + ' ')) {
      this.handleReply(msg, text);
    }

    else if(text.startsWith(CONFIG.commands.userinfo + ' ')) {
      const target = text.slice(CONFIG.commands.userinfo.length + 1) || msg.nick;
      this.handleUserInfo(msg.nick, target);
    }
  },

  sendHelp(nick) {
    const commandsList = Object.entries(CONFIG.commands)
      .filter(([key]) => !['silence', 'unsilence', 'customCon', 'mute'].includes(key))
      .map(([cmd, trigger]) => `${trigger} - ${CONFIG.commandDescriptions[cmd]}`)
      .join('\n');
    
    const helpText = [
      "    bot命令帮助:",
      commandsList,
      "p.s. :不要滥用bot"
    ].join('\n');
    
    this.sendChat(helpText, nick);
  },

  sendSpecialHelp(nick) {
    const specialCommands = [
      `${CONFIG.commands.silence} [name] - ${CONFIG.commandDescriptions.silence}`,
      `${CONFIG.commands.unsilence} [name] - ${CONFIG.commandDescriptions.unsilence}`,
      `${CONFIG.commands.customCon} [text] - ${CONFIG.commandDescriptions.customCon}`,
      `${CONFIG.commands.mute} [name] [minutes] - ${CONFIG.commandDescriptions.mute}` // 新增临时禁言说明
    ].join('\n');
    
    this.sendChat(`    特殊命令帮助（需要权限）:\n${specialCommands}`, nick);
  },

  handleSilence(msg, text) {
    const parts = text.split(' ');
    if(parts.length < 2) return;
    
    const targetUser = parts[1];
    const hasAuth = msg.nick.startsWith('sun');
    if(targetUser === CONFIG.botName) {
      this.sendChat("不能禁言bot自己", msg.nick);
      return;
    }
    
    if(hasAuth) {
      this.silencedUsers.set(targetUser, Infinity); // 永久禁言：过期时间设为无穷大
      this.sendChat(`${targetUser} 已被永久禁言`, null);
    } else {
      this.sendChat("你无权执行此命令", msg.nick);
    }
  },

  handleUnsilence(msg, text) {
    const parts = text.split(' ');
    if(parts.length < 2) return;
    
    const targetUser = parts[1];
    const hasAuth = msg.nick.startsWith('sun');
    
    if(hasAuth) {
      this.silencedUsers.delete(targetUser);
      this.sendChat(`${targetUser} 的禁言已解除`, null);
    } else {
      this.sendChat("你无权执行此命令", msg.nick);
    }
  },

  handleCustomCon(msg, text) {
    const content = text.substring(CONFIG.commands.customCon.length + 1);
    const hasAuth = msg.nick.startsWith('sun');
    
    if(hasAuth) {
      this.sendChat(content, null);
    } else {
      this.sendChat("你无权执行此命令", msg.nick);
    }
  },

  toggleAFK(nick) {
    if(this.afkUsers.has(nick)) {
      const afkTime = Math.floor((Date.now() - this.afkUsers.get(nick)) / 1000);
      this.afkUsers.delete(nick);
      this.sendChat(`${nick} 已从AFK状态返回 (离开时长: ${afkTime}秒)`, null);
    } else {
      this.afkUsers.set(nick, Date.now());
      this.sendChat(`${nick} 已设置为AFK状态`, null);
    }
  },

  sendUserStats(nick) {
    const topUsers = [...this.userActivity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([user, count]) => `${user}: ${count}条`)
      .join(', ');
    
    this.sendChat(`🏆 最活跃用户: ${topUsers || '暂无数据'}`, nick);
  },

  saveChatHistory() {
    const blob = new Blob([JSON.stringify(this.messageHistory, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_history_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  handleAFK(msg) {
    const isMentioned = /@(\w+)/.test(msg.text);
    if(isMentioned) {
      const mentionedUser = msg.text.match(/@(\w+)/)[1];
      if(this.afkUsers.has(mentionedUser)) {
        const afkTime = Math.floor((Date.now() - this.afkUsers.get(mentionedUser)) / 1000);
        this.sendChat(`${mentionedUser} 正在AFK (已${afkTime}秒)`, null);
      }
    }
  },

  joinChannel() {
    if(this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        cmd: "join",
        channel: CONFIG.channel,
        nick: CONFIG.botName
      }));
    }
  },

  sendChat(text, mention) {
    if(!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('连接未建立，无法发送消息');
      return;
    }
    const message = mention ? `@${mention} ${text}` : text;
    this.ws.send(JSON.stringify({ cmd: "chat", text: message }));
  },

  handleTempMute(msg, text) {
    const parts = text.split(' ');
    const hasAuth = msg.nick.startsWith('sun');
    // 校验格式：!mute 用户名 分钟数
    if(!hasAuth || parts.length < 3 || isNaN(Number(parts[2])) || Number(parts[2]) <= 0) {
      this.sendChat(`格式错误！正确用法：${CONFIG.commands.mute} 用户名 分钟数（仅sun开头用户可用）`, msg.nick);
      return;
    }
    const targetUser = parts[1];
    const minutes = Number(parts[2]);
    const expireTime = Date.now() + minutes * 60000; // 计算过期时间戳

    if(targetUser === CONFIG.botName) {
      this.sendChat("不能禁言bot自己", msg.nick);
      return;
    }

    this.silencedUsers.set(targetUser, expireTime);
    this.sendChat(`${targetUser} 已被临时禁言${minutes}分钟`, null);
  },

  // 2. 启动临时禁言过期检查（每10秒检查一次）
  startMuteCheckTimer() {
    const timer = setInterval(() => {
      const now = Date.now();
      // 遍历所有禁言用户，删除过期的临时禁言
      for(const [user, expireTime] of this.silencedUsers.entries()) {
        if(expireTime !== Infinity && expireTime < now) {
          this.silencedUsers.delete(user);
          this.sendChat(`${user} 的临时禁言已到期，解除禁言`, null);
        }
      }
    }, 10000);
    this.scheduledIntervals.push(timer);
  },

  // 3. 每日签到处理
  handleCheckin(nick) {
    const today = new Date().toISOString().split('T')[0]; // 格式：YYYY-MM-DD
    const userRecord = this.checkinRecords.get(nick) || { lastDate: '', continuous: 0 };

    // 已签到
    if(userRecord.lastDate === today) {
      this.sendChat(`@${nick} 你今日已签到，无需重复操作！当前连续签到${userRecord.continuous}天`, null);
      return;
    }

    // 计算连续天数
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let newContinuous = 1;
    if(userRecord.lastDate === yesterday) {
      newContinuous = userRecord.continuous + 1;
    }

    // 更新签到记录
    this.checkinRecords.set(nick, { lastDate: today, continuous: newContinuous });
    // 连续7天提示
    const tip = newContinuous % 7 === 0 ? '\n🎉 恭喜连续签到7天，获得频道专属标识！' : '';
    this.sendChat(`@${nick} 签到成功！当前连续签到${newContinuous}天${tip}`, null);
  },

  // 4. 文本大小写转换
  handleTextConvert(nick, content, type) {
    if(!content) {
      const tip = type === 'upper' ? CONFIG.commands.upper : CONFIG.commands.lower;
      this.sendChat(`格式错误！正确用法：${tip} 需要转换的文本`, nick);
      return;
    }
    const result = type === 'upper' ? content.toUpperCase() : content.toLowerCase();
    this.sendChat(`@${nick} 转换结果：${result}`, null);
  },

  // 5. 引用回复处理
  handleReply(msg, text) {
    const parts = text.split(' ', 3); // 分割：!reply ID 内容
    if(parts.length < 3 || isNaN(Number(parts[1]))) {
      this.sendChat(`格式错误！正确用法：${CONFIG.commands.reply} 消息ID 回复内容（用${CONFIG.commands.msglist}查ID）`, msg.nick);
      return;
    }
    const msgId = Number(parts[1]);
    const replyContent = parts.slice(2).join(' ');
    const targetMsg = this.messageIdMap.get(msgId);

    // 消息ID不存在
    if(!targetMsg) {
      this.sendChat(`未找到ID为${msgId}的消息，请用${CONFIG.commands.msglist}查看最新消息ID`, msg.nick);
      return;
    }

    // 发送引用回复
    this.sendChat(
      `  引用 #${targetMsg.id} @${targetMsg.nick} (${targetMsg.time.split('T')[0]}): ${targetMsg.text}\n@${msg.nick}: ${replyContent}`,
      null
    );
  },

  // 6. 发送最新消息ID列表（用于引用回复）
  sendMsgList(nick) {
    const latestMsgs = this.messageHistory.slice(-5).reverse(); // 最新5条消息（倒序）
    if(latestMsgs.length === 0) {
      this.sendChat("暂无聊天记录", nick);
      return;
    }
    const msgList = latestMsgs.map(msg => `ID: ${msg.id} | @${msg.nick}: ${msg.text.slice(0, 20)}${msg.text.length > 20 ? '...' : ''}`).join('\n');
    this.sendChat(`  最新5条消息ID列表（用于${CONFIG.commands.reply}）:\n${msgList}`, nick);
  },

  // 7. 用户信息查询
  handleUserInfo(requesterNick, targetNick) {
    // 检查目标用户是否存在（有发言记录或AFK/禁言记录）
    const hasActivity = this.userActivity.has(targetNick);
    const isAfk = this.afkUsers.has(targetNick);
    const isSilenced = this.isSilenced(targetNick);
    const isPermanentMute = isSilenced && this.silencedUsers.get(targetNick) === Infinity;
    const speakCount = this.userActivity.get(targetNick) || 0;

    if(!hasActivity && !isAfk && !isSilenced) {
      this.sendChat(`未找到用户${targetNick}的记录`, requesterNick);
      return;
    }

    // 组装用户信息
    const info = [
      `   用户 ${targetNick} 信息:`,
      `发言次数: ${speakCount}条`,
      `AFK状态: ${isAfk ? '是（已离开' + Math.floor((Date.now() - this.afkUsers.get(targetNick))/3600000) + '小时）' : '否'}`,
      `禁言状态: ${isSilenced ? (isPermanentMute ? '永久禁言' : '临时禁言（剩余' + Math.ceil((this.silencedUsers.get(targetNick) - Date.now())/60000) + '分钟）') : '否'}`,
      `权限: ${targetNick.startsWith('sun') ? '管理员（可执行特殊命令）' : '普通用户'}`
    ].join('\n');

    this.sendChat(info, requesterNick);
  },

  // 辅助方法：判断用户是否被禁言（含临时/永久）
  isSilenced(nick) {
    if(!this.silencedUsers.has(nick)) return false;
    const expireTime = this.silencedUsers.get(nick);
    return expireTime === Infinity || expireTime > Date.now();
  },

  // 清理资源（新增：页面关闭时停止定时器）
  cleanup() {
    this.scheduledIntervals.forEach(timer => clearInterval(timer));
    if(this.ws) this.ws.close();
  }
};

// 页面关闭时清理资源（新增）
window.addEventListener('beforeunload', () => bot.cleanup());
// 暴露bot对象便于调试（新增）
window.sunBot = bot;

bot.init();
})();