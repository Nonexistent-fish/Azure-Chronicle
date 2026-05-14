export {};
const db = wx.cloud.database();

Page({
  data: { postList: [] as any[], isLoading: true, totalPending: 0 },

  onShow() {
    const isSuper = wx.getStorageSync('isSuperAdmin');
    const user = wx.getStorageSync('currentUser');
    
    if (!isSuper && user?.Permission !== 2 && user?.Permission !== 3) {
      wx.showToast({ title: '非法越权访问', icon: 'error' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
      return; 
    }
    this.fetchPosts();
  },

  formatTime: (d: any) => d ? (() => {
    const dt = new Date(d);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })() : '',

  async fetchPosts() {
    this.setData({ isLoading: true });
    try {
      const { data } = await db.collection('timeline_posts').where({ status: 0 }).orderBy('createTime', 'asc').limit(20).get();
      const list = data.map(item => ({
        ...item,
        media: (item.media || []).map((f: any) => {
          const orig = f.fileID || f.tempFilePath || '';
          return { ...f, thumbUrl: f.thumb || orig, originalUrl: orig };
        }),
        displayTime: this.formatTime(item.createTime),
        _isRejecting: false,
        _rejectReason: ''
      }));
      this.setData({ postList: list, totalPending: list.length, isLoading: false });
    } catch { this.setData({ isLoading: false }); }
  },

  previewMedia(e: any) {
    const { index, idx } = e.currentTarget.dataset;
    const post = this.data.postList[index];
    wx.previewMedia({
      sources: post.media.map((f: any) => ({ url: f.originalUrl, type: f.fileType || 'image', poster: f.thumbUrl })),
      current: idx 
    });
  },

  handlePass(e: any) {
    wx.showModal({
      title: '发布确认', content: '确认允许这条内容发布吗？', confirmColor: '#07c160',
      success: (res) => res.confirm && this.executeAudit(e.currentTarget.dataset.id, 'pass', '')
    });
  },

  handleRejectToggle(e: any) {
    const { index } = e.currentTarget.dataset;
    const target = this.data.postList[index];
    if (target._isRejecting) return this.executeAudit(target._id, 'reject', target._rejectReason || '内容包含违规信息');
    this.setData({ postList: this.data.postList.map((item, i) => ({ ...item, _isRejecting: i === index })) });
  },

  handleCancelReject(e: any) { this.setData({ [`postList[${e.currentTarget.dataset.index}]._isRejecting`]: false }); },
  handleReasonInput(e: any) { this.setData({ [`postList[${e.currentTarget.dataset.index}]._rejectReason`]: e.detail.value }); },

  async executeAudit(id: string, action: string, reason: string) {
    wx.showLoading({ title: '处理中' });
    const post = this.data.postList.find(p => p._id === id);
    const uid = post?._openid || post?.authorUID;

    try {
      const { result } = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'auditPost', postId: id, auditStatus: action, rejectReason: reason } }) as any;
      wx.hideLoading();

      if (result && !result.success) return wx.showModal({ title: '审核失败', content: result.msg || '未知错误', showCancel: false });
      
      if (action === 'reject' && uid) {
        db.collection('user_notifications').add({
          data: { targetOpenId: uid, title: '动态审核未通过', content: `您发布的动态因【${reason || '内容不合规'}】未通过审核。请前往“我的发布”中查看并修改后重新提交。`, type: 'system_notification', subType: 'audit', isDeleted: false, isRead: false, createTime: db.serverDate() }
        }).catch(() => {});
      }

      wx.showToast({ title: '操作成功', icon: 'success' });
      const newList = this.data.postList.filter(p => p._id !== id);
      this.setData({ postList: newList, totalPending: newList.length });
    } catch { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); }
  }
});