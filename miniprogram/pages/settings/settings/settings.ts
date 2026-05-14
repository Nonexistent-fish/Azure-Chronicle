export {};
const db = wx.cloud.database();

Page({
  data: {
    userInfo: null as any,
    totalUsers: 0 
  },

  onShow() {
    this.fetchTotalCount();
    this.fetchUserInfo();
  },

  fetchUserInfo() {
    wx.cloud.callFunction({
      name: 'userService',
      data: { action: 'checkUserStatus' },
      success: (res: any) => {
        const result = res.result || {};
        const userData = result.userData || result.data || result;
        this.setData({ userInfo: userData });
      },
      fail: (err) => {
        console.error('获取用户信息失败', err);
      }
    });
  },

  async fetchTotalCount() {
    try {
      const res = await db.collection('app_config').doc('26894d4e6995707100f571084c3b0615').get();
      if (res.data) {
        this.setData({ totalUsers: res.data.registerUser || 0 });
      }
    } catch (err) {
      console.error('获取注册人数失败', err);
    }
  },

  onUnsubscribe() {
    const { userInfo } = this.data;
    if (!userInfo || !userInfo._id) return;

    wx.showModal({
      title: '确认注销',
      content: '确定要注销并冻结您的账号吗？此操作不可逆。',
      confirmText: '确定注销',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '最后确认',
            content: '注销后，您的所有数据将被封存，需要重新绑定才能再次加入。',
            confirmText: '狠狠注销',
            confirmColor: '#ff4d4f',
            success: async (secondRes) => {
              if (secondRes.confirm) {
                this.executeArchive();
              }
            }
          });
        }
      }
    });
  },

  async executeArchive() {
    wx.showLoading({ title: '处理中...', mask: true });
    
    try {
      const { userInfo } = this.data;
      if (!userInfo || !userInfo._id) {
        wx.hideLoading();
        return wx.showToast({ title: '无法获取用户ID', icon: 'none' });
      }

      const res: any = await wx.cloud.callFunction({
        name: 'userService',
        data: { 
          action: 'unsubscribeUser',
          targetUid: userInfo._id 
        }
      });

      if (res.result && res.result.success) {
        wx.removeStorageSync('currentUser');
        wx.removeStorageSync('isSuperAdmin');
        wx.removeStorageSync('realOpenID');
        
        wx.hideLoading();
        wx.showToast({ title: '已注销', icon: 'success' });

        setTimeout(() => {
          wx.reLaunch({ url: '/pages/mine/tools/tools' });
        }, 1500);
      } else {
        throw new Error(res.result.msg || '操作失败');
      }
    } catch (err: any) {
      wx.hideLoading();
      wx.showToast({ title: '注销失败: ' + (err.message || ''), icon: 'none' });
      console.error(err);
    }
  },
});