export {};
import { xpToLevel } from '../../utils/levelUtils';

const app = getApp<any>(); 
const db = wx.cloud.database();
const _ = db.command; 

const LEVEL_CONFIG = [
  { level: 1, title: '校园萌新', color: '#999999' }, { level: 2, title: '潜水观察员', color: '#52c41a' }, { level: 3, title: '活跃分子', color: '#1890ff' },
  { level: 4, title: '铁杆校友', color: '#2f54eb' }, { level: 5, title: '社交达人', color: '#722ed1' }, { level: 6, title: '话题制造机', color: '#eb2f96' },
  { level: 7, title: '风云人物', color: '#fa8c16' }, { level: 8, title: '校园百事通', color: '#f5222d' }, { level: 9, title: '镇站之宝', color: '#d48806' }, { level: 10, title: '校园传说', color: '#ff0000' }
];

const FORBIDDEN_WORDS = ['青笺集', '青笺拾光', '青笺校园','青笺校园日记'];//可自行添加昵称屏蔽词
let GLOBAL_IMAGE_CACHE: Record<string, string> = {};

const SHADOW_DICT: Record<string, string> = {
  'none': '', 'normal': 'drop-shadow(0 2rpx 4rpx rgba(0,0,0,0.3))', 'gold': 'drop-shadow(0 0 18rpx rgba(255,215,0,0.8))', 'purple': 'drop-shadow(0 0 20rpx rgba(138,43,226,0.8))', 'pink': 'drop-shadow(0 0 20rpx rgba(255,105,180,0.8))'
};

const getRealShadow = (presetVal: string, customVal: string) => presetVal === 'custom' && customVal ? `drop-shadow(${customVal})` : (SHADOW_DICT[presetVal || 'none'] || '');

Page<any, any>({
  data: {
    navBarHeight: 44, statusBarHeight: 20, totalNavHeight: 64, menuButtonTop: 26, menuButtonHeight: 32,
    isLoading: true, isRegistered: false, userInfo: null as any, hasUnreadMail: false, 
    levelInfo: null as any, xpPercent: 0, xpBarStyle: '', levelDataList: [] as any[], currentLevelProgress: 0,
    notice: null as any,
    levelRules: { 2: '上传文字上限提升至 200字', 3: '信箱容量提升至 25封', 4: '上传文字上限提升至 250字', 5: '信箱容量提升至 30封', 6: '上传文字上限提升至 300字' } as Record<number, string>,
    isFlipped: false, showDressUpDrawer: false, showLevelDrawer: false, currentTabIndex: 0, bgSkins: [] as any[], frameSkins: [] as any[],
    isSuperAdmin: false, editState: { nickName: false, bio: false }, _lastLoginCheckTime: 0
  },

  onLoad() { this.calcNavBarInfo(); },

  onShow() {
    this.updateTabBarStatus();
    
    const localUser = wx.getStorageSync('currentUser');
    if (localUser) {
      this.renderUserData(localUser);
      this.setData({ isLoading: false, isRegistered: true, userInfo: localUser, isSuperAdmin: wx.getStorageSync('isSuperAdmin') || false });
    }
    
    this.fetchNotice(); 
    if (localUser) this.checkUnreadMail(); 

    const now = Date.now();
    if (now - this.data._lastLoginCheckTime > 60000) { this.checkLoginStatus(); this.data._lastLoginCheckTime = now; }
  },

  async fetchNotice() {
    const cache = wx.getStorageSync('notice_cache');
    if (cache && (Date.now() - cache.time < 21600000)) return this.setData({ notice: cache.data });
    try {
      const { data } = await db.collection('home_notices').where({ isActive: true }).orderBy('createTime', 'desc').limit(1).get();
      this.setData({ notice: data[0] || null });
      wx.setStorageSync('notice_cache', { data: data[0] || null, time: Date.now() });
    } catch {}
  },

  calcNavBarInfo() {
    const { statusBarHeight } = wx.getWindowInfo(); 
    const { top, height } = wx.getMenuButtonBoundingClientRect();
    const navContentHeight = (top - statusBarHeight) * 2 + height;
    this.setData({ statusBarHeight, navBarHeight: navContentHeight, totalNavHeight: statusBarHeight + navContentHeight, menuButtonTop: top, menuButtonHeight: height });
  },

  onFlipStateSync() { wx.vibrateShort({ type: 'light' }); this.selectComponent('.fortune-full')?.commitDraw(); },

  goToFeedback() { wx.navigateTo({ url: '/pages/mine/feedback/feedback' }); },
  goToMyPosts() { wx.navigateTo({ url: '/pages/mine/my-posts/my-posts' }); },
  goToMyFavorites() { wx.navigateTo({ url: '/pages/my-favorites/my-favorites' }); },
  goToMarket() { wx.navigateTo({ url: '/pages/mine/market/outfit/outfit' }); },
  goToTools(){ wx.navigateTo({ url: '/pages/mine/tools/tools' }); },
  goToTestWorkbench() { 
    if (!this.data.isSuperAdmin) return wx.showToast({ title: '无权访问', icon: 'error' });
    wx.navigateTo({ url: '/packageAdmin/test/test' }); 
  },
  
  goToMailbox(){
    wx.navigateTo({url:'/pages/mine/mailbox/mailbox'});
    const currentUser=wx.getStorageSync('currentUser');
    if(!currentUser||!currentUser._id)return;
    currentUser.lastMailboxVisit=Date.now();
    wx.setStorageSync('currentUser',currentUser);
    this.setData({hasUnreadMail:false});
    const tabBar:any=this.getTabBar();
    if(tabBar)tabBar.setData({showRedDot:false});
    wx.cloud.callFunction({name:'userService',data:{action:'updateMailboxTime',userId:currentUser._id}}).catch(()=>{});
    },
  
  updateTabBarStatus() {
    const tabBar: any = this.getTabBar();
    if (tabBar) { tabBar.setData({ selected: 2, isShow: true }); }
  },

  async checkUnreadMail() {
    const user = this.data.userInfo || wx.getStorageSync('currentUser');
    if (!user) return;
    const myOpenId = wx.getStorageSync('realOpenID') || user._openid;
    if (!myOpenId) return;
  
    const lastVisit = wx.getStorageSync('last_mailbox_visit') || user.lastMailboxVisit || 0;
    const COOLDOWN_MS = 10 * 1000; // 10 秒内刚看过信箱，直接“无新邮件”
  
    if (Date.now() - lastVisit < COOLDOWN_MS) {
      this.setData({ hasUnreadMail: false });
      this.getTabBar()?.setData({ showRedDot: false });
      return;
    }
  
    const lastVisitDate = new Date(lastVisit - 5000); 
  
    try {
      const safeCount = (p: Promise<any>) => p.catch(() => ({ total: 0 }));
      const [notif, feedback, ex] = await Promise.all([
        safeCount(db.collection('user_notifications')
          .where(_.and([
            _.or([{ _openid: myOpenId }, { targetOpenId: myOpenId }]),
            { isRead: false },
            { isDeleted: false }
          ]))
          .count()),
        safeCount(db.collection('feedback_reports')
          .where({ _openid: myOpenId, isRead: false })
          .count()),
        safeCount(db.collection('contact_exchanges')
          .where({ to_openid: myOpenId, status: 0, createTime: _.gt(lastVisitDate) })
          .count())
      ]);
      const hasNew = (notif.total || 0) + (feedback.total || 0) + (ex.total || 0) > 0;
      this.setData({ hasUnreadMail: hasNew });
      this.getTabBar()?.setData({ showRedDot: hasNew });
    } catch {
    }
  },

  renderUserData(userData: any) {
    const currentXp = userData.xp || 0;
    const levelInfo = xpToLevel(currentXp);
    const xpLevels = [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    let floor = xpLevels[levelInfo.level - 1] || 0; 
    let ceil = xpLevels[levelInfo.level] || floor; 
    let pct = levelInfo.level < 10 ? Math.max(0, Math.min(100, Math.floor(((currentXp - floor) / (ceil - floor)) * 100))) : 100;
    this.setData({ levelInfo, xpPercent: pct, currentLevelProgress: pct, xpBarStyle: `width: ${pct}%; background-color: ${levelInfo.color || '#1890ff'};`, levelDataList: LEVEL_CONFIG.map(c => ({ ...c, status: c.level < levelInfo.level ? 'passed' : (c.level === levelInfo.level ? 'current' : 'future'), isUnlocked: c.level <= levelInfo.level })) });
  },

  checkLoginStatus() {
    const current = wx.getStorageSync('currentUser');
    wx.cloud.callFunction({
      name: 'userService', data: { action: 'checkUserStatus', userId: current?._id },
      success: (res: any) => {
        const { exists, userData, openid, isSuperAdmin } = res.result;
        if (exists && userData) { wx.setStorageSync('currentUser', userData); wx.setStorageSync('realOpenID', openid); wx.setStorageSync('isSuperAdmin', isSuperAdmin); this.renderUserData(userData); }
        this.setData({ isLoading: false, isRegistered: exists, userInfo: userData || null, isSuperAdmin });
      },
      fail: () => this.setData({ isLoading: false })
    });
  },

  async updateUserProfile(data: object) {
    if (!this.data.userInfo?._id) return false;
    try {
      const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'updateUserProfile', userId: this.data.userInfo._id, updateData: data } }) as any;
      if (result?.success) {
        const newUser = { ...this.data.userInfo, ...data };
        wx.setStorageSync('currentUser', newUser); this.setData({ userInfo: newUser }); return true;
      }
      wx.showToast({ title: result?.msg || '同步失败', icon: 'none' }); return false;
    } catch { wx.showToast({ title: '网络错误', icon: 'none' }); return false; }
  },

  async onChangeGender() {
    if (!this.data.userInfo) return;
    let nextGender = (Number(this.data.userInfo.gender || 0) + 1) % 3;
    this.setData({ ['userInfo.gender']: nextGender });
    await this.updateUserProfile({ gender: nextGender });
  },

  openLevelDrawer() { this.setData({ showLevelDrawer: true }); }, closeLevelDrawer() { this.setData({ showLevelDrawer: false }); },
  startEditName() { this.setData({ 'editState.nickName': true }); },
  startEditBio() { this.setData({ 'editState.bio': true }); },

  async onUpdateNickName(e: any) { 
    this.setData({ 'editState.nickName': false });
    const newName = e.detail.value.trim(); const oldName = this.data.userInfo.nickName || '';
    if (newName === oldName) return; 
    if (newName.length < 3) return this.setData({ 'userInfo.nickName': oldName }), wx.showToast({ title: '最少3个字', icon: 'none' });
    this.setData({ 'userInfo.nickName': newName });
    if (FORBIDDEN_WORDS.some(w => newName.includes(w))) return this.setData({ 'userInfo.nickName': oldName }), wx.showToast({ title: '包含敏感词，已重置', icon: 'none' });
    
    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: newName } });
      if (textCheck.result?.isRisky) return this.setData({ 'userInfo.nickName': oldName }), wx.showToast({ title: '昵称违规，已重置', icon: 'none' }); 
      if (!(await this.updateUserProfile({ nickName: newName }))) this.setData({ 'userInfo.nickName': oldName }); 
    } catch { this.setData({ 'userInfo.nickName': oldName }); }
  },

  async onUpdateBio(e: any) { 
    this.setData({ 'editState.bio': false });
    const newBio = e.detail.value.trim(); const oldBio = this.data.userInfo.bio || ''; 
    if (newBio === oldBio) return;
    this.setData({ 'userInfo.bio': newBio });
    if (newBio === '') return this.updateUserProfile({ bio: '' }); 
    if (FORBIDDEN_WORDS.some(w => newBio.includes(w))) return this.setData({ 'userInfo.bio': oldBio }), wx.showToast({ title: '包含违禁词', icon: 'none', duration: 2000 });
    
    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: newBio } });
      if (textCheck.result?.isRisky) return this.setData({ 'userInfo.bio': oldBio }), wx.showToast({ title: '签名违规', icon: 'none', duration: 2500 });
      this.updateUserProfile({ bio: newBio });
    } catch { this.setData({ 'userInfo.bio': oldBio }); }
  },

  async onUpdateAvatar(e: any) {
    const { avatarUrl } = e.detail; 
    wx.showToast({ title: '处理中...', icon: 'loading', duration: 10000 });
    try {
      const { tempFilePath } = await wx.compressImage({ src: avatarUrl, quality: 60 });
      const fs = wx.getFileSystemManager();
      let buffer: ArrayBuffer;
      try { buffer = fs.readFileSync(tempFilePath) as ArrayBuffer; } catch { return this.uploadOriginalAvatar(avatarUrl); }
      
      const checkRes: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', buffer } });
      if (checkRes.result?.isRisky) return wx.hideToast(), wx.showToast({ title: '图片违规', icon: 'none' });
      
      const { fileID } = await wx.cloud.uploadFile({ cloudPath: `avatars/${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`, filePath: tempFilePath });
      if (await this.updateUserProfile({ weiXinAvatar: fileID })) wx.showToast({ title: '头像更新成功', icon: 'success' });
    } catch (err: any) {
      wx.hideToast();
      err?.errMsg?.includes('compress') ? this.uploadOriginalAvatar(avatarUrl) : wx.showToast({ title: '上传失败', icon: 'none' }); 
    }
  },

  async uploadOriginalAvatar(filePath: string) {
    try {
      const { fileID } = await wx.cloud.uploadFile({ cloudPath: `avatars/${Date.now()}_fallback.jpg`, filePath });
      if (await this.updateUserProfile({ weiXinAvatar: fileID })) wx.showToast({ title: '头像更新成功', icon: 'success' });
    } catch { wx.showToast({ title: '重试失败', icon: 'none' }); }
  },

  openDressUpDrawer() { this.setData({ showDressUpDrawer: true }); this.fetchAllSkins(); },
  closeDressUpDrawer() { this.setData({ showDressUpDrawer: false }); },
  switchTab(e: any) { this.setData({ currentTabIndex: parseInt(e.currentTarget.dataset.index) }); },
  onSwiperChange(e: any) { this.setData({ currentTabIndex: e.detail.current }); },

  async fetchAllSkins() {
    wx.showNavigationBarLoading();
    try {
      const [bgRes, frameRes] = await Promise.all([db.collection('dressup_templates').where({ type: 'bg', displayLocation: 'default' }).orderBy('sort', 'desc').get(), db.collection('dressup_templates').where({ type: 'frame', displayLocation: 'default' }).orderBy('sort', 'desc').get()]);
      const getSafeValue = (field: any) => Array.isArray(field) ? (field[0] || '') : (field || '');

      const finalBgList = [
        { _id: 'default_bg', isDefault: true, name: '默认白板', bgUrlLarge: '', bgUrlSmall: '', _displayBgUrlLarge: '', _displayBgUrlSmall: '', theme: 'light' }, 
        ...bgRes.data.map((item: any) => ({ ...item, _displayBgUrlLarge: GLOBAL_IMAGE_CACHE[getSafeValue(item.bgUrlLarge)] || getSafeValue(item.bgUrlLarge), _displayBgUrlSmall: GLOBAL_IMAGE_CACHE[getSafeValue(item.bgUrlSmall)] || getSafeValue(item.bgUrlSmall) })), 
        { _id: 'mall_bg', isMall: true, name: '前往商城' }
      ];

      const finalFrameList = [
        { _id: 'default_none', isDefault: true, name: '默认无框', avatarFrameUrl: '', _displayAvatarFrameUrl: '', realSizeLevel: 'normal' }, 
        { _id: 'default_white', isPreset: true, name: '简约白框', avatarFrameUrl: 'white_shadow', _displayAvatarFrameUrl: 'white_shadow', realSizeLevel: 'normal' }, 
        ...frameRes.data.map((item: any) => ({ ...item, realShadow: getRealShadow(item.shadowPreset, item.shadowCustom), realSizeLevel: item.frameSizeLevel || 'normal', _displayAvatarFrameUrl: GLOBAL_IMAGE_CACHE[getSafeValue(item.avatarFrameUrl)] || getSafeValue(item.avatarFrameUrl) })), 
        { _id: 'mall_frame', isMall: true, name: '前往商城' }
      ];

      this.setData({ bgSkins: finalBgList, frameSkins: finalFrameList }, () => this.startCachingImages(bgRes.data, frameRes.data));
    } catch {} finally { wx.hideNavigationBarLoading(); }
  },

  startCachingImages(bgList: any[], frameList: any[]) {
    const urls = new Set<string>();
    const getSafe = (f: any) => (Array.isArray(f) ? f[0] : f) || '';
    bgList.forEach(item => { const url = getSafe(item.bgUrlSmall); if (url && !GLOBAL_IMAGE_CACHE[url]) urls.add(url); });
    frameList.forEach(item => { const url = getSafe(item.avatarFrameUrl); if (url && !GLOBAL_IMAGE_CACHE[url] && (url.includes('http') || url.includes('cloud://'))) urls.add(url); });
    if (!urls.size) return;

    let debounceTimer: any = null;
    urls.forEach(url => {
      const handleSuccess = (res: any) => {
        if (res.statusCode === 200) {
          GLOBAL_IMAGE_CACHE[url] = res.tempFilePath;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => this.updateDisplaySkins(), 200);
        }
      };
      url.startsWith('cloud://') ? wx.cloud.downloadFile({ fileID: url, success: handleSuccess }) : wx.downloadFile({ url, success: handleSuccess });
    });
  },

  updateDisplaySkins() {
    const getSafe = (f: any) => Array.isArray(f) ? (f[0] || '') : (f || '');
    this.setData({ 
      bgSkins: this.data.bgSkins.map((item: any) => item.isDefault || item.isMall ? item : { ...item, _displayBgUrlSmall: GLOBAL_IMAGE_CACHE[getSafe(item.bgUrlSmall)] || getSafe(item.bgUrlSmall) }), 
      frameSkins: this.data.frameSkins.map((item: any) => item.isDefault || item.isMall || item.isPreset ? item : { ...item, _displayAvatarFrameUrl: GLOBAL_IMAGE_CACHE[getSafe(item.avatarFrameUrl)] || getSafe(item.avatarFrameUrl) }) 
    });
  },

  async applySkin(e: any) {
    const item = e.currentTarget.dataset.item;
    const { userInfo, currentTabIndex, levelInfo } = this.data;
    if (item.isMall) return wx.navigateTo({ url: '/pages/mine/market/outfit/outfit' });
    if (item.authLogic === 'role' && item.authCondition === '1' && userInfo.Permission !== 1) return wx.showToast({ title: '仅教职工专属', icon: 'none' });
    if (item.authLogic === 'level' && item.authCondition && (levelInfo?.level || 1) < parseInt(item.authCondition)) return wx.showToast({ title: `需达到 Lv.${item.authCondition} 才可穿戴`, icon: 'none' });
    
    const getSafe = (f: any) => Array.isArray(f) ? (f[0] || '') : (f || '');
    let updateData: any = currentTabIndex === 0 
      ? { cardBgUrl: getSafe(item.bgUrlLarge), miniCardBgUrl: getSafe(item.bgUrlSmall), cardTheme: String(getSafe(item.text_theme_enum) || 'dark').toLowerCase().trim() }
      : { avatarFrameUrl: getSafe(item.avatarFrameUrl), avatarFrameShadow: item.realShadow || '', avatarFrameSizeLevel: item.realSizeLevel || 'normal' };
    
    try {
      if (await this.updateUserProfile(updateData)) wx.showToast({ title: item.isDefault ? '已恢复默认' : '装扮已更新', icon: 'success' });
    } catch { wx.showToast({ title: '应用失败', icon: 'none' }); }
  }
});