export {};
const app = getApp<any>();

const getLocalIcon = (name: string, defaultUrl: string) => name?.includes('积分') ? '/assets/icons/积分.jpg' : (defaultUrl || '');

Page<any, any>({
  data: {
    statusBarHeight: 20, navBarHeight: 44, isLoading: true, activityId: '', fragmentId: '', 
    poolInfo: { title: '载入中...', subtitle: '...', bgUrl: '' }, featuredItems: [] as any[], exchangeItems: [] as any[],
    currentIndex: 0, textVisible: true, isDrawing: false, isClaiming: false, showLore: false, isAnimating: false, 
    hasSecondScreen: true, drawCount: 1, totalDraws: 0, maxMilestone: 30, userFragments: 0, userPoints: 0, milestones: [] as any[],
    showResultModal: false, drawResults: [] as any[]
  },
  timer: null as any, bgmContext: null as any, 

  onLoad(options: any) {
    const { statusBarHeight } = wx.getSystemInfoSync();
    const { top, height } = wx.getMenuButtonBoundingClientRect();
    this.setData({ statusBarHeight, navBarHeight: (top - statusBarHeight) * 2 + height, activityId: options.id || options.activityId || '6ded7a7769eb79350073a2e224664cfa' });
    this.initLottoPool(this.data.activityId);
  },
  onShow() { if (this.data.featuredItems.length) this.startAutoPlay(); this.bgmContext?.play(); },
  onHide() { this.stopAutoPlay(); this.bgmContext?.pause(); },
  onUnload() { this.stopAutoPlay(); if (this.bgmContext) { this.bgmContext.stop(); this.bgmContext.destroy(); this.bgmContext = null; } },

  async initLottoPool(activityId: string) {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'getGachaConfig', activityId } }) as any;
      if (result?.code === 0) {
        const { poolInfo, fragmentId, maxMilestone, milestones, featuredItems, exchangeItems, userAssets } = result.data;
        this.setData({
          poolInfo, fragmentId, maxMilestone, milestones,
          featuredItems: (featuredItems || []).map((i: any) => ({ ...i, imageUrl: getLocalIcon(i.name, i.imageUrl) })),
          exchangeItems: (exchangeItems || []).map((i: any) => ({ ...i, imageUrl: getLocalIcon(i.name, i.imageUrl) })),
          userFragments: userAssets.fragments, totalDraws: userAssets.draws, userPoints: userAssets.points || 0,
          hasSecondScreen: !!(milestones?.length || exchangeItems?.length)
        });
        if (poolInfo.bgmUrl) this.initBGM(poolInfo.bgmUrl);
        this.startAutoPlay();
      } else wx.showToast({ title: result?.msg || '活动异常', icon: 'none' });
    } catch { wx.showToast({ title: '网络波动，请重试', icon: 'none' }); }
    finally { this.setData({ isLoading: false }); }
  },

  async onClaimMilestone(e: any) {
    if (this.data.isClaiming || this.data.isDrawing) return;
    const index = e.currentTarget.dataset.index;
    const ms = this.data.milestones[index];
    if (this.data.totalDraws < ms.target) return wx.vibrateShort({ type: 'light' }), wx.showToast({ title: `需达到 ${ms.target} 次抽卡`, icon: 'none' });
    if (ms.claimed) return wx.showToast({ title: '奖励已领取', icon: 'none' });

    this.setData({ isClaiming: true }); wx.showLoading({ title: '领取中...', mask: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'claimMilestone', activityId: this.data.activityId, milestoneIndex: index, target: ms.target } }) as any;
      if (result?.code === 0) {
        wx.hideLoading(); wx.vibrateShort({ type: 'medium' });
        this.setData({ [`milestones[${index}].claimed`]: true });
        wx.showModal({ title: '领取成功', content: '恭喜获得里程碑奖励！', showCancel: false, confirmColor: '#D4AF37' });
      } else wx.showToast({ title: result?.msg || '领取失败', icon: 'none' });
    } catch { wx.showToast({ title: '网络繁忙', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ isClaiming: false }); }
  },

  initBGM(url: string) {
    if (!url) return;
    this.bgmContext = wx.createInnerAudioContext();
    this.bgmContext.src = url; this.bgmContext.loop = true; this.bgmContext.autoplay = true; this.bgmContext.volume = 0.5;
  },
  startAutoPlay() {
    if (this.data.featuredItems.length <= 1) return;
    this.stopAutoPlay();
    this.timer = setInterval(() => {
      if (this.data.showLore) return;
      this.setData({ textVisible: false });
      setTimeout(() => {
        this.setData({ currentIndex: (this.data.currentIndex + 1) % this.data.featuredItems.length });
        setTimeout(() => this.setData({ textVisible: true }), 1000);
      }, 600);
    }, 5500);
  },
  stopAutoPlay() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  toggleLore() { this.setData({ showLore: !this.data.showLore }); this.data.showLore ? this.stopAutoPlay() : this.startAutoPlay(); },
  handleGlobalTap() { if (this.data.showLore) { this.setData({ showLore: false }); this.startAutoPlay(); } },

  goBack() { getCurrentPages().length > 1 ? wx.navigateBack({ delta: 1 }) : wx.reLaunch({ url: '/pages/mine/market/market' }); },

  async doDraw(e: any) {
    this.handleGlobalTap();
    if (this.data.isDrawing) return;
    const count = parseInt(e.currentTarget.dataset.count || e.target.dataset.count) || 1;
    const user = wx.getStorageSync('currentUser');
    const pts = user ? (user.points || 0) : this.data.userPoints;
    const reqPts = count === 5 ? 45 : 10;

    if (pts < reqPts) return wx.showModal({ title: '提示', content: `积分不足，祈愿${count}次需要 ${reqPts} 积分。\n(当前仅有: ${pts} 积分)`, showCancel: false, confirmColor: '#D4AF37' });
    
    this.setData({ isDrawing: true, isAnimating: true, drawCount: count });
    try {
      const [res] = await Promise.all([
        wx.cloud.callFunction({ name: 'gameService', data: { action: 'gachaDraw', activityId: this.data.activityId, count } }),
        new Promise(r => setTimeout(r, 2800))
      ]);
      const result = (res as any).result;

      if (result?.code === 0) {
        const finalPts = result.data.newPoints ?? (pts - reqPts);
        if (user) { user.points = finalPts; wx.setStorageSync('currentUser', user); }
        this.setData({ totalDraws: result.data.newTotalDraws, userFragments: result.data.newFragments, userPoints: finalPts, isAnimating: false, showResultModal: true, drawResults: (result.data.rewards || []).map((r: any) => ({ ...r, image: getLocalIcon(r.name, r.image) })) });
      } else {
        this.setData({ isAnimating: false }); wx.showToast({ title: result?.msg || '祈愿失败', icon: 'none' });
      }
    } catch { this.setData({ isAnimating: false }); wx.showToast({ title: '系统错误', icon: 'none' }); }
    finally { this.setData({ isDrawing: false }); }
  },

  closeResultModal() { this.setData({ showResultModal: false, drawResults: [] }); this.startAutoPlay(); },

  async handleExchange(e: any) {
    if (this.data.isDrawing) return;
    const id = e.currentTarget.dataset.id;
    const item = this.data.exchangeItems.find((i: any) => i._id === id);
    if (!item) return;
    if (this.data.userFragments < item.cost) return wx.showToast({ title: '碎片不足', icon: 'none' });

    const { confirm } = await wx.showModal({ title: '凝练确认', content: `确定消耗 ${item.cost} 碎片凝练【${item.name}】吗？`, confirmColor: '#D4AF37' });
    if (confirm) {
      try {
        const { result } = await wx.cloud.callFunction({ name: 'gameService', data: { action: 'gachaExchange', prizeId: id, activityId: this.data.activityId } }) as any;
        if (result?.code === 0) { this.setData({ userFragments: result.data.newFragments }); wx.showToast({ title: '凝练成功', icon: 'success' }); }
        else wx.showToast({ title: result?.msg || '凝练失败', icon: 'none' });
      } catch { wx.showToast({ title: '网络波动', icon: 'none' }); }
    }
  }
});