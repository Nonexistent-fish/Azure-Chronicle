export {};
const db = wx.cloud.database();

Page<any, any>({
  data: {
    hitokoto: { text: '正在加载...', from: '青笺', fromWho: '系统' },
    authSvgUrl: '', showAuthCard: true, 
    categories: [
      {
        title: '互动教学', dividerColor: 'linear-gradient(90deg, #3B82F6, #93C5FD)', 
        tools: [{ name: '传动速算', desc: '齿轮参数换算', path: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z', color: '#3B82F6', url: '/pages/mine/tools/gear/gear', svgUrl: '' }]
      },
      {
        title: '实用工具', dividerColor: 'linear-gradient(90deg, #10B981, #6EE7B7)', 
        tools: [
          { name: '单位转换', desc: '工程常用换算', path: 'M8 4L4 8l4 4 M4 8h16 M16 20l4-4-4-4 M20 16H4', color: '#10B981', url: '/pages/mine/tools/conversion/conversion', svgUrl: '' },
          { name: 'DDL倒计时', desc: '管理重要节点', path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: '#F59E0B', url: '/pages/mine/tools/countdown/countdown', svgUrl: '' }
        ]
      },
      {
        title: '休闲摸鱼', dividerColor: 'linear-gradient(90deg, #8B5CF6, #C4B5FD)', 
        tools: [
          { name: '极限反应', desc: '测测手速', path: 'M13 10V3L4 14h7v7l9-11h-7z', color: '#8B5CF6', url: '/pages/mine/tools/reaction/reaction', svgUrl: '' },
          { name: '随机数', desc: '公平抽取', path: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 11-14 0 7 7 0 0114 0z', color: '#14B8A6', url: '/pages/mine/tools/random/random', svgUrl: '' },
          { name: '多面骰子', desc: '物理模拟', path: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12', color: '#EC4899', url: '/pages/mine/tools/dice/dice', svgUrl: '' }
        ]
      }
    ]
  },

  onLoad() { this.initSvgIcons(); this.fetchHitokoto(); },
  onShow() { this.checkAuthVisibility(); },

  checkAuthVisibility() {
    const user = wx.getStorageSync('currentUser');
    this.setData({ showAuthCard: !user || ![1, 3].includes(Number(user.registerStatus)) });
  },

  initSvgIcons() {
    const genSvg = (path: string, color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`)}`;
    this.setData({
      categories: this.data.categories.map((c: any) => ({ ...c, tools: c.tools.map((t: any) => ({ ...t, svgUrl: genSvg(t.path, t.color) })) })),
      authSvgUrl: genSvg('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', '#EF4444')
    });
  },

  async fetchHitokoto() {
    const d = new Date(Date.now() + 8 * 3600000);
    const todayStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    if (wx.getStorageSync('localHitokotoDate') === todayStr && wx.getStorageSync('localHitokotoData')) return this.setData({ hitokoto: wx.getStorageSync('localHitokotoData') });

    try {
      const { data } = await db.collection('app_config').limit(1).get();
      if (data?.length && data[0].sentence) {
        const newHitokoto = { text: data[0].sentence.text || '星光不问赶路人，岁月不负有心人。', from: data[0].sentence.from || '青笺', fromWho: data[0].sentence.fromWho || '' };
        this.setData({ hitokoto: newHitokoto });
        wx.setStorageSync('localHitokotoDate', todayStr); wx.setStorageSync('localHitokotoData', newHitokoto);
      } else throw new Error();
    } catch {
      this.setData({ hitokoto: { text: '星光不问赶路人，岁月不负有心人。', from: '青笺的校园日记', fromWho: '' } });
    }
  },

  async onToolClick(e: any) {
    const targetUrl = e.currentTarget.dataset.url;
    if (!targetUrl) return;

    if (targetUrl === 'dev') return wx.vibrateShort({ type: 'light' }), wx.showToast({ title: '敬请期待', icon: 'none' });

    if (targetUrl === '/pages/mine/tools/auth/auth') {
      wx.vibrateShort({ type: 'medium' }); wx.showLoading({ title: '核验权限...' });
      try {
        const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'checkUserStatus' } }) as any;
        wx.hideLoading();
        if (result?.exists && result?.userData) {
          wx.setStorageSync('currentUser', result.userData);
          if ([1, 3].includes(Number(result.userData.registerStatus))) {
            this.setData({ showAuthCard: false });
            return wx.showModal({ title: '认证已通过', content: '您已是正式校内用户，无需重复认证。', confirmText: '回广场', cancelText: '留在这里', success: (m) => m.confirm && wx.switchTab({ url: '/pages/index/index' }) });
          }
        }
        wx.navigateTo({ url: targetUrl });
      } catch { wx.hideLoading(); wx.navigateTo({ url: targetUrl }); }
      return;
    }
    wx.navigateTo({ url: targetUrl });
  }
});