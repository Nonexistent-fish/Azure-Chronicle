export {};

Page<any, any>({
  data: {
    historyList: [] as any[],
    isLoading: true
  },

  onLoad() { this.fetchHistory(); },

  async fetchHistory() {
    this.setData({ isLoading: true });
    wx.showNavigationBarLoading();
    try {
      const res: any = await wx.cloud.callFunction({
        name: 'postService',
        data: { action: 'getTopicHistory' }
      });
      if (res.result?.success) {
        this.setData({ historyList: res.result.data });
      } else {
        throw new Error(res.result?.msg || 'Fetch failed');
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
      wx.hideNavigationBarLoading();
    }
  }
});