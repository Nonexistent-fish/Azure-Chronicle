export {};
const db = wx.cloud.database();

const MAJOR_KEYWORDS: Record<string, string[]> = {
  '宝马保时捷双授权': ['宝马保时捷', 'PEP'], '宝马': ['宝马', 'BMW', 'BEST'], '智能网联': ['智能', '网联', '智网', 'IVT'],
  '保时捷': ['保时捷', 'PEAP'], '汽运': ['汽运', '汽车运用', '维修'], '工业机器人': ['机器人', '工业'],
  '新媒体': ['新媒体', 'AIGC', '媒体'], '交通运输': ['交运', '交通'], '预科': ['预科']
};

Page({
  data: { groupedList: [] as any[], isLoading: true, totalPending: 0 },

  onShow() {
    const isSuper = wx.getStorageSync('isSuperAdmin');
    const user = wx.getStorageSync('currentUser');
    
    if (!isSuper && user?.Permission !== 2 && user?.Permission !== 3) {
      wx.showToast({ title: '非法越权访问', icon: 'error' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
      return;
    }
    this.fetchPendingData(); 
  },

  formatTime: (d: any) => d ? (() => {
    const dt = new Date(d);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })() : '',

  async fetchPendingData() {
    this.setData({ isLoading: true });
    try {
      const { data } = await db.collection('register_students').where({ registerStatus: 0 }).limit(100).get();
      
      const processed = data
        .sort((a: any, b: any) => (new Date(a.createTime).getTime() || 0) - (new Date(b.createTime).getTime() || 0))
        .map(i => ({ ...i, displayTime: this.formatTime(i.createTime), _isRejecting: false, _rejectReason: '' }));

      this.setData({ groupedList: this.groupStudents(processed), totalPending: data.length, isLoading: false });
    } catch {
      wx.showToast({ title: '拉取数据异常', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  groupStudents(list: any[]) {
    const groups = list.reduce((acc: any, stu: any) => {
      const k = this.normalizeClass((stu.className || '').trim().toUpperCase());
      (acc[k] ||= []).push(stu); return acc;
    }, {});
    return Object.keys(groups).sort().map(k => ({ title: k, list: groups[k] }));
  },

  normalizeClass(raw: string): string {
    if (!raw) return '❓ 未填写班级';
    const major = Object.keys(MAJOR_KEYWORDS).find(k => MAJOR_KEYWORDS[k].some(w => raw.includes(w))) || '其他专业';
    const cls = raw.match(/2[3-6]\d{2}/);
    const yr = raw.match(/2[3-6]/);
    const suffix = cls ? `${cls[0]}班` : (yr ? `${yr[0]}级 (班级不明)` : '年份未知');
    return major === '其他专业' && suffix === '年份未知' ? '⚠️ 待人工确认' : `${major} ${suffix}`;
  },

  handlePass(e: any) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({ title: '通过确认', content: `确认允许 ${name} 加入吗？`, confirmColor: '#07c160', success: (res) => res.confirm && this.executeAudit(id, 'pass', '') });
  },

  handleRejectToggle(e: any) {
    const { gidx, sidx } = e.currentTarget.dataset;
    const target = this.data.groupedList[gidx].list[sidx];
    
    if (target._isRejecting) return this.executeAudit(target._id, 'reject', target._rejectReason || '信息填写不规范，请核对后重新提交');
    
    this.setData({ groupedList: this.data.groupedList.map((g: any, gi: number) => ({ ...g, list: g.list.map((s: any, si: number) => ({ ...s, _isRejecting: gi === gidx && si === sidx })) })) });
  },

  handleCancelReject(e: any) { this.setData({ [`groupedList[${e.currentTarget.dataset.gidx}].list[${e.currentTarget.dataset.sidx}]._isRejecting`]: false }); },
  handleReasonInput(e: any) { this.setData({ [`groupedList[${e.currentTarget.dataset.gidx}].list[${e.currentTarget.dataset.sidx}]._rejectReason`]: e.detail.value }); },

  async executeAudit(id: string, action: string, reason: string) {
    wx.showLoading({ title: '处理中' });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'auditUser', targetUid: id, auditStatus: action, rejectReason: reason } }) as any;
      wx.hideLoading();
      
      if (result && result.success === false) return wx.showModal({ title: '审核失败', content: result.msg || '未知错误', showCancel: false });
      
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.fetchPendingData();
    } catch (err: any) {
      wx.hideLoading();
      wx.showModal({ title: '调用失败', content: err.message, showCancel: false });
    }
  }
});