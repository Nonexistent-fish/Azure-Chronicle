export {};

Page<any, any>({
  data: {},

  onLoad() {},
  
  goToDonate() {
    wx.navigateTo({
      url: '/pages/settings/about/donate/donate',
      fail: () => wx.showToast({ title: '捐赠页面建设中...', icon: 'none' })
    });
  }
});