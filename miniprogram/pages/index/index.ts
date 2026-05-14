export {};
const app = getApp<any>(); 
const db = wx.cloud.database();
const _ = db.command;

const formatRelativeTime = (dateStr: any) => {
  if (!dateStr) return '刚刚';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
};

Page<any, any>({
  latestPostTime: '', oldestPostTime: '',

  data: {
    searchKeyword: '', 
    posts: [] as any[],
    page: 0, 
    pageSize: 10, 
    hasMore: true, 
    isLoading: false, 
    currentTab: 'recommend', 
    isSearchActive: false, 
    isSearchFloating: false, 
    banners: [] as any[], 
    notice: null as any, 
    showCommentDrawer: false, 
    currentPostId: '', 
    currentPostIndex: -1, 
    currentComments: [] as any[],
    commentText: '', 
    inputFocus: false, 
    replyParentId: '', 
    replyTargetName: '', 
    isSubmittingComment: false, 
    showProfilePopup: false, 
    currentProfile: null as any, 
    showActionSheet: false, 
    actionSheetPostId: '', 
    actionSheetPostIndex: -1, 
    currentUserAvatar: '', 
    currentUserNickName: '某同学', 
    currentUserId: '',
    dailyTopic: null as any, 
    topicVotedOption: '', 
    actionSheetPostOpenId: '', 
    actionSheetAuthorName: '', 
    searchBarTop: 0, 
    currentSwiperIndex: 0
  },

  onLoad() {
    this.getTabBar()?.setData({ isShow: true });
    const user = wx.getStorageSync('currentUser');
    if (user) this.updateUserInfo(user);
    this.setData({ searchBarTop: wx.getMenuButtonBoundingClientRect().bottom + 10 });
  },

  onShow() {
    this.getTabBar()?.setData({ isShow: true, selected: 0 });
    
    const deadId = wx.getStorageSync('dead_post_id');
    if (deadId) { 
      this.setData({ posts: this.data.posts.filter((p:any) => p._id !== deadId) }); 
      wx.removeStorageSync('dead_post_id'); 
    }
    
    const user = wx.getStorageSync('currentUser');
    if (user) {
      this.handleAuthCheck(user);
    } else {
      app.globalData.loginReadyCallback = (u: any) => this.handleAuthCheck(u);
      setTimeout(() => !wx.getStorageSync('currentUser') && this.handleAuthCheck(null), 3000);
    }
  },

  onSwiperChange(e: any) { 
    this.setData({ currentSwiperIndex: e.detail.current }); 
  },

  updateUserInfo(user: any) {
    if (this.data.currentUserId === user._id && this.data.currentUserNickName === user.nickName) return;
    this.setData({ 
      currentUserAvatar: user.weiXinAvatar || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', 
      currentUserNickName: user.nickName || '某同学', 
      currentUserId: user._id || '' 
    });
  },

  handleAuthCheck(user: any) {
    const s = user ? Number(user.registerStatus) : null;
    if (!user || (s !== 1 && s !== 3)) return wx.reLaunch({ url: '/pages/mine/tools/auth/auth' });
    this.updateUserInfo(user); 
    this.initMainContent(user);
  },

  initMainContent(user: any) {
    this.getTabBar()?.setData({ selected: 0, isShow: true });
    if (!this.data.posts.length) { 
      this.fetchBanners(); 
      this.fetchNotice(); 
      this.fetchPosts(true); 
    }
    this.checkDailySignIn(user); 
    this.refreshTopicState();
  },

  async fetchNotice() {
    try { 
      const { data } = await db.collection('home_notices').where({ isActive: true }).orderBy('createTime', 'desc').limit(1).get(); 
      this.setData({ notice: data[0] || null }); 
    } catch {}
  },

  onPreviewMedia(e: any) {
    const { current, postindex } = e.currentTarget.dataset;
    const post = this.data.posts[postindex];
    if (!post?.media?.length) return;
    const sources = post.media.map((m: any) => ({ 
      url: m.fileID, 
      type: m.fileType === 'video' ? 'video' : 'image', 
      poster: m.tempFilePath || '' 
    }));
    wx.previewMedia({ 
      sources, 
      current: Math.max(0, sources.findIndex((s: any) => s.url === current)) 
    });
  },

  async callPostService(params: any) {
    const hiddenIds = (wx.getStorageSync('tempHiddenPosts') || []).filter((p:any) => p.expireAt > Date.now()).map((p:any) => p.postId).slice(-100);
    const { result } = await wx.cloud.callFunction({ 
      name: 'postService', 
      data: { action: 'getPosts', daysLimit: params.keyword ? 365 : 60, hiddenIds, uid: this.data.currentUserId, limit: this.data.pageSize || 10, ...params } 
    }) as any;
    return result.data || [];
  },

  formatPosts(raw: any[]) {
    return raw.map(p => ({ 
      ...p, 
      relativeTime: formatRelativeTime(p.createTime), 
      media: (p.media || []).map((m:any) => ({ ...m, displayUrl: m.fileType === 'image' ? m.fileID : undefined })) 
    }));
  },

  renderPostsByTab(combined: any[], isRec: boolean) {
    const pin = combined.filter(p => p.isPinned);
    const norm = combined.filter(p => !p.isPinned).sort((a, b) => isRec ? Math.random() - 0.5 : new Date(b.createTime).getTime() - new Date(a.createTime).getTime());
    this.setData({ posts: [...pin, ...norm] });
  },

  async loadDailyTopic() {
    const now = new Date();
    const last7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 7 ? 1 : 0), 7).getTime();
    const cache = wx.getStorageSync('cache_daily_topic_base_v3');
    let topic: any = cache?.timestamp > last7AM ? { ...cache.topic } : null;

    if (!topic) {
      try {
        const { data } = await db.collection('daily_topics').where({ status: 1 }).orderBy('createTime', 'desc').limit(1).get();
        if (data.length) { 
          topic = data[0]; 
          topic.title = topic.title.replace(/^今日争议话题[：:]?\s*/, ''); 
          wx.setStorageSync('cache_daily_topic_base_v3', { topic, timestamp: now.getTime() }); 
        }
      } catch {}
    }
    if (!topic) return this.setData({ dailyTopic: null });

    try {
      if (['none', 'choice'].includes(topic.topicType)) {
        const { data } = await db.collection('timeline_comments').where({ postId: topic._id }).orderBy('likes', 'desc').limit(1).get();
        if (data.length) topic.topComment = data[0];
      } else {
        const [cA, cB] = await Promise.all([
          db.collection('timeline_comments').where({ postId: topic._id, voteSide: 'A' }).orderBy('likes', 'desc').limit(1).get(), 
          db.collection('timeline_comments').where({ postId: topic._id, voteSide: 'B' }).orderBy('likes', 'desc').limit(1).get()
        ]);
        if (cA.data.length) topic.topCommentA = { nickName: cA.data[0].author?.nickName || '神秘同学', content: cA.data[0].content };
        if (cB.data.length) topic.topCommentB = { nickName: cB.data[0].author?.nickName || '神秘同学', content: cB.data[0].content };
      }
    } catch {}

    const uid = this.data.currentUserId || wx.getStorageSync('currentUser')?._id;
    const voted = uid ? (wx.getStorageSync(`topic_vote_${topic._id}_${uid}`) || '') : '';
    this.setData({ topicVotedOption: voted, dailyTopic: this.formatTopicData(topic, voted) });
  },

  async fetchPosts(isRefresh = false) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    const keyword = this.data.searchKeyword.trim();
    const isRec = this.data.currentTab === 'recommend' && !keyword;
    
    if (isRefresh && isRec) {
      this.loadDailyTopic();
    }

    try {
      if (!this.latestPostTime) {
        const raw = await this.callPostService({ keyword, isRecommend: isRec });
        if (raw.length) { 
          this.latestPostTime = raw[0].createTime; 
          this.oldestPostTime = raw[raw.length - 1].createTime; 
          this.renderPostsByTab(this.formatPosts(raw), isRec); 
        }
        this.setData({ isLoading: false, hasMore: raw.length === (this.data.pageSize || 10) });
        return;
      }

      if (isRefresh) {
        const rawNew = await this.callPostService({ latestPostTime: this.latestPostTime, keyword, isRecommend: isRec });
        let current = [...this.data.posts];
        if (rawNew.length) {
          this.latestPostTime = rawNew[0].createTime;
          const exist = new Set(current.map((p:any) => p._id));
          const uniq = rawNew.filter((p:any) => !exist.has(p._id));
          if (uniq.length) {
            current = [...this.formatPosts(uniq), ...current].slice(0, 100);
          }
        }
        
        const pin = current.filter((p:any) => p.isPinned);
        const norm = current.filter((p:any) => !p.isPinned).sort((a:any, b:any) => isRec ? Math.random() - 0.5 : new Date(b.createTime).getTime() - new Date(a.createTime).getTime());
        
        this.setData({ posts: [...pin, ...norm], isLoading: false, hasMore: true });
        return;
      }

      if (!this.data.hasMore || !this.oldestPostTime) {
        this.setData({ isLoading: false });
        return;
      }

      const rawOld = await this.callPostService({ oldestPostTime: this.oldestPostTime, keyword, isRecommend: isRec });
      
      if (rawOld.length) {
        this.oldestPostTime = rawOld[rawOld.length - 1].createTime;
        const exist = new Set(this.data.posts.map((p:any) => p._id));
        const uniq = rawOld.filter((p:any) => !exist.has(p._id));
        
        if (uniq.length) {
          const fmt = this.formatPosts(uniq);
          const addPin = fmt.filter((p:any) => p.isPinned);
          const addNorm = fmt.filter((p:any) => !p.isPinned).sort((a:any, b:any) => isRec ? Math.random() - 0.5 : new Date(b.createTime).getTime() - new Date(a.createTime).getTime());
          const oldPin = this.data.posts.filter((p:any) => p.isPinned);
          const oldNorm = this.data.posts.filter((p:any) => !p.isPinned);
          
          this.setData({ 
            posts: [...oldPin, ...addPin, ...oldNorm, ...addNorm], 
            isLoading: false, 
            hasMore: rawOld.length === (this.data.pageSize || 10) 
          });
        } else {
          this.setData({ isLoading: false, hasMore: rawOld.length === (this.data.pageSize || 10) });
        }
      } else {
        this.setData({ isLoading: false, hasMore: false });
      }
    } catch { 
      this.setData({ isLoading: false }); 
    }
  },

  onPullDownRefresh() {
    this.fetchBanners(); 
    this.fetchNotice(); 
    this.fetchPosts(true).finally(() => wx.stopPullDownRefresh());
  },
  
  onReachBottom() { 
    this.fetchPosts(false); 
  },

  switchTab(e: any) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.currentTab === tab) return;
    this.latestPostTime = ''; 
    this.oldestPostTime = '';
    this.setData({ currentTab: tab, hasMore: true, posts: [], isLoading: false });
    this.fetchPosts(true);
  },

  activateSearch() { 
    this.setData({ isSearchActive: true, isSearchFloating: true }); 
  },
  
  onIconClick() { 
    this.data.isSearchActive ? this.onSearchConfirm() : this.activateSearch(); 
  },

  async fetchBanners() {
    try {
      const { data } = await db.collection('home_banners').where({ isActive: true }).orderBy('sort', 'desc').get();
      let res = data.filter(b => b.targetType !== 'gacha');
      this.setData({ banners: res.length === 2 ? [...res, ...res.map(b => ({ ...b, _id: b._id + '_copy' }))] : res });
    } catch {}
  },

  onBannerClick(e: any) {
    const i = e.currentTarget.dataset.item;
    if (!i) return;
    if (i.targetUrl) return wx.navigateTo({ url: i.targetUrl.startsWith('/') ? i.targetUrl : '/' + i.targetUrl, fail: () => wx.switchTab({ url: i.targetUrl.split('?')[0] }) });
    if (!i.targetType || i.targetType === 'none') return;
    const map: any = { activity: `/pages/activity/activity?id=${i.targetId}`, post: `/pages/post-detail/post-detail?id=${i.targetId}`, mall: '/pages/mine/market/outfit/outfit' };
    map[i.targetType] ? wx.navigateTo({ url: map[i.targetType] }) : wx.showToast({ title: '精彩活动，敬请期待', icon: 'none' });
  },

  onSearchInput(e: any) { 
    this.setData({ searchKeyword: e.detail.value }); 
  },
  
  async onSearchConfirm() {
    (this as any).isConfirming = true; 
    setTimeout(() => (this as any).isConfirming = false, 300);
    
    if (!this.data.searchKeyword.trim()) {
      wx.showToast({ title: '请输入想看的内容', icon: 'none' });
      return this.setData({ isSearchFloating: true });
    }
    this.latestPostTime = ''; 
    this.oldestPostTime = '';
    this.setData({ isSearchFloating: false, hasMore: true, posts: [] });
    await this.fetchPosts(true);
  },
  
  onSearchBlur() { 
    setTimeout(() => { 
      if (!(this as any).isConfirming) {
        this.setData({ isSearchFloating: false, ...(this.data.searchKeyword.trim() ? {} : { isSearchActive: false }) }); 
      }
    }, 150); 
  },
  
  async onClearSearch() {
    const req = this.data.searchKeyword.trim().length > 0;
    this.setData({ searchKeyword: '', isSearchActive: false, isSearchFloating: false, currentTab: 'recommend' });
    if (req) { 
      this.latestPostTime = ''; 
      this.oldestPostTime = ''; 
      this.setData({ hasMore: true, posts: [] }); 
      await this.fetchPosts(true); 
    }
  },

  formatTopicData(topic: any, voted: string) {
    if (!topic) return null;
    const total = (topic.votesA || 0) + (topic.votesB || 0);
    return { 
      ...topic, 
      totalVotes: total, 
      percentAStr: total ? Math.round(((topic.votesA || 0) / total) * 100) + '%' : '50%', 
      percentBStr: total ? (100 - Math.round(((topic.votesA || 0) / total) * 100)) + '%' : '50%' 
    };
  },

  goToDailyTopic() { 
    if (this.data.dailyTopic) wx.navigateTo({ url: `/pages/index/daily-topic/daily-topic?id=${this.data.dailyTopic._id}&type=${this.data.dailyTopic.topicType}` }); 
  },

  async openComment(e: any) {
    const post = e.currentTarget.dataset.post;
    if (!post?._id) return;
    this.setData({ showCommentDrawer: true, currentPostId: post._id, currentPostIndex: e.currentTarget.dataset.index, currentComments: [], commentText: '', replyParentId: '', replyTargetName: '' });

    try {
      const { data } = await db.collection('timeline_comments').where({ postId: post._id }).orderBy('createTime', 'desc').get();
      const user = wx.getStorageSync('currentUser');
      const openId = wx.getStorageSync('realOpenID') || user?._openid || '';
      
      const likes = await Promise.all([
        db.collection('timeline_comment_likes').where({ postId: post._id, _openid: '{openid}' }).get(), 
        openId ? db.collection('timeline_comment_likes').where({ postId: post._id, _openid: openId }).get() : Promise.resolve({ data: [] }), 
        user?._id ? db.collection('timeline_comment_likes').where({ postId: post._id, uid: user._id }).get() : Promise.resolve({ data: [] })
      ]);
      const myLikes = [...likes[0].data, ...likes[1].data, ...likes[2].data].map((l:any) => l.commentId);

      const subs = data.filter(c => c.parentId);
      this.setData({ 
        currentComments: data.filter(c => !c.parentId).map(main => ({ 
          ...main, 
          time: formatRelativeTime(main.createTime), 
          nickName: main.author?.nickName || '神秘同学', 
          avatar: main.author?.avatar || this.data.currentUserAvatar, 
          Permission: main.author?.Permission || 0, 
          authorUID: main.authorUID || '', 
          hasLiked: myLikes.includes(main._id), 
          isExpanded: false, 
          subComments: subs.filter(sub => sub.parentId === main._id).sort((a,b) => a.createTime - b.createTime).map(sub => ({ 
            ...sub, nickName: sub.author?.nickName, Permission: sub.author?.Permission || 0, replyToName: sub.replyToName 
          })) 
        })) 
      });
    } catch {}
  },

  checkDailySignIn(user: any) {
    if (!user?._id) return;
    const today = new Date(Date.now() + 28800000).toISOString().split('T')[0];
    if (wx.getStorageSync('localSignDate') === today) return;
    wx.cloud.callFunction({ name: 'userService', data: { action: 'sign_in', userId: user._id } }).then((res: any) => { 
      if (res.result?.success) { 
        wx.setStorageSync('localSignDate', today); 
        wx.showToast({ title: `签到成功! 经验+${res.result.xpAdded}`, icon: 'none' }); 
      } 
    }).catch(() => {});
  },

  refreshTopicState() {
    if (this.data.dailyTopic && this.data.currentUserId && wx.getStorageSync(`topic_vote_${this.data.dailyTopic._id}_${this.data.currentUserId}`) !== this.data.topicVotedOption) {
      this.fetchPosts(true);
    }
  },

  async onFavoritePost(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) {
      return wx.showModal({ 
        title: '提示', 
        content: '绑定身份后才能收藏哦', 
        success: (r) => r.confirm && wx.switchTab({ url: '/pages/mine/mine' }) 
      });
    }

    const { id, index } = e.currentTarget.dataset;
    const post = this.data.posts[index];
    
    const oldFavorited = post.hasFavorited;
    const oldFavCount = post.favoriteCount || 0;
    
    const countVal = oldFavorited ? -1 : 1;
    const newCount = Math.max(0, oldFavCount + countVal);
    
    this.setData({ 
      [`posts[${index}].hasFavorited`]: !oldFavorited, 
      [`posts[${index}].favoriteCount`]: newCount 
    });
    
    try {
      await wx.cloud.callFunction({ 
        name: 'postService', 
        data: { 
          action: 'likeService', 
          postId: id, 
          type: 'favorite', 
          count: countVal,
          uid: user._id 
        } 
      });
    } catch (err) {
      // 安全回滚
      this.setData({ 
        [`posts[${index}].hasFavorited`]: oldFavorited, 
        [`posts[${index}].favoriteCount`]: oldFavCount 
      });
    }
  },

  async onLikePost(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) {
      return wx.showModal({ 
        title: '提示', 
        content: '绑定身份后才能互动哦', 
        success: (r) => r.confirm && wx.switchTab({ url: '/pages/mine/mine' }) 
      });
    }

    const { id, index } = e.currentTarget.dataset;
    
    if ((this as any).likeLocks?.[id]) return;
    ((this as any).likeLocks || ((this as any).likeLocks = {}))[id] = true; 
    setTimeout(() => delete (this as any).likeLocks[id], 300);

    const post = this.data.posts[index];
    

    const oldLiked = post.hasLiked;
    const oldLikeCount = post.likeCount || 0;
    
    const countVal = oldLiked ? -1 : 1;
    const newCount = Math.max(0, oldLikeCount + countVal);
    
    this.setData({ 
      [`posts[${index}].hasLiked`]: !oldLiked, 
      [`posts[${index}].likeCount`]: newCount 
    });

    try {
      await wx.cloud.callFunction({ 
        name: 'postService', 
        data: { 
          action: 'likeService', 
          postId: id, 
          type: 'like', 
          count: countVal, 
          uid: user._id, 
          targetOpenId: post._openid || '', 
          likerName: user.nickName || '某同学', 
          likerAvatar: user.weiXinAvatar || '', 
          postSnippet: post.title || post.content || '分享了动态' 
        } 
      });
    } catch (err) {

      this.setData({ 
        [`posts[${index}].hasLiked`]: oldLiked, 
        [`posts[${index}].likeCount`]: oldLikeCount 
      });
    }
  },

  async onLikeComment(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) {
      return wx.showModal({ 
        title: '提示', 
        content: '绑定身份后才能点赞哦', 
        success: (r) => r.confirm && wx.switchTab({ url: '/pages/mine/mine' }) 
      });
    }
    wx.vibrateShort({ type: 'medium' });

    const { id, index } = e.currentTarget.dataset;
    const comment = this.data.currentComments[index];
    
    const oldLiked = comment.hasLiked;
    const oldLikesCount = comment.likes || 0;
    
    const countVal = oldLiked ? -1 : 1;
    const newCount = Math.max(0, oldLikesCount + countVal);
    
    this.setData({ 
      [`currentComments[${index}].hasLiked`]: !oldLiked, 
      [`currentComments[${index}].likes`]: newCount 
    });
    
    try { 
      await wx.cloud.callFunction({ 
        name: 'postService', 
        data: { 
          action: 'likeService', 
          type: 'comment_like', 
          commentId: id, 
          postId: this.data.currentPostId, 
          count: countVal, 
          uid: user._id, 
          targetOpenId: comment._openid || comment.authorUID || '', 
          likerName: user.nickName || '某同学', 
          likerAvatar: user.weiXinAvatar || '', 
          postSnippet: comment.content || '' 
        } 
      }); 
    } catch (err) { 
      this.setData({ 
        [`currentComments[${index}].hasLiked`]: oldLiked, 
        [`currentComments[${index}].likes`]: oldLikesCount 
      }); 
    }
  },

  closeComment() { 
    this.setData({ showCommentDrawer: false, inputFocus: false }); 
  },
  
  expandReplies(e: any) { 
    this.setData({ [`currentComments[${e.currentTarget.dataset.index}].isExpanded`]: true }); 
  },
  
  onReplyClick(e: any) { 
    this.setData({ replyParentId: e.currentTarget.dataset.id, replyTargetName: e.currentTarget.dataset.name, inputFocus: true }); 
  },
  
  onCommentInput(e: any) { 
    this.setData({ commentText: e.detail.value }); 
  },
  
  onInputBlur() { 
    if (!this.data.commentText.trim()) this.setData({ replyParentId: '', replyTargetName: '' }); 
  },

  async submitComment() {
    if (!this.data.commentText.trim() || this.data.isSubmittingComment) return;
    this.setData({ isSubmittingComment: true });
    
    const user = wx.getStorageSync('currentUser');
    if (!user) {
      this.setData({ isSubmittingComment: false });
      return wx.showToast({ title: '请先登录', icon: 'none' });
    }

    try {
      const { result } = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: this.data.commentText } }) as any;
      if (result?.isRisky) {
        this.setData({ isSubmittingComment: false });
        return wx.showToast({ title: '包含违规词汇', icon: 'none' });
      }

      if (!this.data.replyParentId) {
        this.setData({ 
          currentComments: [{ 
            _id: 'temp_' + Date.now(), 
            content: this.data.commentText, 
            time: '刚刚', 
            likes: 0, 
            hasLiked: false, 
            author: { nickName: this.data.currentUserNickName, avatar: this.data.currentUserAvatar, Permission: user.Permission || 0 }, 
            parentId: '', 
            replyToName: '' 
          }, ...this.data.currentComments], 
          commentText: '', 
          replyParentId: '', 
          replyTargetName: '', 
          inputFocus: false, 
          isSubmittingComment: false, 
          [`posts[${this.data.currentPostIndex}].commentCount`]: (this.data.posts[this.data.currentPostIndex].commentCount || 0) + 1 
        });
      } else {
        this.setData({ commentText: '', replyParentId: '', replyTargetName: '', inputFocus: false, isSubmittingComment: false });
        wx.showToast({ title: '回复成功', icon: 'success' });
      }

      await wx.cloud.callFunction({ 
        name: 'postService', 
        data: { 
          action: 'addComment', 
          postId: this.data.currentPostId, 
          parentId: this.data.replyParentId, 
          replyToName: this.data.replyTargetName, 
          content: this.data.commentText, 
          uid: user._id, 
          author: { nickName: this.data.currentUserNickName, avatar: this.data.currentUserAvatar, Permission: user.Permission || 0 } 
        } 
      });
      
      this.openComment({ currentTarget: { dataset: { post: { _id: this.data.currentPostId }, index: this.data.currentPostIndex } } });
    } catch { 
      this.setData({ isSubmittingComment: false }); 
      wx.showToast({ title: '发送失败', icon: 'none' }); 
    }
  },

  onAvatarClick(e: any) {
    const targetData = e.currentTarget.dataset.post || e.currentTarget.dataset.comment;
    if (!targetData) return; 
    if (targetData.isAnonymous) return wx.showToast({ title: '对方开启了匿名', icon: 'none' });
    this.setData({ currentProfile: targetData, showProfilePopup: true });
  },

  closeProfilePopup() { this.setData({ showProfilePopup: false }); },
  
  goToDetail(e: any) { 
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${e.currentTarget.dataset.id}` }); 
  },
  
  onHidePostClick() { 
    this.closeActionSheet(); 
    this.hidePost(this.data.actionSheetPostId, this.data.actionSheetPostIndex); 
  },
  
  onReportPostClick() { 
    this.closeActionSheet(); 
    wx.getStorageSync('currentUser') ? wx.navigateTo({ url: `/pages/index/reports/reports?postId=${this.data.actionSheetPostId}` }) : wx.showModal({ title: '提示', content: '请先绑定身份' }); 
  },
  
  hidePost(postId: string, index: number) {
    if (index > -1) { 
      this.data.posts.splice(index, 1); 
      this.setData({ posts: this.data.posts }); 
    }
    let hidden = (wx.getStorageSync('tempHiddenPosts') || []).filter((p:any) => p.expireAt > Date.now());
    if (!hidden.some((p:any) => p.postId === postId)) { 
      hidden.push({ postId, expireAt: Date.now() + 86400000 }); 
      if (hidden.length > 200) hidden.shift(); 
      wx.setStorageSync('tempHiddenPosts', hidden); 
    }
    wx.showToast({ title: '24小时内将不再推荐', icon: 'none' });
  },

  closeActionSheet() { this.setData({ showActionSheet: false }); },
  
  onMoreOptions(e: any) { 
    this.setData({ 
      showActionSheet: true, 
      actionSheetPostId: e.currentTarget.dataset.id, 
      actionSheetPostOpenId: e.currentTarget.dataset.openid, 
      actionSheetAuthorName: e.currentTarget.dataset.name 
    }); 
  },
  
  preventTouchMove() {}
});