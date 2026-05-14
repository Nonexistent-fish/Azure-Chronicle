export {};
const app = getApp<any>();
const db = wx.cloud.database();

Page<any, any>({
  data: {
    isLoading: false,
    bannerList: [] 
  },

  onLoad() { this.fetchBanners(); },
  onShow() {},

  async fetchBanners() {
    try {
      const { data } = await db.collection('home_banners').where({ isActive: true, targetType: 'gacha' }).orderBy('sort', 'asc').get();
      this.setData({ bannerList: data });
    } catch {}
  },

  handleBannerClick(e: any) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.targetType === 'gacha') {
      const targetParam = item.targetId ? `?poolId=${item.targetId}` : '';
      wx.navigateTo({
        url: `/pages/mine/market/gacha/gacha${targetParam}`,
        fail: () => wx.showToast({ title: '祈愿通道维护中', icon: 'none' })
      });
      return;
    }

    if (item.targetUrl) {
      wx.navigateTo({
        url: item.targetUrl,
        fail: () => wx.showToast({ title: '页面建设中', icon: 'none' })
      });
      return;
    }

    wx.showToast({ title: '敬请期待', icon: 'none' });
  }
});