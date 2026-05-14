export {};
const db = wx.cloud.database();

Page<any, any>({
  data: {
    countdowns: [] as any[], showModal: false, newIcon: '📅', newTitle: '', newDate: '', newTime: '23:59',
    todayStr: '', isSubmitting: false, timer: null as any, isLoading: true, expandedId: null as string | null
  },

  onLoad() {
    const today = new Date();
    this.setData({ todayStr: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` });
  },

  onShow() {
    if (!wx.getStorageSync('isRegistered')) {
      return wx.showModal({
        title: '需要权限', content: '该功能涉及多设备云端数据同步，需完成校内身份认证后方可使用。',
        confirmText: '去认证', cancelText: '返回',
        success: (res) => res.confirm ? wx.navigateTo({ url: '/pages/mine/tools/auth/auth' }) : wx.navigateBack()
      });
    }
    this.fetchCountdowns();
  },

  onHide() { if (this.data.timer) clearInterval(this.data.timer); },
  onUnload() { if (this.data.timer) clearInterval(this.data.timer); },

  async fetchCountdowns() {
    this.setData({ isLoading: true });
    try {
      const [personalRes, publicRes] = await Promise.all([
        db.collection('user_countdowns').get().catch(() => ({ data: [] })),
        db.collection('public_countdowns').get().catch(() => ({ data: [] }))
      ]);

      const combinedList = [
        ...((publicRes as any).data || []).map((item: any) => ({ ...item, isPublic: true })),
        ...((personalRes as any).data || []).map((item: any) => ({ ...item, isPublic: false }))
      ].sort((a: any, b: any) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());

      this.setData({ countdowns: combinedList, isLoading: false });
      this.startTimer();
    } catch { wx.showToast({ title: '同步失败', icon: 'none' }); this.setData({ isLoading: false }); }
  },

  startTimer() {
    if (this.data.timer) clearInterval(this.data.timer);

    const calc = () => {
      const now = Date.now();
      const updatedList = this.data.countdowns.map((item: any) => {
        const targetObj = new Date(item.targetDate);
        const target = targetObj.getTime();
        const create = item.createDate ? new Date(item.createDate).getTime() : now;
        
        const pad = (n: number) => String(n).padStart(2, '0');
        const exactTime = `${targetObj.getFullYear()}-${pad(targetObj.getMonth() + 1)}-${pad(targetObj.getDate())} ${pad(targetObj.getHours())}:${pad(targetObj.getMinutes())}`;

        const diff = Math.max(0, target - now);
        const leftDays = Math.floor(diff / 86400000);
        const leftHours = pad(Math.floor((diff % 86400000) / 3600000));
        const leftMinutes = pad(Math.floor((diff % 3600000) / 60000));
        const leftSeconds = pad(Math.floor((diff % 60000) / 1000));
        
        const totalSpan = target - create;
        const percent = (totalSpan > 0 && diff > 0) ? Math.min(100, (diff / totalSpan) * 100) : 0;
        const statusClass = percent <= 15 ? 'danger' : (percent <= 40 ? 'warning' : 'safe');

        return { ...item, leftDays, leftHours, leftMinutes, leftSeconds, percent, statusClass, exactTime };
      });
      this.setData({ countdowns: updatedList });
    };

    calc();
    this.setData({ timer: setInterval(calc, 1000) });
  },

  showAddModal() { this.setData({ showModal: true }); },
  hideAddModal() { this.setData({ showModal: false }); },
  onDateChange(e: any) { this.setData({ newDate: e.detail.value }); },
  onTimeChange(e: any) { this.setData({ newTime: e.detail.value }); },
  onIconInput(e: any) { this.setData({ newIcon: e.detail.value }); },
  onTitleInput(e: any) { this.setData({ newTitle: e.detail.value }); },

  async submitNewCountdown() {
    const { newIcon, newTitle, newDate, newTime } = this.data;
    if (!newTitle || !newDate) return wx.showToast({ title: '请填写完整名称和日期', icon: 'none' });

    this.setData({ isSubmitting: true }); wx.showLoading({ title: '保存中...' });
    const targetTime = new Date(`${newDate.replace(/-/g, '/')} ${newTime}:00`).getTime();

    try {
      await db.collection('user_countdowns').add({ data: { icon: newIcon || '⏳', title: newTitle, targetDate: targetTime, createDate: Date.now() } });
      wx.showToast({ title: '保存成功' }); this.hideAddModal();
      this.setData({ newTitle: '', newDate: '', newTime: '23:59' }); this.fetchCountdowns();
    } catch { wx.showToast({ title: '保存失败，请检查网络', icon: 'error' }); } 
    finally { this.setData({ isSubmitting: false }); wx.hideLoading(); }
  },

  toggleExpand(e: any) { const id = e.currentTarget.dataset.id; this.setData({ expandedId: this.data.expandedId === id ? null : id }); },

  deleteCountdown(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除', content: '删除后无法恢复，确定要删除此倒计时吗？', confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try { await db.collection('user_countdowns').doc(id).remove(); wx.showToast({ title: '已删除', icon: 'success' }); this.fetchCountdowns(); } 
          catch { wx.showToast({ title: '删除失败', icon: 'error' }); }
        }
      }
    });
  }
});