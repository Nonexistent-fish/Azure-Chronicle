const getTodayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

Component({
  data: {
    todayDate: '',
    dayOfWeek: '',
    fortuneLevel: '加载中...', 
    luckyColor: '-',
    luckyNumber: '-',
    doThing: '...',
    dontThing: '...',
    quote: '加载中...',
    isSP: false,
    isCommitted: false 
  },

  lifetimes: {
    attached() {
      this.initDateAndFortune();
    }
  },

  methods: {
    // 初始化与静默预加载
    async initDateAndFortune() {
      const now = new Date();
      const dateStr = getTodayStr();
      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      
      this.setData({ todayDate: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`, dayOfWeek: days[now.getDay()] });

      const cachedDate = wx.getStorageSync('fortune_last_date');
      const cachedResult = wx.getStorageSync('fortune_last_result');

      if (cachedDate === dateStr && cachedResult?.isCommitted) return this.setData(cachedResult);

      try {
        const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'peekFortune' } }) as any;
        if (result?.success) {
          const newFortune = this.generateFortuneContent(result.level, result.isSP);
          this.setData({ ...newFortune, isCommitted: result.isCommitted });
          
          if (result.isCommitted) {
            wx.setStorageSync('fortune_last_date', dateStr);
            wx.setStorageSync('fortune_last_result', { ...newFortune, isCommitted: true });
          }
        }
      } catch (e) {}
    },

    // 正式提交发放奖励
    async commitDraw() {
      if (this.data.isCommitted) return;

      try {
        const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'commitFortune' } }) as any;
        if (result?.success) {
          this.setData({ isCommitted: true });
          
          wx.setStorageSync('fortune_last_date', getTodayStr());
          wx.setStorageSync('fortune_last_result', { 
            fortuneLevel: this.data.fortuneLevel, luckyColor: this.data.luckyColor, luckyNumber: this.data.luckyNumber, 
            doThing: this.data.doThing, dontThing: this.data.dontThing, quote: this.data.quote, isSP: this.data.isSP, isCommitted: true 
          });

          // 头像框即时渲染
          if (result.isSP && result.frameUrl) {
            let user = wx.getStorageSync('currentUser') || {};
            user.avatarFrameUrl = result.frameUrl;
            user.avatarFrameSizeLevel = 'normal';
            user.achievements = [...(user.achievements || []), { id: 'fortune_koi_01', unlockTime: Date.now() }];
            wx.setStorageSync('currentUser', user);

            const pages = getCurrentPages();
            pages[pages.length - 1]?.setData({ 'userInfo.avatarFrameUrl': result.frameUrl, 'userInfo.avatarFrameSizeLevel': 'normal' });
            wx.showToast({ title: '锦鲤降临，相框已自动佩戴！', icon: 'none', duration: 3500 });
          }
        }
      } catch (e) {}
    },

    // 生成运势内容映射
    generateFortuneContent(level: string, isSP: boolean) {
      const levelMap: Record<string, any> = {
        '锦鲤': { doThing: '许愿、买彩票、横着走', dontThing: '自我怀疑、低调', quote: '万中无一的校园锦鲤，今天你就是光！' },
        '大吉': { doThing: '投递简历、表白、参加社团', dontThing: '过度谦虚、宅在宿舍', quote: '今天你的光芒藏不住，想做的事大胆去冲。' },
        '中吉': { doThing: '实操练习、去图书馆、约饭', dontThing: '熬夜排位、跟人抬杠', quote: '顺利且舒服的一天，适合巩固人际关系。' },
        '小吉': { doThing: '按部就班、听歌散步、吃甜点', dontThing: '冲动消费、立大Flag', quote: '平平淡淡才是真，没有坏消息就是最好的消息。' },
        '平': { doThing: '摸鱼苟住、早睡早起', dontThing: '瞎折腾、参与八卦', quote: '薛定谔的运气，全靠你自己的心态来定。' },
        '水逆': { doThing: '躺平保平安、点外卖', dontThing: '抽卡必沉、强出风头', quote: '今日不宜搞事业，建议把自己封印在被窝里。' }
      };
      const data = levelMap[level] || levelMap['平'];
      const colors = ['松石绿', '克莱因蓝', '拿铁咖', '高级灰', '樱花粉', '日落橘', '暗夜黑', '钛晶白'];
      return { fortuneLevel: level, luckyColor: colors[Math.floor(Math.random() * colors.length)], luckyNumber: String(Math.floor(Math.random() * 9) + 1), ...data, isSP };
    },

    onShare() { 
      wx.showToast({ title: '保存海报功能开发中', icon: 'none' }); 
    }
  }
});