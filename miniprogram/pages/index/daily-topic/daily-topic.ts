export {};
const db = wx.cloud.database();
const _ = db.command;

let chargeTimer: number | null = null;

const DEFAULT_BGS: Record<string, string[]> = {
  love: ['cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/love1.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/love2.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/love3.jpg'], 
  study: ['cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/study1.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/study2.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/study3.jpg'], 
  life: ['cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/life1.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/life2.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/life3.jpg'], 
  job: ['cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/job1.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/job2.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/job3.jpg'], 
  socialize: ['cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/socialize1.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/socialize2.jpg', 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/daily-topic/socialize3.jpg'] 
};

Page<any, any>({
  data: {
    topicId: '', topic: { topicType: 'battle' } as any, votedOption: '', 
    percentAStr: '50%', percentBStr: '50%', chargePercentRed: '0%', chargePercentBlue: '0%', chargingOption: '', chargePercent: 0,   
    letters: ['A', 'B', 'C', 'D', 'E'], choicePercents: [] as string[], choiceCounts: [] as number[], chargingChoiceIndex: -1, 
    isSubmitting: false, comments: [] as any[], commentText: '', isSubmittingComment: false, replyParentId: '', replyTargetName: '', inputFocus: false,      
    currentUserAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', currentUserNickName: '某同学',
    showProfilePopup: false, currentProfile: null as any, currentOpenId: '', isAdmin: false 
  },

  onLoad(options: any) {
    const user = wx.getStorageSync('currentUser');
    if (user) this.setData({ currentUserAvatar: user.weiXinAvatar || this.data.currentUserAvatar, currentUserNickName: user.nickName || '某同学', currentOpenId: wx.getStorageSync('realOpenID') || user._openid || '' });
    this.setData({ isAdmin: wx.getStorageSync('isSuperAdmin') || false });

    if (options.id) {
      this.setData({ topicId: options.id, topic: { topicType: options.type || 'battle' } });
      this.fetchTopicData(); this.fetchComments();
    } else {
      wx.showToast({ title: '话题走丢了', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  goToHistory() { wx.navigateTo({ url: '/pages/index/daily-topic-history/daily-topic-history' }); },

  async fetchTopicData() {
    try {
      const { data: topic } = await db.collection('daily_topics').doc(this.data.topicId).get();
      if (!topic || topic.status !== 1) {
        wx.showToast({ title: '话题已过期', icon: 'none', duration: 1500, mask: true });
        return setTimeout(() => wx.navigateBack(), 1500);
      }
      
      if (!topic.bgImageUrl) {
        const bgArray = DEFAULT_BGS[topic.category || '']; 
        topic.bgImageUrl = bgArray?.length ? bgArray[(topic._id || this.data.topicId || 'default').split('').reduce((a, b) => a + b.charCodeAt(0), 0) % bgArray.length] : '';
      }

      const user = wx.getStorageSync('currentUser');
      const voted = user?._id ? (wx.getStorageSync(`topic_vote_${topic._id}_${user._id}`) || '') : '';

      this.setData({ topic, votedOption: voted });
      this.calculatePercent(topic, !!voted);
    } catch (e) {
      wx.showToast({ title: '话题已失效', icon: 'none', duration: 1500, mask: true });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  calculatePercent(topic: any, showReal: boolean = false) {
    if (topic.topicType === 'choice') {
      const counts = Array.from({ length: topic.choices?.length || 0 }, (_, i) => topic[`votesC${i}`] || 0);
      const total = counts.reduce((a, b) => a + b, 0);
      this.setData({ choicePercents: counts.map(c => !showReal || !total ? '0%' : Math.round((c / total) * 100) + '%'), choiceCounts: counts });
    } else {
      if (!showReal) return this.setData({ percentAStr: '50%', percentBStr: '50%' });
      const total = (topic.votesA || 0) + (topic.votesB || 0);
      const pA = total ? Math.round(((topic.votesA || 0) / total) * 100) : 50;
      this.setData({ percentAStr: pA + '%', percentBStr: (100 - pA) + '%' });
    }
  },

  onVoteStart(e: any) {
    if (!wx.getStorageSync('currentUser')?._id) return wx.showModal({ title: '提示', content: '请先绑定身份！', showCancel: false });
    if (this.data.votedOption || this.data.isSubmitting) return;

    const option = e.currentTarget.dataset.option;
    this.setData({ chargingOption: option, chargePercent: 0 });
    wx.vibrateShort({ type: 'medium' });

    chargeTimer = setInterval(() => {
      let pct = this.data.chargePercent + 5;
      if (pct % 20 === 0) wx.vibrateShort({ type: 'light' });
      if (pct >= 100) { pct = 100; this.executeBattleVote(option); }
      this.setData({ chargePercent: pct, chargePercentRed: option === 'A' ? pct + '%' : '0%', chargePercentBlue: option === 'B' ? pct + '%' : '0%' });
    }, 20) as unknown as number;
  },

  onVoteEnd() {
    if (this.data.isSubmitting) return; 
    if (chargeTimer) clearInterval(chargeTimer);
    if (this.data.chargePercent < 100) this.setData({ chargePercent: 0, chargingOption: '', chargePercentRed: '0%', chargePercentBlue: '0%' });
  },

  async executeBattleVote(option: string) {
    if (chargeTimer) clearInterval(chargeTimer);
    this.setData({ isSubmitting: true });
    wx.vibrateLong(); 

    const fakeTopic = { ...this.data.topic };
    const incKey = option === 'A' ? 'votesA' : 'votesB';
    fakeTopic[incKey] = (fakeTopic[incKey] || 0) + 1;
    this.setData({ votedOption: option, topic: fakeTopic, chargePercent: 0, chargingOption: '', chargePercentRed: '0%', chargePercentBlue: '0%' });
    this.calculatePercent(fakeTopic, true);

    try { 
      const res: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'voteTopic', topicId: this.data.topicId, topicType: 'battle', option } });
      if (!res.result?.success) throw new Error('云端失败');
      wx.setStorageSync(`topic_vote_${this.data.topicId}_${wx.getStorageSync('currentUser')._id}`, option);
      wx.showToast({ title: '投票成功！', icon: 'none' }); 
    } catch {
      this.setData({ votedOption: '', topic: this.data.topic });
      this.calculatePercent(this.data.topic, false);
      wx.showToast({ title: '网络异常，投票失败', icon: 'none' });
    } finally { this.setData({ isSubmitting: false }); }
  },

  onChoiceVoteStart(e: any) {
    if (!wx.getStorageSync('currentUser')?._id) return wx.showModal({ title: '提示', content: '请先绑定身份！', showCancel: false });
    if (this.data.votedOption || this.data.isSubmitting) return;

    const index = e.currentTarget.dataset.index;
    this.setData({ chargingChoiceIndex: index, chargePercent: 0 });
    wx.vibrateShort({ type: 'medium' });

    chargeTimer = setInterval(() => {
      let pct = this.data.chargePercent + 5;
      if (pct % 20 === 0) wx.vibrateShort({ type: 'light' });
      if (pct >= 100) { pct = 100; this.executeChoiceVote(index); }
      this.setData({ chargePercent: pct });
    }, 20) as unknown as number;
  },

  onChoiceVoteEnd() {
    if (this.data.isSubmitting) return; 
    if (chargeTimer) clearInterval(chargeTimer);
    if (this.data.chargePercent < 100) this.setData({ chargePercent: 0, chargingChoiceIndex: -1 }); 
  },

  async executeChoiceVote(index: number) {
    if (chargeTimer) clearInterval(chargeTimer);
    this.setData({ isSubmitting: true, chargePercent: 0, chargingChoiceIndex: -1 });
    wx.vibrateLong();

    const letter = this.data.letters[index];
    const fakeTopic = { ...this.data.topic };
    fakeTopic[`votesC${index}`] = (fakeTopic[`votesC${index}`] || 0) + 1;
    
    this.setData({ votedOption: letter, topic: fakeTopic });
    this.calculatePercent(fakeTopic, true);

    try {
      const res: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'voteTopic', topicId: this.data.topicId, topicType: 'choice', choiceIndex: index } });
      if (!res.result?.success) throw new Error('云端失败');
      wx.setStorageSync(`topic_vote_${this.data.topicId}_${wx.getStorageSync('currentUser')._id}`, letter);
      wx.showToast({ title: '选择成功！', icon: 'none' });
    } catch {
      this.setData({ votedOption: '', topic: this.data.topic });
      this.calculatePercent(this.data.topic, false);
      wx.showToast({ title: '网络异常，选择失败', icon: 'none' });
    } finally { this.setData({ isSubmitting: false }); }
  },

  formatRelativeTime(dateStr: any) {
    if (!dateStr) return '刚刚';
    const targetTime = typeof dateStr === 'string' ? dateStr.replace(/-/g, '/') : dateStr;
    const diff = (Date.now() - new Date(targetTime).getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  },

  async fetchComments() {
    try {
      const openId = this.data.currentOpenId;
      const [commentsRes, myLikesRes] = await Promise.all([
        db.collection('timeline_comments').where({ postId: this.data.topicId }).orderBy('likes', 'desc').orderBy('createTime', 'desc').get(),
        db.collection('timeline_comment_likes').where({ postId: this.data.topicId, _openid: openId ? _.in([openId, '{openid}']) : '{openid}' }).get()
      ]);

      const myLikedIds = myLikesRes.data.map((l: any) => l.commentId); 
      const subs = commentsRes.data.filter((c: any) => c.parentId);

      const processLabel = (c: any) => {
        if (!c.voteSide) return { tagText: '', tagClass: '' };
        if (this.data.topic.topicType === 'battle') return { tagText: c.voteSide === 'A' ? 'RED' : 'BLUE', tagClass: c.voteSide === 'A' ? 'tag-red' : 'tag-blue' };
        return { tagText: c.voteSide, tagClass: 'tag-choice' };
      };

      this.setData({
        comments: commentsRes.data.filter((c: any) => !c.parentId).map((m: any) => {
          const mTags = processLabel(m);
          return {
            ...m, tagText: mTags.tagText, tagClass: mTags.tagClass, cleanContent: m.content, prefixType: mTags.tagText,
            time: this.formatRelativeTime(m.createTime), nickName: m.author?.nickName || '神秘同学', avatar: m.author?.avatar || this.data.currentUserAvatar,
            Permission: m.author?.Permission || 0, authorUID: m.authorUID || '', hasLiked: myLikedIds.includes(m._id),
            subComments: subs.filter(sub => sub.parentId === m._id).sort((a,b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime()).map(sub => {
              const sTags = processLabel(sub);
              return { ...sub, tagText: sTags.tagText, tagClass: sTags.tagClass, cleanContent: sub.content, prefixType: sTags.tagText, avatar: sub.author?.avatar, nickName: sub.author?.nickName, Permission: sub.author?.Permission || 0, time: this.formatRelativeTime(sub.createTime), hasLiked: myLikedIds.includes(sub._id) };
            })
          };
        })
      });
    } catch {}
  },

  onReplyClick(e: any) { 
    if (!wx.getStorageSync('currentUser')) return wx.showModal({ title: '提示', content: '请先绑定身份', showCancel: false });
    this.setData({ replyParentId: e.currentTarget.dataset.id, replyTargetName: e.currentTarget.dataset.name, inputFocus: true });
  },

  onCommentInput(e: any) { this.setData({ commentText: e.detail.value }); },
  onInputBlur() { if (!this.data.commentText.trim()) this.setData({ replyParentId: '', replyTargetName: '' }); },

  async submitComment() {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showModal({ title: '提示', content: '绑定身份后即可参与评论！', success: (res) => res.confirm && wx.switchTab({ url: '/pages/mine/mine' }) });
    
    let content = this.data.commentText.trim();
    if (!content || this.data.isSubmittingComment) return;

    wx.vibrateShort({ type: 'light' });
    this.setData({ isSubmittingComment: true });

    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: content } });
      if (textCheck.result?.isRisky) return this.setData({ isSubmittingComment: false }), wx.showToast({ title: '内容含违规词汇', icon: 'none' });

      const voteSide = (!this.data.replyParentId && this.data.votedOption) ? this.data.votedOption : "";
      const displayPrefix = (voteSide && this.data.topic.topicType === 'battle') ? (voteSide === 'A' ? 'RED' : 'BLUE') : voteSide;

      const newCmt = { _id: 'temp_' + Date.now(), nickName: user.nickName || this.data.currentUserNickName, avatar: user.weiXinAvatar || this.data.currentUserAvatar, Permission: user.Permission || 0, authorUID: user._id, cleanContent: content, prefixType: displayPrefix, time: '刚刚', likes: 0, hasLiked: false, subComments: [] as any[] };
      let updated = [...this.data.comments];

      if (this.data.replyParentId) {
        const pIdx = updated.findIndex(c => c._id === this.data.replyParentId);
        if (pIdx > -1) { (newCmt as any).replyToName = this.data.replyTargetName; updated[pIdx].subComments.unshift(newCmt); }
      } else updated.unshift(newCmt);

      this.setData({ comments: updated, commentText: '', replyParentId: '', replyTargetName: '', inputFocus: false, isSubmittingComment: false });
      wx.showToast({ title: '发送成功', icon: 'success' });

      wx.cloud.callFunction({ name: 'postService', data: { action: 'addComment', postId: this.data.topicId, parentId: this.data.replyParentId || "", replyToName: this.data.replyTargetName || "", content, uid: user._id, voteSide, author: { nickName: user.nickName || this.data.currentUserNickName, avatar: user.weiXinAvatar || this.data.currentUserAvatar, Permission: user.Permission || 0 } } }).catch(()=>{});
    } catch {
      this.setData({ isSubmittingComment: false });
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  onDeleteComment(e: any) { 
    wx.showModal({
      title: '删除评论', content: '确定要删除这条内容吗？', confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '清理中' });
        try {
          const id = e.currentTarget.dataset.id;
          await db.collection('timeline_comments').doc(id).remove();
          
          const { data: subs } = await db.collection('timeline_comments').where({ parentId: id }).get();
          const subIds = subs.map((sub: any) => sub._id);
          if (subIds.length) await Promise.all(subIds.map((sid: string) => db.collection('timeline_comments').doc(sid).remove()));

          wx.cloud.callFunction({ name: 'postService', data: { action: 'deleteCommentNotifs', commentIds: [id, ...subIds] } }).catch(()=>{});

          let updated = [...this.data.comments];
          for (let i = 0; i < updated.length; i++) {
            if (updated[i]._id === id) { updated.splice(i, 1); break; }
            const sIdx = updated[i].subComments.findIndex((s: any) => s._id === id);
            if (sIdx > -1) { updated[i].subComments.splice(sIdx, 1); break; }
          }
          
          this.setData({ comments: updated }); 
          wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' });
        } catch { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); }
      }
    });
  },

  async onLikeComment(e: any) { this.handleUniversalLike(e, 'main'); },
  async onLikeSubComment(e: any) { this.handleUniversalLike(e, 'sub'); },

  async handleUniversalLike(e: any, level: 'main' | 'sub') {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });
    if ((this as any)._isLiking) return; 
    
    (this as any)._isLiking = true; setTimeout(() => { (this as any)._isLiking = false; }, 800); 
    wx.vibrateShort({ type: 'light' });

    const { id, index, mindex, sindex } = e.currentTarget.dataset;
    const target = level === 'main' ? this.data.comments[index] : this.data.comments[mindex].subComments[sindex];
    const isLiked = target.hasLiked;
    const incVal = isLiked ? -1 : 1;
    
    level === 'main' ? this.setData({ [`comments[${index}].hasLiked`]: !isLiked, [`comments[${index}].likes`]: Math.max(0, (target.likes || 0) + incVal) }) : this.setData({ [`comments[${mindex}].subComments[${sindex}].hasLiked`]: !isLiked, [`comments[${mindex}].subComments[${sindex}].likes`]: Math.max(0, (target.likes || 0) + incVal) });
    
    try { 
      await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', type: 'comment_like', commentId: id, postId: this.data.topicId, count: incVal, uid: user._id, targetOpenId: target._openid || target.authorUID || '', likerName: user.nickName, likerAvatar: user.weiXinAvatar, postSnippet: target.content } });
    } catch {
      level === 'main' ? this.setData({ [`comments[${index}].hasLiked`]: isLiked, [`comments[${index}].likes`]: target.likes }) : this.setData({ [`comments[${mindex}].subComments[${sindex}].hasLiked`]: isLiked, [`comments[${mindex}].subComments[${sindex}].likes`]: target.likes });
    }
  },

  onAvatarClick(e: any) {
    const { source, mindex, sindex } = e.currentTarget.dataset;
    const target = source === 'main' ? this.data.comments[mindex] : this.data.comments[mindex].subComments[sindex];
    if (!target) return;
    if (target.isAnonymous) return wx.showToast({ title: '对方开启了匿名，无法查看名片', icon: 'none' });
    this.setData({ currentProfile: target, showProfilePopup: true });
  },

  closeProfilePopup() { this.setData({ showProfilePopup: false }); },
  preventTouchMove() { return; }
});