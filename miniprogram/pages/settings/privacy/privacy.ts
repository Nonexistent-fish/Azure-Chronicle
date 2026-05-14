export {};

Page<any, any>({
  data: {
    userInfo: null as any
  },

  onShow() {
    const currentActiveUser = wx.getStorageSync('currentUser');
    if (currentActiveUser) {
      this.setData({ userInfo: currentActiveUser });
    } else {
      wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'checkUserStatus' },
        success: (res: any) => {
          if (res.result && res.result.userData) {
            this.setData({ userInfo: res.result.userData });
            wx.setStorageSync('currentUser', res.result.userData);
          }
        }
      });
    }
  },

  onEditPhone() {
    wx.showModal({
      title: '设置手机号',
      content: this.data.userInfo.phoneNumber || '', 
      editable: true,
      placeholderText: '输入手机号',
      success: async (res) => {
        if (res.confirm) {
          const val = res.content.trim();
          if (val === (this.data.userInfo.phoneNumber || '')) return;
          if (val !== '' && !/^1[3-9]\d{9}$/.test(val)) return wx.showToast({ title: '手机号格式错误', icon: 'none' });

          wx.showLoading({ title: '保存中' });
          try {
            const { result } = await wx.cloud.callFunction({
              name: 'userService',
              data: { action: 'updatePrivacyInfo', field: 'phoneNumber', value: val }
            }) as any;

            if (!result.success) throw new Error(result.errMsg);
            const newUser = { ...this.data.userInfo, phoneNumber: val };
            this.setData({ userInfo: newUser });
            wx.setStorageSync('currentUser', newUser);
            
            wx.hideLoading();
            wx.showToast({ title: val ? '已更新' : '已清空', icon: 'success' });
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '系统开小差了，保存失败', icon: 'none' });
          }
        }
      }
    });
  },

  async onUpdateWechatId(e: any) {
    const val = e.detail.value.trim();
    if (val === (this.data.userInfo.wechatId || '')) return;

    if (val !== '' && !/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(val) && !/^1[3-9]\d{9}$/.test(val)) {
      wx.showToast({ title: '微信号格式错误', icon: 'none' });
      this.setData({ 'userInfo.wechatId': this.data.userInfo.wechatId || '' });
      return;
    }

    wx.showLoading({ title: '保存中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'updatePrivacyInfo', field: 'wechatId', value: val }
      }) as any;

      if (!result.success) throw new Error(result.errMsg);
      const newUser = { ...this.data.userInfo, wechatId: val };
      this.setData({ userInfo: newUser });
      wx.setStorageSync('currentUser', newUser);

      wx.hideLoading();
      wx.showToast({ title: val ? '已更新' : '已清空', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '系统开小差了，保存失败', icon: 'none' });
    }
  },

  async onUpdateqqId(e: any) {
    const val = e.detail.value.trim();
    if (val === (this.data.userInfo.qqId || '')) return;

    if (val !== '' && !/^\d{6,11}$/.test(val)) {
      wx.showToast({ title: 'QQ号需为6-11位纯数字', icon: 'none' });
      this.setData({ 'userInfo.qqId': this.data.userInfo.qqId || '' });
      return;
    }

    wx.showLoading({ title: '保存中' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'updatePrivacyInfo', field: 'qqId', value: val }
      }) as any;

      if (!result.success) throw new Error(result.errMsg);
      const newUser = { ...this.data.userInfo, qqId: val };
      this.setData({ userInfo: newUser });
      wx.setStorageSync('currentUser', newUser);

      wx.hideLoading();
      wx.showToast({ title: val ? '已更新' : '已清空', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '系统开小差了，保存失败', icon: 'none' });
    }
  }
});