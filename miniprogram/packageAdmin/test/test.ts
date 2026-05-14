export {};
const db = wx.cloud.database();

Page({
  data: {
    myAccounts: [] as any[],
    currentId: '',
    SUPER_ID: '' //使用你自己的open_id
  },

  onShow() {
    const isSuperAdmin = wx.getStorageSync('isSuperAdmin');
    const currentUser = wx.getStorageSync('currentUser');
    
    // 安全拦截：非管理员或开发者踢回首页
    if (!isSuperAdmin && currentUser?.Permission !== 2 && currentUser?.Permission !== 3) {
      wx.showToast({ title: '非法越权访问！', icon: 'error' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
      return; 
    }
    
    this.fetchAccounts();
    if (currentUser) this.setData({ currentId: currentUser._id });
  },

  async fetchAccounts() {
    try {
      const { data } = await db.collection('register_students').where({ _openid: this.data.SUPER_ID }).get();
      const roleMap: Record<number, string> = { 0: '学生', 1: '教职工', 2: '管理员', 3: '开发者' };

      let accounts = data.map(acc => ({ ...acc, role: roleMap[Number(acc.Permission) || 0] || '未知' }));

      if (accounts.length > 0) {
        const getTime = (x: any) => x.createTime ? new Date(x.createTime).getTime() : 0;
        // 先全体按时间升序（挑出最早的主人格）
        accounts.sort((a: any, b: any) => getTime(a) - getTime(b));
        const mainAcc = accounts.shift(); 
        // 分身按时间降序（最新的在上面）
        accounts.sort((a: any, b: any) => getTime(b) - getTime(a));
        // 主人格硬锁首位
        if (mainAcc) accounts.unshift(mainAcc);
      }

      this.setData({ myAccounts: accounts });
    } catch {}
  },

  async createTestAccount() {
    const count = this.data.myAccounts.length;
    wx.showLoading({ title: '正在分身...' });

    let targetAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
    try {
      const myOpenId = wx.getStorageSync('realOpenID') || this.data.SUPER_ID;
      const { data } = await db.collection('register_students').where({ _openid: myOpenId }).orderBy('createTime', 'asc').limit(1).get();
      if (data.length > 0) targetAvatar = data[0].weiXinAvatar || targetAvatar;
    } catch {}

    const perms = [0, 1, 2, 3];
    const roles = ['学生', '教职工', '管理员', '开发者'];
    const idx = (count - 1) % 4; // 轮询分配权限组

    try {
      await db.collection('register_students').add({
        data: {
          nickName: `测试-${roles[idx]}-${count}`, realName: `虚拟人${count}`, className: '测试班级2026', weiXinAvatar: targetAvatar,
          registerStatus: 1, status: 1, Permission: perms[idx], role: roles[idx], campus: '月罗路校区', phoneNumber: '13800000000',
          bio: "", miniCardBgUrl: "", cardBgUrl: "", avatarFrameUrl: "", cardTheme: 'dark', createTime: db.serverDate(), updateTime: db.serverDate()
        }
      });
      
      wx.hideLoading(); 
      wx.showToast({ title: `已创建${roles[idx]}`, icon: 'none' });
      this.fetchAccounts(); 
    } catch { 
      wx.hideLoading(); 
      wx.showToast({ title: '创建失败', icon: 'none' }); 
    }
  },

  async deleteAccount(e: any) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.currentId) return wx.showToast({ title: '不能删除当前登录账号', icon: 'none' });
    if (this.data.myAccounts.findIndex(acc => acc._id === id) === 0) return wx.showToast({ title: '主人格不可删除！', icon: 'error' });

    wx.showLoading({ title: '删除中...' });
    await db.collection('register_students').doc(id).remove().catch(() => {});
    wx.hideLoading();
    this.fetchAccounts();
  },

  switchAccount(e: any) {
    const target = this.data.myAccounts[e.currentTarget.dataset.index];
    wx.showLoading({ title: '身份重组中...' });
    
    // 平滑覆盖状态以重置身份缓存
    wx.setStorageSync('currentUser', target);
    wx.setStorageSync('isRegistered', true); 
    wx.setStorageSync('userPermission', target.Permission || 0);

    setTimeout(() => {
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/index/index' }); 
    }, 800);
  }
});