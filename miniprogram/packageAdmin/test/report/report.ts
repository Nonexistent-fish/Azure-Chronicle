export {};
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: { reportList: [] as any[], currentTab: 0, isLoading: true },

  onShow() {
    const isSuper = wx.getStorageSync('isSuperAdmin');
    const user = wx.getStorageSync('currentUser');
    
    if (!isSuper && user?.Permission !== 2 && user?.Permission !== 3) {
      wx.showToast({ title: '非法越权访问！', icon: 'error' });
      setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000);
      return; 
    }
    this.fetchReports();
  },

  switchTab(e: any) {
    const tab = Number(e.currentTarget.dataset.tab);
    if (this.data.currentTab === tab) return;
    this.setData({ currentTab: tab, isLoading: true });
    this.fetchReports();
  },

  formatTime: (d: any) => d ? (() => {
    const dt = new Date(d);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  })() : '',

  async fetchReports() {
    this.setData({ isLoading: true });
    try {
      const { data } = await db.collection('reports')
        .where({ status: this.data.currentTab === 0 ? 0 : _.in([1, 2]) })
        .orderBy('createTime', 'desc').limit(50).get();

      const postIds = [...new Set(data.map(r => r.postId).filter(Boolean))];
      const postsMap: Record<string, any> = {};
      
      if (postIds.length) {
        const { data: posts } = await db.collection('timeline_posts').where({ _id: _.in(postIds) }).get();
        posts.forEach(p => postsMap[p._id] = { content: p.content || '[图片/视频动态]', authorOpenId: p._openid || p.authorUID });
      }

      const stsMap: Record<number, string> = { 0: '待核实', 1: '已核实(违规)', 2: '已驳回(正常)' };
      const clrMap: Record<string, string> = { '垃圾广告': 'gray', '色情低俗': 'red', '政治敏感': 'red', '人身攻击': 'yellow', '造谣传谣': 'yellow', '泄露隐私': 'yellow', '其他': 'gray' };

      this.setData({
        reportList: data.map(i => {
          const p = postsMap[i.postId] || {};
          return { ...i, fmtTime: this.formatTime(i.createTime), safeStatus: i.status || 0, statusText: stsMap[i.status || 0] || '未知状态', colorTag: clrMap[i.reason] || 'gray', postPreview: p.content || '该动态已被删除或无法读取', postAuthorOpenId: p.authorOpenId || '' };
        }),
        isLoading: false
      });
    } catch {
      wx.showToast({ title: '拉取失败', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  goToPostDetail(e: any) {
    const id = e.currentTarget.dataset.postid;
    if (!id) return wx.showToast({ title: '动态ID丢失', icon: 'none' });
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` });
  },

  onVerifyReport(e: any) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '确认核实违规？',
      content: '这将自动把该动态标记为“未通过”并隐藏，同时向举报人和动态作者发送信箱通知。',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '执行中...', mask: true });

        try {
          const txt = '经核实存在违规，已对违规内容进行下架处理。';
          await db.collection('reports').doc(item._id).update({ data: { status: 1, handleResult: txt, updateTime: db.serverDate() } });
          if (item.postId) await db.collection('timeline_posts').doc(item.postId).update({ data: { status: 2 } });

          const tasks = [];
          if (item._openid) {
            tasks.push(db.collection('user_notifications').add({ data: { targetOpenId: item._openid, title: '举报核实成功', content: `您举报的用户【${item.reportedName || '未知'}】涉嫌【${item.reason}】，经核实确实违规，原帖已被下架处理。感谢您对社区环境的维护！`, type: 'system_notification', subType: 'report', isDeleted: false, isRead: false, createTime: db.serverDate() } }));
          }
          if (item.postAuthorOpenId) {
            tasks.push(db.collection('user_notifications').add({ data: { targetOpenId: item.postAuthorOpenId, title: '内容违规下架通知', content: `您的动态因涉嫌【${item.reason}】被用户举报。经核实确认违规，目前动态已被打回（转为未通过状态）。请遵守社区规范，共同维护良好氛围。`, type: 'system_notification', subType: 'report', isDeleted: false, isRead: false, createTime: db.serverDate() } }));
          }
          await Promise.all(tasks);

          wx.hideLoading(); wx.showToast({ title: '已下架并通知', icon: 'success' });
          this.fetchReports(); 
        } catch { wx.hideLoading(); wx.showToast({ title: '执行失败', icon: 'none' }); }
      }
    });
  },

  onRejectReport(e: any) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '驳回举报', content: '', editable: true, placeholderText: '选填：驳回理由（将发送给举报人看）',
      success: async (res) => {
        if (res.confirm && res.content !== undefined) {
          wx.showLoading({ title: '驳回中...', mask: true });
          const txt = `经核实未发现违规，已驳回。管理员附言：${res.content.trim() || '未发现明显违规内容。'}`;

          try {
            await db.collection('reports').doc(item._id).update({ data: { status: 2, handleResult: txt, updateTime: db.serverDate() } });
            
            if (item._openid) {
              await db.collection('user_notifications').add({ data: { targetOpenId: item._openid, title: '举报处理结果（未违规）', content: `您举报的用户【${item.reportedName || '未知'}】涉嫌【${item.reason}】，管理员已核查。处理结果：${txt}\n感谢您的热心反馈。`, type: 'system_notification', subType: 'report', isDeleted: false, isRead: false, createTime: db.serverDate() } });
            }

            wx.hideLoading(); wx.showToast({ title: '已驳回', icon: 'success' });
            this.fetchReports();
          } catch { wx.hideLoading(); wx.showToast({ title: '驳回失败', icon: 'none' }); }
        }
      }
    });
  }
});