Component({
  properties: {
    title: { type: String, value: '青笺拾光商城' },
    showBack: { type: Boolean, value: true },
    bgColor: { type: String, value: 'rgba(255, 255, 255, 0.8)' }, 
    titleColor: { type: String, value: '#8A181A' } 
  },
  
  data: {
    statusBarHeight: 20, 
    navHeight: 60,       
    capsuleHeight: 32    
  },

  lifetimes: {
    attached() {
      // 动态计算导航栏总高度适配不同机型
      const { statusBarHeight } = wx.getWindowInfo();
      const capsule = wx.getMenuButtonBoundingClientRect();
      
      this.setData({
        statusBarHeight,
        capsuleHeight: capsule.height,
        navHeight: (capsule.top - statusBarHeight) * 2 + capsule.height + statusBarHeight
      });
    }
  },

  methods: {
    goBack() {
      wx.navigateBack({ delta: 1 });
    }
  }
});