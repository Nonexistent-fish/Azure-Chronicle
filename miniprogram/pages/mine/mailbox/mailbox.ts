import { xpToLevel } from '../../../utils/levelUtils';

export {};
const db = wx.cloud.database();
const _ = db.command;

Page<any, any>({
  data: {
    requests: [] as any[], activeId: null as string | null, activeRewardId: null as string | null,
    progressPercent: 0, showCapacity: false, isShaking: false, maxCapacity: 20,
    icons: {
      wechatBlue: "/assets/icons/wechat_blue.png", wechatGray: "/assets/icons/wechat.png", qqBlue: "/assets/icons/QQ_blue.png", qqGray: "/assets/icons/QQ.png",
      phoneBlue: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTg5MGZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iNSIgeT0iMiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjIwIiByeD0iMiIgcnk9IjIiLz48bGluZSB4MT0iMTIiIHkxPSIxOCIgeDI9IjEyLjAxIiB5Mj0iMTgiLz48L3N2Zz4=",
      phoneGray: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjODg4ODg4IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iNSIgeT0iMiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjIwIiByeD0iMiIgcnk9IjIiLz48bGluZSB4MT0iMTIiIHkxPSIxOCIgeDI9IjEyLjAxIiB5Mj0iMTgiLz48L3N2Zz4=",
      mail: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgNGgxNmMxLjEgMCAyIC45IDIgMnYxMmMwIDEuMS0uOSAyLTIgMkg0Yy0xLjEgMC0yLS45LTItMlY2YzAtMS4xLjktMiAyLTJ6Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjIsNiAxMiwxMyAyLDYiLz48L3N2Zz4=",
      copy: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSI5IiB5PSI5IiB3aWR0aD0iMTMiIGhlaWdodD0iMTMiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxwYXRoIGQ9Ik01IDE1SDRhMiAyIDAgMCAxLTItMlY0YTIgMiAwIDAgMSAyLTJoOWEyIDIgMCAwIDEgMiAydjEiPjwvcGF0aD48L3N2Zz4=",
      report: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmY0ZDRmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEwLjI5IDMuODZMMi44MyAxOC4xYTggOCAwIDAgMCAyLjgyIDIuODJoMTIuN2E4IDggMCAwIDAgMi44Mi0yLjgyTDEzLjcxIDMuODZhMiAyIDAgMCAwLTMuNDIgMHoiLz48bGluZSB4MT0iMTIiIHkxPSI5IiB4Mj0iMTIiIHkyPSIxMyIvPjxsaW5lIHgxPSIxMiIgeTE9IjE3IiB4Mj0iMTIuMDEiIHkyPSIxNyIvPjwvc3ZnPg==",
      systemLogo: "/assets/icons/青笺拾光logo缩.jpg", 
    },
    randomPhrases: ["我觉得你很有趣，能交换下联系方式吗？", "同学你好，感觉你发的动态挺有共鸣的，可以认识下吗？", "看了你的主页，想和你交流一下学习心得~"]
  },

  onShow() {
    const cached = wx.getStorageSync('mailbox_cache_list');
    if (cached?.length) this.setData({ requests: cached, progressPercent: (cached.length / this.data.maxCapacity) * 100 });
    wx.setStorageSync('last_mailbox_visit', Date.now());
    const currentUser = wx.getStorageSync('currentUser');
    if (currentUser?._id) wx.cloud.callFunction({ name: 'userService', data: { action: 'updateMailboxTime', userId: currentUser._id } }).catch(() => {});
    this.fetchRequests();
  },

  async fetchRequests() {
    const user = wx.getStorageSync('currentUser');
    const myOpenId = wx.getStorageSync('realOpenID') || user?._openid;
    if (!myOpenId) return;

    const lv = xpToLevel(user.xp || 0).level;
    const maxCap = lv >= 5 ? 30 : (lv >= 3 ? 25 : 20);
    this.setData({ maxCapacity: maxCap });
    const myContacts = [!!user.phoneNumber?.trim(), !!user.wechatId?.trim(), !!user.qqId?.trim()];

    try {
      const [exRes, notifRes, bugRes] = await Promise.all([
        db.collection('contact_exchanges').where(_.or([{ from_openid: myOpenId }, { to_openid: myOpenId }])).orderBy('createTime', 'desc').limit(40).get(),
        db.collection('user_notifications').where(_.and([_.or([{ _openid: myOpenId }, { targetOpenId: myOpenId }]), { isDeleted: false }])).orderBy('createTime', 'desc').limit(50).get(),
        db.collection('feedback_reports').where({ _openid: myOpenId }).orderBy('createTime', 'desc').limit(30).get()
      ]);

      const now = Date.now();
      let mixed: any[] = [];

      exRes.data.forEach((doc: any) => {
        if (doc.hiddenBy?.includes(myOpenId)) return;
        const isSender = doc.fromUID ? doc.fromUID === user._id : doc.from_openid === myOpenId && doc.toName !== user.nickName;
        const iTime = (doc.updateTime || doc.createTime).getTime();
        let status = ((doc.status === 0 || doc.status === 1) && now - iTime > 604800000) ? 3 : doc.status;
        const content = doc.exchange_content || doc.exchangeContent || [];
        const showInfo = status === 1 && (now - iTime < 21600000);

        mixed.push({
          ...doc, type: 'exchange', status, isSender, isExpired: status === 3, isRejected: status === 2, isGray: status >= 2,
          isReported: false, randomMsg: this.data.randomPhrases[Math.floor(Math.random() * this.data.randomPhrases.length)],
          updateTime: doc.updateTime || doc.createTime, senderInfo: { avatar: doc.fromAvatar, nickName: doc.fromName },
          targetInfo: { avatar: doc.toAvatar, nickName: doc.toName }, tempSelected: [false, false, false], selectedCount: 0, showContactInfo: showInfo,
          intersection: [myContacts[0] && content.includes(0), myContacts[1] && content.includes(1), myContacts[2] && content.includes(2)],
          showPhone: showInfo && content.includes(0), showWechat: showInfo && content.includes(1), showQQ: showInfo && content.includes(2)
        });
      });

      const needContacts = mixed.filter(m => m.type === 'exchange' && m.status <= 1);
      if (needContacts.length) {
        const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'getPeersContacts', peerIds: needContacts.map(m => m.isSender ? m.to_openid : m.from_openid) } }) as any;
        const peerMap = (result?.data || []).reduce((acc: any, p: any) => ({ ...acc, [p._openid]: p }), {});
        needContacts.forEach(m => {
          const pData = peerMap[m.isSender ? m.to_openid : m.from_openid];
          if (pData && m.status === 1) {
            const t = m.isSender ? m.targetInfo : m.senderInfo;
            const c = m.exchange_content || m.exchangeContent || [];
            if (c.includes(0)) t.phone = pData.phoneNumber; if (c.includes(1)) t.wechat = pData.wechatId; if (c.includes(2)) t.qq = pData.qqId;
          }
        });
      }

      let unreadNotifIds: string[] = [], unreadBugIds: string[] = [];
      notifRes.data.forEach((n: any) => {
        if (['bug', 'report'].includes(n.subType)) return;
        if (!n.isRead) unreadNotifIds.push(n._id);
        if (['reward', 'cdk'].includes(n.subType) && n.content) n.content = n.content.replace(/\[([^\]]*?)\]/g, (m: string, p: string) => `[${p.replace(/\n|\\n/g, '')}]`);
        mixed.push({ ...n, isGray: ['cdk', 'reward'].includes(n.subType) ? n.isClaimed === true : n.isRead });
      });

      const bugStatusMap: Record<number, string> = { 0: '待处理', 1: '处理中', 2: '已解决', 3: '未复现' };
      bugRes.data.filter((b: any) => !b.isHiddenInMailbox).slice(0, 20).forEach((b: any) => {
        if (!b.isRead) unreadBugIds.push(b._id);
        mixed.push({ ...b, type: 'my_feedback', isReport: !!(b.type === 'report' || b.reason), isGray: b.isRead, statusText: bugStatusMap[b.status || 0] || '待处理', content: b.description || b.detail || b.content || '无详情', updateTime: b.updateTime || b.createTime, isDeleting: false });
      });

      mixed.sort((a, b) => new Date(b.updateTime || b.createTime).getTime() - new Date(a.updateTime || a.createTime).getTime());
      mixed.forEach(item => item.relativeTime = this.formatRelativeTime(item.updateTime || item.createTime));
      mixed = mixed.slice(0, maxCap);

      this.setData({ requests: mixed, progressPercent: (mixed.length / maxCap) * 100 });
      wx.setStorageSync('mailbox_cache_list', mixed);
      wx.stopPullDownRefresh();

      if (unreadNotifIds.length || unreadBugIds.length) wx.cloud.callFunction({ name: 'userService', data: { action: 'markAllAsRead' } }).catch(() => {});
    } catch { wx.stopPullDownRefresh(); }
  },

  onNavigateToPost(e: any) {
    const { id, type, notifid, targettype, istopic } = e.currentTarget.dataset; 
    if (!id) return;
    if (notifid && type !== 'my_feedback') this.setData({ requests: this.data.requests.map((r: any) => r._id === notifid ? { ...r, isGray: true } : r) });
    if (type === 'my_feedback') return;
    wx.navigateTo({ url: (targettype === 'daily_topic' || istopic) ? `/pages/index/daily-topic/daily-topic?id=${id}` : `/pages/post-detail/post-detail?id=${id}` });
  },

  onCleanMailbox() {
    const ex: string[] = [], nf: string[] = [], fb: string[] = [], idxs: number[] = [];
    this.data.requests.forEach((r: any, i: number) => {
      if (r.isGray) { r.type === 'exchange' ? ex.push(r._id) : (r.type === 'my_feedback' ? fb.push(r._id) : nf.push(r._id)); idxs.push(i); }
    });
    if (!idxs.length) return wx.showToast({ title: '没有可清理的卡片', icon: 'none' });

    wx.vibrateShort({ type: 'heavy' });
    const reqs = [...this.data.requests];
    idxs.forEach((idx, i) => { reqs[idx].isDeleting = true; reqs[idx].delay = (idxs.length - 1 - i) * 80; });
    this.setData({ isShaking: true, requests: reqs });

    const p = [];
    if (nf.length) p.push(Promise.all(nf.map(id => db.collection('user_notifications').doc(id).update({ data: { isDeleted: true } }))));
    if (fb.length) p.push(Promise.all(fb.map(id => db.collection('feedback_reports').doc(id).update({ data: { isHiddenInMailbox: true } }))));
    if (ex.length) p.push(wx.cloud.callFunction({ name: 'userService', data: { action: 'hideExchanges', ids: ex } }));

    Promise.all(p).then(() => setTimeout(() => {
      const clean = this.data.requests.filter((r: any) => !r.isDeleting);
      this.setData({ requests: clean, isShaking: false, progressPercent: (clean.length / this.data.maxCapacity) * 100 });
      wx.setStorageSync('mailbox_cache_list', clean);
      wx.showToast({ title: '清理完毕', icon: 'none' });
      this.fetchRequests();
    }, 400 + idxs.length * 80));
  },

  copyContent(e: any) { wx.setClipboardData({ data: e.currentTarget.dataset.content }); },
  toggleCapacity() { this.setData({ showCapacity: !this.data.showCapacity }); },
  onAcceptClick(e: any) { this.setData({ activeId: e.currentTarget.dataset.id }); },
  cancelSelection() { this.setData({ activeId: null }); },

  toggleOption(e: any) {
    const { id, idx } = { id: e.currentTarget.dataset.id, idx: parseInt(e.currentTarget.dataset.idx) };
    const rIdx = this.data.requests.findIndex((r: any) => r._id === id);
    if (rIdx === -1) return;

    const req = this.data.requests[rIdx];
    const u = wx.getStorageSync('currentUser');
    if (![!!u.phoneNumber, !!u.wechatId, !!u.qqId][idx]) return wx.showToast({ title: '你未绑定该项联系方式', icon: 'none' });
    if (!(req.exchange_content || req.exchangeContent || []).includes(idx)) return wx.showToast({ title: '对方未提供该方式', icon: 'none' });

    const sel = [...req.tempSelected]; sel[idx] = !sel[idx];
    this.setData({ [`requests[${rIdx}].tempSelected`]: sel, [`requests[${rIdx}].selectedCount`]: sel.filter(v => v).length });
  },

  async submitExchange() {
    const rIdx = this.data.requests.findIndex((r: any) => r._id === this.data.activeId);
    if (rIdx === -1) return;
    const content = this.data.requests[rIdx].tempSelected.map((v: boolean, i: number) => v ? i : -1).filter((v: number) => v !== -1);
    if (!content.length) return wx.showToast({ title: '请至少选择一项', icon: 'none' });

    const id = this.data.activeId;
    this.setData({ activeId: null, [`requests[${rIdx}].status`]: 1, [`requests[${rIdx}].showContactInfo`]: true });
    wx.showLoading({ title: '交换中...', mask: true });

    try {
      const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'handleMail', requestId: id, status: 1, exchangeContent: content } }) as any;
      if (result?.success === false) throw new Error(result.msg);
      wx.hideLoading(); wx.showToast({ title: '互换成功' }); setTimeout(() => this.fetchRequests(), 1000);
    } catch {
      wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' });
      this.setData({ [`requests[${rIdx}].status`]: 0, [`requests[${rIdx}].showContactInfo`]: false });
    }
  },

  async onReject(e: any) {
    const id = e.currentTarget.dataset.id;
    const rIdx = this.data.requests.findIndex((r: any) => r._id === id);
    this.setData({ [`requests[${rIdx}].status`]: 2 });
    try {
      await wx.cloud.callFunction({ name: 'userService', data: { action: 'handleMail', requestId: id, status: 2, exchangeContent: [] } });
      wx.showToast({ title: '已婉拒', icon: 'none' }); setTimeout(() => this.fetchRequests(), 1000);
    } catch { wx.showToast({ title: '操作失败', icon: 'none' }); this.setData({ [`requests[${rIdx}].status`]: 0 }); }
  },

  onReportUser(e: any) {
    const { id, reportedName, reportedOpenid } = e.currentTarget.dataset;
    const rIdx = this.data.requests.findIndex((r: any) => r._id === id);
    if (rIdx === -1 || this.data.requests[rIdx].isReported) return;
    const u = wx.getStorageSync('currentUser');

    wx.showModal({ title: '举报确认', content: `确认要举报 ${reportedName} 提供的联系方式为虚假信息吗？`, confirmColor: '#ff4d4f', success: async (res) => {
      if (res.confirm) {
        this.setData({ [`requests[${rIdx}].isReported`]: true });
        try {
          await db.collection('reports').add({ data: { postId: id, reportedOpenId: reportedOpenid, reportedName, reason: 'fake_info', detail: `[信箱举报] 用户 ${u.nickName} 举报 ${reportedName} 提供的联系方式为虚假信息。`, status: 0, reporterName: u.nickName || '匿名用户', createTime: db.serverDate(), createdAt: db.serverDate() } });
          wx.showToast({ title: '已受理', icon: 'success' });
        } catch {}
      }
    }});
  },

  formatRelativeTime(date: any) {
    if (!date) return '';
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
  },

  onCardTap(e: any) { ['reward', 'cdk'].includes(e.currentTarget.dataset.subtype) ? this.onToggleReward(e) : this.onNavigateToPost(e); },
  onToggleReward(e: any) { const id = e.currentTarget.dataset.notifid; this.setData({ activeRewardId: this.data.activeRewardId === id ? null : id }); },

  async onConfirmReward(e: any) {
    const id = e.currentTarget.dataset.notifid;
    const rIdx = this.data.requests.findIndex((r: any) => r._id === id);
    if (rIdx === -1) return;
    this.setData({ [`requests[${rIdx}].isGray`]: true, activeRewardId: null });
    wx.showToast({ title: '已确认', icon: 'success' });
    try { await db.collection('user_notifications').doc(id).update({ data: { isClaimed: true } }); } catch {}
  }
});