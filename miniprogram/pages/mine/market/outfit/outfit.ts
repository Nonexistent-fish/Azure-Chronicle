export {};
const db = wx.cloud.database();
const _ = db.command;

let CACHED_MALL_DATA: any = null;
let LAST_FETCH_TIME = 0;
const CACHE_EXPIRE = 600000; 
let GLOBAL_IMAGE_CACHE: Record<string, string> = {};

const getRealShadow = (preset: string, custom: string) => preset === 'custom' && custom ? `drop-shadow(${custom})` : ({ normal: 'drop-shadow(0 4rpx 10rpx rgba(0,0,0,0.3))', gold: 'drop-shadow(0 0 18rpx rgba(255,215,0,0.8))', purple: 'drop-shadow(0 0 20rpx rgba(138,43,226,0.8))', pink: 'drop-shadow(0 0 20rpx rgba(255,105,180,0.8))' }[preset || 'none'] || '');
const getSafeValue = (f: any) => (Array.isArray(f) ? f[0] : f) || '';

Page<any, any>({
  data: {
    currentTabIndex: 0, filterType: 'all', rawBgList: [], rawFrameList: [], displayBgList: [], displayFrameList: [],
    userInfo: null, showDetail: false, currentDetail: null as any, isLoading: false
  },

  onShow() { this.refreshUserData(); },
  switchTab(e: any) { this.setData({ currentTabIndex: parseInt(e.currentTarget.dataset.index) }); },
  onSwiperChange(e: any) { this.setData({ currentTabIndex: e.detail.current }); },
  setFilter(e: any) { this.setData({ filterType: e.currentTarget.dataset.type }, () => this.processAndFilterData()); },
  doNothing() {},

  refreshUserData() {
    const user = wx.getStorageSync('currentUser');
    if (user) {
      user.ownedSkins = user.ownedSkins || [];
      this.setData({ userInfo: user });
      if (!CACHED_MALL_DATA || (Date.now() - LAST_FETCH_TIME > CACHE_EXPIRE)) this.fetchMallData();
      else this.setData({ rawBgList: CACHED_MALL_DATA.bg, rawFrameList: CACHED_MALL_DATA.frame }, () => { this.processAndFilterData(); this.startCachingImages(CACHED_MALL_DATA.bg, CACHED_MALL_DATA.frame); });
    }
  },

  async fetchMallData() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true }); wx.showNavigationBarLoading();
    try {
      const { data } = await db.collection('dressup_templates').where({ type: _.in(['bg', 'frame']), displayLocation: 'mall' }).orderBy('sort', 'desc').get();
      const bgList = data.filter((i: any) => i.type === 'bg');
      const frameList = data.filter((i: any) => i.type === 'frame').map((item: any) => ({ ...item, realShadow: getRealShadow(item.shadowPreset, item.shadowCustom), realSizeLevel: item.frameSizeLevel || 'normal' }));
      CACHED_MALL_DATA = { bg: bgList, frame: frameList }; LAST_FETCH_TIME = Date.now();
      this.setData({ rawBgList: bgList, rawFrameList: frameList }, () => { this.processAndFilterData(); this.startCachingImages(bgList, frameList); });
    } catch {} finally { this.setData({ isLoading: false }); wx.hideNavigationBarLoading(); }
  },

  startCachingImages(bgList: any[], frameList: any[]) {
    const urls = new Set<string>();
    bgList.forEach(i => { const l = getSafeValue(i.bgUrlLarge), s = getSafeValue(i.bgUrlSmall); if (l && !GLOBAL_IMAGE_CACHE[l]) urls.add(l); if (s && !GLOBAL_IMAGE_CACHE[s]) urls.add(s); });
    frameList.forEach(i => { const f = getSafeValue(i.avatarFrameUrl); if (f && !GLOBAL_IMAGE_CACHE[f]) urls.add(f); });
    if (!urls.size) return;

    let timer: any = null;
    urls.forEach(url => {
      const ok = (res: any) => { if (res.statusCode === 200) { GLOBAL_IMAGE_CACHE[url] = res.tempFilePath; if (timer) clearTimeout(timer); timer = setTimeout(() => this.processAndFilterData(), 100); } };
      url.startsWith('cloud://') ? wx.cloud.downloadFile({ fileID: url, success: ok }) : wx.downloadFile({ url, success: ok });
    });
  },

  processAndFilterData() {
    const { rawBgList, rawFrameList, userInfo, filterType, currentDetail } = this.data;
    const { ownedSkins = [], achievements = [] } = userInfo;
    const now = Date.now();
    
    const applyCache = (url: string, id: string) => {
      if (!url || url.startsWith('wxfile://') || url.startsWith('http://tmp/') || url.startsWith('cloud://')) return url;
      const k = `outfit_img_v_${id}`; let t = wx.getStorageSync(k) || 0;
      if (now - t > 604800000) { t = now; wx.setStorageSync(k, t); }
      return `${url}${url.includes('?') ? '&' : '?'}v=${t}`;
    };

    const mapList = (list: any[], type: string) => list.map(item => {
      if ((item.saleStartTime && now < item.saleStartTime) || (item.saleEndTime && now > item.saleEndTime)) return null;
      
      const isOwned = item.displayLocation === 'default' ? true : (item.authLogic === 'achievement' ? achievements.some((a: any) => a.id === item.authCondition) : ownedSkins.some((s: any) => typeof s === 'string' ? s === item._id : s.templateId === item._id && (s.expireTime === -1 || s.expireTime > now)));
      
      item.price = item.exchangeCosts?.[0]?.amount || (typeof item.price === 'number' && item.price > 0 ? item.price : 0);
      item.priceUnitDisplay = item.exchangeCosts?.[0] ? (item.exchangeCosts[0].id === 'points' ? '积分' : (item.exchangeCosts[0].id === 'cherry_fragment' ? '碎片' : '道具')) : (item.price > 0 ? '积分' : '免费');

      let isEquipped = false;
      if (type === 'bg') {
        isEquipped = !!userInfo.cardBgUrl && userInfo.cardBgUrl === getSafeValue(item.bgUrlLarge);
        item._displayBgUrlLarge = applyCache(GLOBAL_IMAGE_CACHE[getSafeValue(item.bgUrlLarge)] || getSafeValue(item.bgUrlLarge), item._id);
      } else {
        isEquipped = !!userInfo.avatarFrameUrl && userInfo.avatarFrameUrl === getSafeValue(item.avatarFrameUrl);
        item._displayAvatarFrameUrl = applyCache(GLOBAL_IMAGE_CACHE[getSafeValue(item.avatarFrameUrl)] || getSafeValue(item.avatarFrameUrl), item._id);
      }
      return { ...item, isOwned, isEquipped };
    }).filter(Boolean);

    const fBg = mapList(rawBgList, 'bg'), fFrame = mapList(rawFrameList, 'frame');
    const filterFn = (i: any) => filterType === 'owned' ? i.isOwned : (filterType === 'unowned' ? !i.isOwned : true);
    
    this.setData({ displayBgList: fBg.filter(filterFn), displayFrameList: fFrame.filter(filterFn) });
    if (this.data.showDetail && currentDetail) this.setData({ currentDetail: [...fBg, ...fFrame].find(i => i._id === currentDetail._id) || currentDetail });
  },

  openDetail(e: any) { this.setData({ currentDetail: e.currentTarget.dataset.item, showDetail: true }); },
  closeDetail() { this.setData({ showDetail: false }); setTimeout(() => this.setData({ currentDetail: null }), 300); },

  async callUpdateUserProfile(data: object) {
    if (!this.data.userInfo?._id) return false;
    try { const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'updateUserProfile', userId: this.data.userInfo._id, updateData: data } }) as any; return result?.success; } catch { return false; }
  },

  async quickClaim(e: any) {
    if (this.data.isLoading) return;
    const item = e.currentTarget.dataset.item || e.detail;
    let { userInfo } = this.data;
    const now = Date.now();

    if ((userInfo.ownedSkins || []).some((s: any) => s.templateId === item._id && (s.expireTime === -1 || s.expireTime > now)) || item.displayLocation === 'default') return wx.showToast({ title: '您已拥有该装扮', icon: 'none' });
    if (item.authLogic === 'achievement') return wx.showToast({ title: '需达成特定成就解锁', icon: 'none' });
    if (item.uiTag === 'rare') return wx.showToast({ title: '该装扮已绝版', icon: 'none' });
    if (item.uiTag === 'event') return wx.showToast({ title: '请参与活动获取', icon: 'none' });

    const cost = item.exchangeCosts?.[0]?.amount || 0, cType = item.exchangeCosts?.[0]?.id || '';
    if (cost > 0) {
      if (cType === 'points' && (userInfo.points || 0) < cost) return wx.showToast({ title: `余额不足，至少需要 ${cost} 积分`, icon: 'none' });
      const { confirm } = await wx.showModal({ title: '确定兑换吗？', content: `将消耗 ${cost} ${item.priceUnitDisplay}`, confirmColor: '#8A181A' });
      if (!confirm) return;
    }

    this.setData({ isLoading: true }); wx.showLoading({ title: '正在收录...', mask: true });
    try {
      const days = item.validityDays || -1;
      let updateData: any = { ownedSkins: [...(userInfo.ownedSkins || []).filter((s: any) => s.templateId !== item._id), { templateId: item._id, obtainTime: now, expireTime: days > 0 ? now + days * 86400000 : -1, obtainWay: "exchange" }] };
      if (cost > 0 && cType === 'points') updateData.points = (userInfo.points || 0) - cost;

      if (!(await this.callUpdateUserProfile(updateData))) throw new Error('云端更新失败');
      wx.setStorageSync('currentUser', { ...userInfo, ...updateData }); LAST_FETCH_TIME = 0;
      this.setData({ userInfo: { ...userInfo, ...updateData }, isLoading: false }, () => this.processAndFilterData());
      wx.hideLoading(); wx.showToast({ title: days > 0 ? `兑换成功 (有效期${days}天)` : '永久兑换成功', icon: 'success' });
    } catch { this.setData({ isLoading: false }); wx.hideLoading(); wx.showToast({ title: '交易失败，请重试', icon: 'none' }); }
  },

  async quickEquip(e: any) {
    const item = e.currentTarget.dataset.item || e.detail;
    let updateData: any = item.type === 'bg' ? { cardBgUrl: getSafeValue(item.bgUrlLarge), miniCardBgUrl: getSafeValue(item.bgUrlSmall), cardTheme: String(getSafeValue(item.text_theme_enum) || 'light').toLowerCase().trim() } : { avatarFrameUrl: getSafeValue(item.avatarFrameUrl), avatarFrameShadow: item.realShadow || '', avatarFrameSizeLevel: item.realSizeLevel || 'normal' };
    try {
      if (!(await this.callUpdateUserProfile(updateData))) throw new Error('同步失败');
      wx.setStorageSync('currentUser', { ...this.data.userInfo, ...updateData });
      wx.showToast({ title: '已装备', icon: 'success' }); this.refreshUserData();
    } catch { wx.showToast({ title: '装备失败', icon: 'none' }); }
  }
});