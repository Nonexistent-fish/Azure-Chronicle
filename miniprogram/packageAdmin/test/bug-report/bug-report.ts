export {};
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: { bugList: [] as any[], currentTab: 0, isLoading: true },

  onShow() {
    const isSuper = wx.getStorageSync('isSuperAdmin');
    const user = wx.getStorageSync('currentUser');
    
    if (!isSuper && user?.Permission !== 2 && user?.Permission !== 3) {
      wx.showToast({ title: '非法越权访问', icon: 'error' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
      return; 
    }
    this.fetchBugs();
  },

  switchTab(e: any) {
    const tab = Number(e.currentTarget.dataset.tab);
    if (this.data.currentTab === tab) return;
    this.setData({ currentTab: tab, isLoading: true });
    this.fetchBugs();
  },

  formatTime: (d: any) => d ? (() => {
    const dt = new Date(d);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })() : '',

  async fetchBugs() {
    this.setData({ isLoading: true });
    try {
      const { data: reports } = await db.collection('feedback_reports')
        .where({ status: this.data.currentTab === 0 ? _.in([0, 1]) : _.in([2, 3]) })
        .orderBy('createTime', 'desc').limit(50).get();
      
      const uids = [...new Set(reports.map(i => i.uid || i._openid).filter(Boolean))];
      const userMap: Record<string, any> = {};
      
      if (uids.length) {
        const { data } = await db.collection('register_students').where({ _openid: _.in(uids) }).get();
        data.forEach(u => userMap[u._openid] = u);
      }

      const defAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
      const stsMap: Record<number, string> = { 0: '待处理', 1: '处理中', 2: '已修复', 3: '无法复现' };

      this.setData({
        bugList: reports.map(i => {
          const m = userMap[i.uid || i._openid] || {};
          return { 
            ...i, fmtTime: this.formatTime(i.createTime), 
            safeStatus: i.status || 0, statusText: stsMap[i.status || 0] || '未知状态', 
            safeSeverity: i.severity || 'yellow', 
            safeModel: i.deviceInfo?.model || '未知设备', safeSystem: i.deviceInfo?.system || '未知系统', 
            reporterName: i.nickName || m.nickName || '匿名用户', reporterAvatar: i.weiXinAvatar || m.weiXinAvatar || defAvatar 
          };
        }),
        isLoading: false 
      });
    } catch {
      wx.showToast({ title: '拉取失败', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  onChangeStatus(e: any) {
    const { id, current } = e.currentTarget.dataset;
    const sts = ['待处理', '处理中', '已修复', '无法复现'];
    
    wx.showActionSheet({
      itemList: sts.map(s => `标记为: ${s}`),
      success: async (res) => {
        if (res.tapIndex === current) return;
        wx.showLoading({ title: '更新中...' });
        try {
          await db.collection('feedback_reports').doc(id).update({ data: { status: res.tapIndex, isRead: false } });
          
          const item = this.data.bugList.find(b => b._id === id);
          const uid = item?.uid || item?._openid;
          if (uid) {
            const isRep = item.type === 'report' || item.reason;
            const c = isRep ? (item.content || item.detail || '') : (item.description || item.content || '');
            await db.collection('user_notifications').add({
              data: { targetOpenId: uid, title: isRep ? '举报状态更新' : 'Bug 状态更新', content: `您提交的${isRep ? '举报内容' : '简短内容'} 【${c}】 状态已更新为：【${sts[res.tapIndex]}】。`, type: 'system_notification', subType: isRep ? 'report' : 'bug', isDeleted: false, isRead: false, createTime: db.serverDate() }
            });
          }
          wx.hideLoading(); wx.showToast({ title: '已更新', icon: 'success' });
          this.fetchBugs(); 
        } catch { wx.hideLoading(); wx.showToast({ title: '更新失败', icon: 'none' }); }
      }
    });
  },

  onReplyUser(e: any) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '官方回复', content: item.replyContent || '', editable: true, placeholderText: '告知处理结果...',
      success: async (res) => {
        if (res.confirm && res.content !== undefined) {
          const reply = res.content.trim();
          wx.showLoading({ title: '发送中...' });
          try {
            await db.collection('feedback_reports').doc(item._id).update({ data: { replyContent: reply, isRead: false } });
            
            const uid = item.uid || item._openid;
            if (uid) {
              const isRep = item.type === 'report' || item.reason; 
              const c = isRep ? (item.content || item.detail || '') : (item.description || item.content || '');
              await db.collection('user_notifications').add({
                data: { targetOpenId: uid, title: isRep ? '举报处理进度' : 'Bug 反馈官方回复', content: `您提交的${isRep ? '举报内容' : '简短内容'} 【${c}】 有了新进度：\n${reply}\n感谢您协助改善体验！`, type: 'system_notification', subType: isRep ? 'report' : 'bug', isDeleted: false, isRead: false, createTime: db.serverDate() }
              });
            }
            wx.hideLoading(); wx.showToast({ title: '回复成功', icon: 'success' });
            this.fetchBugs();
          } catch { wx.hideLoading(); wx.showToast({ title: '回复失败', icon: 'none' }); }
        }
      }
    });
  }
});