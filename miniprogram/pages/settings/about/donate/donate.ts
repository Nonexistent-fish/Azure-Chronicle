export {};
const db = wx.cloud.database();

Page<any, any>({
  data: {
    afdianLink: 'https://afdian.com/a/Qianyu_of_Dongcheng',
    income: '0.00', expense: '0.00', incomePercent: 0
  },

  onLoad() { this.fetchStats(); },

  async fetchStats() {
    try {
      const { data } = await db.collection('app_config').limit(1).get();
      
      if (data.length > 0) {
        const { income, expense } = data[0];
        const total = Number(income) + Number(expense);
        
        let percent = total > 0 ? Math.round((Number(income) / total) * 100) : 0;
        if (percent < 5 && Number(income) > 0) percent = 5;

        this.setData({
          income: Number(income).toFixed(2),
          expense: Number(expense).toFixed(2),
          incomePercent: percent
        });
      }
    } catch (err) { console.error('获取收支数据失败', err); }
  },

  copyLink() {
    wx.vibrateShort({ type: 'light' });
    wx.setClipboardData({
      data: this.data.afdianLink,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success', duration: 2000 })
    });
  }
});