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
      const { result } = await wx.cloud.callFunction({ name: 'postService', data: { action: 'getTopicHistory' } }) as any;
      if (!result?.success) throw new Error(result?.msg || '云端拉取失败');
      this.setData({ historyList: result.data, isLoading: false });
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ isLoading: false });
    } finally {
      wx.hideNavigationBarLoading();
    }
  }
});