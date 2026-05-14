export {};

Component({
  data: {
    selected: 0
  },

  methods: {
    switchTab(e: any) {
      const { path, index } = e.currentTarget.dataset;
      const targetIndex = Number(index);

      // 防重复点击同一 Tab 
      if (this.data.selected === targetIndex) return;

      wx.switchTab({ url: path });
    }
  }
});