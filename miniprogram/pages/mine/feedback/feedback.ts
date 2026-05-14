export {};
const db = wx.cloud.database();

Page<any, any>({
  data: {
    deviceModel: '', systemVersion: '', desc: '', steps: '', severity: 'yellow', isStable: true, isSubmitting: false,
    severityOptions: [
      { value: 'red', label: '致命', desc: '崩溃/无法使用' },
      { value: 'yellow', label: '严重', desc: '功能异常/干扰' },
      { value: 'green', label: '轻微', desc: 'UI错位/文案' }
    ]
  },

  onLoad() {
    try {
      const info = wx.getSystemInfoSync();
      this.setData({ deviceModel: `${info.brand} ${info.model}`, systemVersion: `${info.platform} ${info.system}` });
    } catch {}
  },

  onInputDesc(e: any) { this.setData({ desc: e.detail.value }); },
  onInputSteps(e: any) { this.setData({ steps: e.detail.value }); },
  
  setStable(e: any) {
    const val = e.currentTarget.dataset.val;
    if (this.data.isStable !== val) { wx.vibrateShort({ type: 'light' }); this.setData({ isStable: val }); }
  },

  selectSeverity(e: any) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ severity: e.currentTarget.dataset.value });
  },

  async submitFeedback() {
    if (this.data.isSubmitting) return;
    const { desc, steps, severity, deviceModel, systemVersion, isStable } = this.data;

    if (!desc.trim()) return wx.showToast({ title: '请简述Bug内容', icon: 'none' });
    if (!steps.trim()) return wx.showToast({ title: '请填写复现步骤', icon: 'none' });

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      await db.collection('feedback_reports').add({
        data: { description: desc, reproductionSteps: steps, severity, isStable, deviceInfo: { model: deviceModel, system: systemVersion }, createTime: db.serverDate(), status: 0, replyContent: '', isRead: false }
      });

      const myOpenId = wx.getStorageSync('realOpenID') || wx.getStorageSync('currentUser')?._openid;
      if (myOpenId) {
        await db.collection('user_notifications').add({
          data: { targetOpenId: myOpenId, title: 'Bug反馈已受理', content: `您提交的简短内容 【${desc}】 已收到，当前状态为：【待处理】。我们将尽快为您核实！`, type: 'system_notification', subType: 'bug', isDeleted: false, isRead: false, createTime: db.serverDate() }
        });
      }

      wx.hideLoading();
      wx.showToast({ title: '反馈成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
      this.setData({ isSubmitting: false });
    }
  }
});