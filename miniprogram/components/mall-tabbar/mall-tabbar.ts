Component({
  properties: {
    currentIdx: { type: Number, value: 0 } // 0:聚宝盆, 1:抽奖机, 2:外观商城
  },

  methods: {
    switchTab(e: any) {
      const { idx, path } = e.currentTarget.dataset;
      
      // 若点击当前已激活的 Tab，则拦截以防止重复路由
      if (Number(idx) === this.properties.currentIdx) return;
      
      wx.redirectTo({
        url: path,
        fail: () => wx.showToast({ title: '页面迷路了...', icon: 'none' })
      });
    }
  }
});