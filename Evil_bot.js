(function() {
  // 生成随机后缀的函数
  function generateRandomSuffix() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const randomValues = new Uint32Array(4);
    crypto.getRandomValues(randomValues);
    
    let result = '';
    randomValues.forEach(value => {
      result += chars[value % chars.length];
    });
    return result;
  }

  const CONFIG = {
    server: "wss://hack.chat/chat-ws",
    channel: "room",
    botName: `bot_${generateRandomSuffix()}`, // 动态生成带随机后缀的名称
    commands: {
      help: "!help",
      roll: "!roll", 
      stats: "!stats",
      save: "!save",
      afk: "!afk",
      wtf: "!wtf"
    },
    commandDescriptions: {
      help: "显示所有可用命令及其说明",
      roll: "掷一个1-6的随机骰子",
      stats: "显示当前频道用户活跃度统计",
      save: "将聊天记录导出为JSON文件",
      afk: "设置/取消离开状态(AFK)",
      wtf: "让bot每秒发送一个wtf"
    },
    debug: true
  };

  const bot = {
    ws: null,
    afkUsers: new Map(),
    messageHistory: [],
    userActivity: new Map(),
    wtfInterval: null,
    
    init() {
      this.connect();
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

          this.recordMessage(msg);
          
          if(msg.cmd === 'chat') {
            const text = msg.text.trim();
            this.handleCommands(msg, text);
            this.handleAFK(msg);
          }
        } catch(e) {
          console.error('消息解析错误:', e);
        }
      };
    },
    
    recordMessage(msg) {
      if(msg.cmd === 'chat') {
        this.messageHistory.push({
          nick: msg.nick,
          text: msg.text,
          time: new Date().toISOString()
        });
        
        const count = this.userActivity.get(msg.nick) || 0;
        this.userActivity.set(msg.nick, count + 1);
      }
    },
    
    handleCommands(msg, text) {
      switch(text) {
        case CONFIG.commands.help:
          this.sendHelp(msg.nick);
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
          
        case CONFIG.commands.wtf:
          if(this.wtfInterval) {
            clearInterval(this.wtfInterval);
            this.wtfInterval = null;
            this.sendChat("已停止发送wtf", msg.nick);
          } else {
            this.wtfInterval = setInterval(() => {
              this.sendChat("wtf", null);
            }, 1000);
            this.sendChat("开始每秒发送wtf", msg.nick);
          }
          break;
      }
    },
    
    sendHelp(nick) {
      const commandsList = Object.entries(CONFIG.commands)
        .map(([cmd, trigger]) => `${trigger} - ${CONFIG.commandDescriptions[cmd]}`)
        .join('\n');
      
      const helpText = [
        "bot命令帮助:",
        commandsList
      ].join('\n');
      
      this.sendChat(helpText, nick);
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
      const message = mention ? `@${mention} ${text}` : text;
      this.ws.send(JSON.stringify({ cmd: "chat", text: message }));
    }
  };

  bot.init();
})();
