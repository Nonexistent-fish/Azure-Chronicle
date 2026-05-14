export {};
const db = wx.cloud.database();
const _ = db.command;

Page<any, any>({
  data: {
    postId: '', reportedOpenId: '', reportedName: '',
    reasons: ['垃圾广告', '色情低俗', '政治敏感', '人身攻击', '造谣传谣', '泄露隐私', '其他'],
    selectedReason: '', detail: '', isSubmitting: false 
  },

  onLoad(options: any) {
    const targetId = options.id || options.postId;
    if (targetId) {
      this.setData({ postId: targetId, reportedOpenId: options.openid || '', reportedName: options.name || '匿名用户' });
    } else {
      wx.showToast({ title: '参数异常', icon: 'error' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  chooseReason(e: any) {
    this.setData({ selectedReason: e.currentTarget.dataset.reason });
    wx.vibrateShort({ type: 'light' }); 
  },

  handleInput(e: any) { this.setData({ detail: e.detail.value }); },

  async submitReport() {
    if (this.data.isSubmitting) return;

    const { postId, reportedOpenId, reportedName, selectedReason, detail } = this.data;
    if (!selectedReason) return wx.showToast({ title: '请选择违规类型', icon: 'none' });

    const user = wx.getStorageSync('currentUser');
    if (!user?.nickName) return wx.showModal({ title: '提示', content: '请先绑定身份后再进行举报', showCancel: false });

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const myOpenId = wx.getStorageSync('realOpenID') || user._openid;
      if (myOpenId) {
        const { total } = await db.collection('reports').where({ postId, _openid: _.eq(myOpenId) }).count();
        if (total > 0) {
          wx.hideLoading(); this.setData({ isSubmitting: false });
          return wx.showModal({ title: '提示', content: '您已举报过该内容，客服正在加紧处理中', showCancel: false });
        }
      }

      const realDetail = detail.trim();
      if (realDetail) {
        const { result } = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: realDetail } }) as any;
        if (result?.isRisky) {
          wx.hideLoading(); this.setData({ isSubmitting: false });
          return wx.showToast({ title: '补充说明含违规词汇', icon: 'none' });
        }
      }

      await db.collection('reports').add({
        data: { postId, reportedOpenId, reportedName, reason: selectedReason, detail: realDetail, status: 0, handleResult: '', reporterName: user.nickName, createTime: db.serverDate(), createdAt: db.serverDate() }
      });

      wx.hideLoading();
      wx.showModal({ title: '举报已受理', content: '感谢您的监督，我们会尽快核实处理。', showCancel: false, confirmColor: '#ff4d4f', success: () => wx.navigateBack() });
    } catch {
      wx.hideLoading(); this.setData({ isSubmitting: false }); 
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  }
});