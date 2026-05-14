export {};
const db = wx.cloud.database();

const formatTime = (date: Date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
const BLESSINGS = ["岁岁常欢愉，年年皆胜意。", "愿你心中有光，脚下有路。", "所求皆如愿，所行化坦途。", "吉星高照，好运常伴。", "不啻微芒，造炬成阳。", "心如花木，向阳而生。", "星光不问赶路人，岁月不负有心人。"];
const BLESSING_IMAGES = [1, 2, 3, 4, 5, 6].map(n => `cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/聚宝盆/${n}缩.png`);

Page<any, any>({
  data: {
    userPoints: 0, currentJackpot: 0, jackpotDigits: [0, 0, 0, 0, 0, 0], isPlaying: false, logs: [] as any[],
    scrollTop: 0, userInfo: {} as any, isGlobalCooldown: false, announcementMsg: '', showModal: false, showRulesPopup: false,
    hasResult: false, currentBlessing: '', currentImage: '', cachedImageMap: {} as Record<string, string>, isGrandPrize: false, winAmount: 0
  },

  onLoad() { this.checkCooldownStatus(); this.fetchInitData(); this.fetchLogs(); this.preCacheImages(); },
  onShow() { this.checkCooldownStatus(); this.fetchInitData(); },

  preCacheImages() {
    BLESSING_IMAGES.forEach(url => {
      if (this.data.cachedImageMap[url]) return;
      const success = (res: any) => res.statusCode === 200 && this.setData({ [`cachedImageMap.${url}`]: res.tempFilePath });
      url.startsWith('cloud://') ? wx.cloud.downloadFile({ fileID: url, success }) : wx.downloadFile({ url, success });
    });
  },

  checkCooldownStatus() {
    const endTime = wx.getStorageSync('globalCooldownEndTime');
    const msg = wx.getStorageSync('globalAnnouncement');
    if (endTime && Date.now() < endTime) this.setData({ isGlobalCooldown: true, announcementMsg: msg });
    else if (endTime && Date.now() >= endTime) { wx.removeStorageSync('globalCooldownEndTime'); wx.removeStorageSync('globalAnnouncement'); this.setData({ isGlobalCooldown: false, announcementMsg: '' }); }
  },

  async fetchInitData() {
    const cachedJackpot = wx.getStorageSync('cached_lotto_jackpot') || 80;
    if (this.data.currentJackpot === 0) { this.setData({ currentJackpot: cachedJackpot }); this.updateOdometer(cachedJackpot); }

    const cachedUser = wx.getStorageSync('currentUser');
    if (cachedUser?.points !== undefined && this.data.userPoints === 0) this.setData({ userPoints: cachedUser.points, userInfo: cachedUser });

    try {
      const [poolRes, userRes] = await Promise.all([db.collection('lotto_pool').where({ poolType: 'global' }).get(), db.collection('register_students').where({ _openid: '{openid}' }).get()]);
      if (poolRes.data.length > 0) {
        const amount = poolRes.data[0].currentJackpot;
        this.setData({ currentJackpot: amount }); this.updateOdometer(amount); wx.setStorageSync('cached_lotto_jackpot', amount);
      }
      if (userRes.data.length > 0) { this.setData({ userPoints: userRes.data[0].points, userInfo: userRes.data[0] }); wx.setStorageSync('currentUser', userRes.data[0]); }
    } catch (e) { console.error('初始化失败', e); }
  },

  async fetchLogs() {
    try {
      const { data } = await db.collection('lotto_logs').orderBy('createTime', 'desc').limit(30).get();
      this.setData({ logs: data.map((log: any) => ({ ...log, key: log.createTime, time: formatTime(new Date(log.createTime)) })) });
    } catch {}
  },

  updateOdometer(val: number) { this.setData({ jackpotDigits: val.toString().padStart(6, '0').split('').map(Number) }); },

  async addLog(action: string, isWin: boolean = false) {
    try {
      const newLog = { userName: this.data.userInfo.nickName || '匿名学子', action, isWin, createTime: Date.now() };
      await db.collection('lotto_logs').add({ data: newLog });
      this.setData({ logs: [{ ...newLog, key: newLog.createTime, time: formatTime(new Date()) }, ...this.data.logs].slice(0, 30) });
    } catch {}
  },

  async handlePlayLotto() {
    if (this.data.isGlobalCooldown) return wx.showToast({ title: '奖池重置中，请稍后再来', icon: 'none' });
    if (this.data.isPlaying) return;
    const pts = Number(this.data.userPoints) || 0;
    if (pts < 2) return wx.showToast({ title: '积分不足，至少需要 2 积分', icon: 'none' });

    this.setData({ isPlaying: true, userPoints: pts - 2 });
    const currentImage = this.data.cachedImageMap[BLESSING_IMAGES[Math.floor(Math.random() * BLESSING_IMAGES.length)]] || BLESSING_IMAGES[Math.floor(Math.random() * BLESSING_IMAGES.length)];
    let isError = false;

    const timer = setTimeout(() => {
      if (isError) return;
      this.setData({ showModal: true, currentBlessing: BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)], currentImage, isGrandPrize: false });
    }, 300);

    try {
      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'playLotto' } }) as any;
      if (!result?.success) {
        isError = true; clearTimeout(timer); wx.showToast({ title: result?.msg || '积分不足', icon: 'none' });
        return this.setData({ showModal: false, userPoints: this.data.userPoints + 2 });
      }

      if (result.isWin) {
        wx.vibrateLong();
        this.setData({ userPoints: this.data.userPoints + result.winAmount, isGrandPrize: true, winAmount: result.winAmount });
        this.updateOdometer(80); this.addLog(`祥瑞降临！清空奖池获得 ${result.winAmount} 积分！`, true);
        this.triggerGrandPrizeCooldown(this.data.userInfo.nickName || '匿名学子', result.winAmount);
      } else {
        const newPool = this.data.currentJackpot + 1;
        this.setData({ currentJackpot: newPool }); this.updateOdometer(newPool); this.addLog('诚心祈福，为聚宝盆添砖加瓦');
      }
    } catch {
      isError = true; clearTimeout(timer); this.setData({ showModal: false, userPoints: this.data.userPoints + 2 });
      wx.showToast({ title: '网络波动，请重试', icon: 'none' });
    } finally { this.setData({ isPlaying: false }); }
  },

  closeModal() { this.setData({ showModal: false }); },

  triggerGrandPrizeCooldown(name: string, amt: number) {
    const msg = `恭喜 ${name} 抽中 ${amt} 积分大奖！全服奖池进入12小时冷却。`;
    this.setData({ isGlobalCooldown: true, announcementMsg: msg });
    wx.setStorageSync('globalCooldownEndTime', Date.now() + 43200000); wx.setStorageSync('globalAnnouncement', msg);
  },

  openRulesPopup() { this.setData({ showRulesPopup: true }); },
  closeRulesPopup() { this.setData({ showRulesPopup: false }); }
});