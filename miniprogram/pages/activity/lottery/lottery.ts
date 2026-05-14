export {};
const CACHE_KEY_PREFIX = 'prizes_cache_';
const CACHE_TIME_LIMIT = 43200000; // 12 * 60 * 60 * 1000

Page<any, any>({
  data: {
    pageBgStyle: '', activityId: '', activityData: {} as any, prizes: [] as any[], displayPrizes: [] as any[],
    userInfo: { userId: '', myInviteCode: '', dailyTaskDone: false, hasFilledFriendCode: false, tickets: [] as any[] },
    friendCode: '', showTicketsPopup: false, showRulesPopup: false, isPlayingBGM: false
  },
  innerAudioContext: null as WechatMiniprogram.InnerAudioContext | null,

  onLoad(options: any) {
    if (!options.id) return wx.showToast({ title: '缺少活动参数', icon: 'none' });
    this.setData({ activityId: options.id });
    this.fetchActivityData(options.id);
    this.fetchPrizes(options.id);
    this.fetchUserData(options.id);
  },

  onUnload() { this.innerAudioContext?.destroy(); },
  onHide() { if (this.data.isPlayingBGM) this.innerAudioContext?.pause(); },
  onShow() { if (this.data.isPlayingBGM) this.innerAudioContext?.play(); },

  fetchActivityData(id: string) {
    wx.cloud.database().collection('activities').doc(id).get({
      success: (res) => {
        this.setData({ activityData: res.data, pageBgStyle: res.data.page_bg_image ? `background-image: url("${res.data.page_bg_image}");` : '' });
        if (res.data.bgm_url) this.initBGM(res.data.bgm_url);
      }
    });
  },

  async fetchPrizes(activityId: string) {
    const cacheKey = `${CACHE_KEY_PREFIX}${activityId}`;
    const now = Date.now();
    try {
      const cache = wx.getStorageSync(cacheKey);
      if (cache && (now - cache.timestamp < CACHE_TIME_LIMIT)) {
        this.renderPrizes(cache.data);
        return this.startImagePersistence(cache.data);
      }

      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'getPrizes', activityId } }) as any;
      if (result?.success && result.data?.length > 0) {
        this.renderPrizes(result.data);
        wx.setStorageSync(cacheKey, { timestamp: now, data: result.data });
        this.startImagePersistence(result.data);
      }
    } catch {
      const oldCache = wx.getStorageSync(cacheKey);
      if (oldCache) this.renderPrizes(oldCache.data);
    }
  },

  renderPrizes(prizes: any[]) {
    let base = [...prizes];
    while (base.length > 0 && base.length < 5) base = base.concat(prizes);
    this.setData({ prizes, displayPrizes: [...base, ...base] });
  },

  async startImagePersistence(prizes: any[]) {
    await Promise.all(prizes.map(async (item, index) => {
      if (!item.image) return;
      const localPath = await this.getLocalImagePath(item.image);
      if (localPath && localPath !== item.image) {
        let updateData: any = { [`prizes[${index}].image`]: localPath };
        this.data.displayPrizes.forEach((dp, dpIndex) => {
          if (dp._id === item._id || dp.image === item.image) updateData[`displayPrizes[${dpIndex}].image`] = localPath;
        });
        this.setData(updateData);
      }
    }));
  },

  getLocalImagePath(remoteUrl: string): Promise<string> {
    if (remoteUrl.startsWith('wxfile://')) return Promise.resolve(remoteUrl);
    const fs = wx.getFileSystemManager();
    const localPath = `${wx.env.USER_DATA_PATH}/prize_${remoteUrl.split('/').pop() || Date.now()}`;
    try {
      fs.accessSync(localPath); return Promise.resolve(localPath);
    } catch {
      return new Promise(resolve => wx.downloadFile({
        url: remoteUrl,
        success: (res) => res.statusCode === 200 ? fs.saveFile({ tempFilePath: res.tempFilePath, filePath: localPath, success: () => resolve(localPath), fail: () => resolve(remoteUrl) }) : resolve(remoteUrl),
        fail: () => resolve(remoteUrl)
      }));
    }
  },

  async fetchUserData(activityId: string) {
    try {
      const { data } = await wx.cloud.database().collection('register_students').where({ _openid: '{openid}' }).get();
      if (data.length > 0) {
        const user = data[0];
        let myInviteCode = user.activity_invites?.[activityId] || Math.random().toString(36).substring(2, 8).toUpperCase();
        
        this.setData({
          'userInfo.userId': user._id, 'userInfo.myInviteCode': myInviteCode,
          'userInfo.dailyTaskDone': user.last_lottery_claim_date === new Date(Date.now() + 28800000).toISOString().split('T')[0],
          'userInfo.hasFilledFriendCode': !!user.activity_filled_friend_codes?.[activityId],
          friendCode: user.activity_filled_friend_codes?.[activityId] || ''
        });

        this.fetchMyTickets(activityId);
        if (!user.activity_invites?.[activityId]) wx.cloud.callFunction({ name: 'gameService', data: { action: 'initInviteCode', activityId, inviteCode: myInviteCode } }).catch(() => {});
      }
    } catch {}
  },

  onInputFriendCode(e: any) { this.setData({ friendCode: e.detail.value.trim().toUpperCase() }); },

  async submitFriendCode() {
    const code = this.data.friendCode;
    if (!code) return wx.showToast({ title: '请输入邀请码', icon: 'none' });
    if (this.data.userInfo.hasFilledFriendCode) return;
    if (code === this.data.userInfo.myInviteCode) return wx.showToast({ title: '不能填写自己的邀请码哦', icon: 'none' });

    try {
      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'submitFriendCode', activityId: this.data.activityId, friendCode: code } }) as any;
      if (result.success) {
        wx.showToast({ title: '兑换成功', icon: 'none' });
        this.setData({ 'userInfo.hasFilledFriendCode': true });
        this.fetchMyTickets(this.data.activityId);
      } else {
        wx.showToast({ title: result.msg || '兑换失败', icon: 'none' });
      }
    } catch { wx.showToast({ title: '网络异常，请重试', icon: 'none' }); }
  },

  async claimDailyTicket() {
    if (this.data.userInfo.dailyTaskDone) return;
    try {
      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'claimDaily', activityId: this.data.activityId } }) as any;
      if (result.success || result.msg?.includes('已经领取过')) {
        this.setData({ 'userInfo.dailyTaskDone': true });
        this.fetchMyTickets(this.data.activityId);
        if (!result.success) wx.showToast({ title: result.msg, icon: 'none' });
      } else {
        wx.showToast({ title: result.msg || '领取失败', icon: 'none' });
      }
    } catch { wx.showToast({ title: '网络异常，请重试', icon: 'none' }); }
  },

  fetchMyTickets(activityId: string) {
    wx.cloud.database().collection('lottery_tickets').where({ _openid: '{openid}', activity_id: activityId }).get({
      success: (res) => this.setData({ 'userInfo.tickets': res.data })
    });
  },

  initBGM(url: string) {
    this.innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext.src = url;
    this.innerAudioContext.loop = true;
    this.innerAudioContext.play();
    this.setData({ isPlayingBGM: true });
  },

  toggleBGM() {
    if (!this.innerAudioContext) return;
    this.data.isPlayingBGM ? this.innerAudioContext.pause() : this.innerAudioContext.play();
    this.setData({ isPlayingBGM: !this.data.isPlayingBGM });
  },

  copyMyCode() {
    if (!this.data.userInfo.myInviteCode) return;
    wx.setClipboardData({ data: this.data.userInfo.myInviteCode, success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' }) });
  },

  preventTouchMove() {},
  openTicketsPopup() { this.setData({ showTicketsPopup: true }); }, closeTicketsPopup() { this.setData({ showTicketsPopup: false }); },
  openRulesPopup() { this.setData({ showRulesPopup: true }); }, closeRulesPopup() { this.setData({ showRulesPopup: false }); },

  onShareAppMessage() {
    return { title: '快来参加青笺校园日记的抽奖，填我的邀请码拿奖励！', path: `/pages/sandbox/splash/splash?target=lottery&id=${this.data.activityId}`, imageUrl: '' };
  }
});