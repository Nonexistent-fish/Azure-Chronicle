export {};
const db = wx.cloud.database();
const _ = db.command;

Page<any, any>({
  data: {
    posts: [] as any[], page: 0, pageSize: 10, hasMore: true, isLoading: false,
    showCommentDrawer: false, currentPostId: '', currentPostIndex: -1, currentComments: [] as any[],
    commentText: '', inputFocus: false, replyParentId: '', replyTargetName: '', isSubmittingComment: false, 
    showProfilePopup: false, currentProfile: null as any, currentUserAvatar: '', currentUserNickName: '', currentUserId: ''
  },

  onLoad() {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.navigateBack();
    this.setData({ currentUserAvatar: user.weiXinAvatar, currentUserNickName: user.nickName, currentUserId: user._id });
  },

  onShow() { this.fetchPosts(true); },
  onPullDownRefresh() { this.fetchPosts(true).then(() => wx.stopPullDownRefresh()); },
  onReachBottom() { this.fetchPosts(false); },

  async fetchPosts(isRefresh = false) {
    if (this.data.isLoading || (!isRefresh && !this.data.hasMore)) return;
    this.setData({ isLoading: true });
    const currentPage = isRefresh ? 0 : this.data.page;

    try {
      const user = wx.getStorageSync('currentUser');
      const cfRes: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'getMyFavorites', skip: currentPage * this.data.pageSize, limit: this.data.pageSize, uid: user?._id || '', openId: wx.getStorageSync('realOpenID') || user?._openid || '' } });
      const rawPosts = cfRes.result?.data || [];
      const favCount = cfRes.result?.favCount || 0; 

      if (favCount === 0) return this.setData({ posts: isRefresh ? [] : this.data.posts, hasMore: false, isLoading: false });

      const newPosts = rawPosts.map((post: any) => {
        post.relativeTime = this.formatRelativeTime(post.createTime);
        post.hasFavorited = true; 
        if (post.isAnonymous) post.author = { nickName: '匿名同学', avatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0' };
        return post;
      });

      this.setData({ posts: isRefresh ? newPosts : [...this.data.posts, ...newPosts], page: currentPage + 1, hasMore: favCount === this.data.pageSize, isLoading: false });
    } catch (err) { this.setData({ isLoading: false }); }
  },

  formatRelativeTime(dateStr: string | Date) {
    if (!dateStr) return '刚刚';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  },

  goToDetail(e: any) { const id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` }); },

  onMoreOptions(e: any) {
    const postId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['举报该内容'], itemColor: '#ff0000',
      success: (res) => { if (res.tapIndex === 0) wx.getStorageSync('currentUser') ? wx.navigateTo({ url: `/pages/index/reports/reports?postId=${postId}` }) : wx.showModal({ title: '提示', content: '请先绑定身份' }); }
    });
  },

  previewImage(e: any) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: urls.filter((m: any) => m.fileType === 'image').map((m: any) => m.fileID) });
  },

  async onFavoritePost(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });

    const { id, index } = e.currentTarget.dataset;
    const post = this.data.posts[index];
    this.setData({ [`posts[${index}].hasFavorited`]: !post.hasFavorited, [`posts[${index}].favoriteCount`]: Math.max(0, (post.favoriteCount || 0) + (post.hasFavorited ? -1 : 1)) });

    try { await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', postId: id, type: 'favorite', count: post.hasFavorited ? -1 : 1, uid: user._id } }); } 
    catch { this.setData({ [`posts[${index}].hasFavorited`]: post.hasFavorited, [`posts[${index}].favoriteCount`]: Math.max(0, post.favoriteCount || 0) }); }
  },

  async onLikePost(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });

    const { id, index } = e.currentTarget.dataset;
    if ((this as any).likeLocks?.[id]) return;
    ((this as any).likeLocks || ((this as any).likeLocks = {}))[id] = true; setTimeout(() => delete (this as any).likeLocks[id], 300);

    const post = this.data.posts[index];
    this.setData({ [`posts[${index}].hasLiked`]: !post.hasLiked, [`posts[${index}].likeCount`]: Math.max(0, (post.likeCount || 0) + (post.hasLiked ? -1 : 1)) });
    
    try { await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', postId: id, type: 'like', count: post.hasLiked ? -1 : 1, uid: user._id, targetOpenId: post._openid, likerName: user.nickName || '某同学', likerAvatar: user.weiXinAvatar || '', postSnippet: post.title || post.content || '分享了动态' } }); } 
    catch { this.setData({ [`posts[${index}].hasLiked`]: post.hasLiked, [`posts[${index}].likeCount`]: Math.max(0, post.likeCount || 0) }); }
  },

  async openComment(e: any) {
    const { post, index } = e.currentTarget.dataset;
    this.setData({ showCommentDrawer: true, currentPostId: post._id, currentPostIndex: index, currentComments: [], commentText: '', replyParentId: '', replyTargetName: '' });
    try {
      const res = await db.collection('timeline_comments').where({ postId: post._id }).orderBy('createTime', 'desc').get();
      const user = wx.getStorageSync('currentUser'); 
      const myOpenId = wx.getStorageSync('realOpenID') || user?._openid;
      
      const legacyCond = _.and([{ _openid: myOpenId ? _.in([myOpenId, '{openid}']) : '{openid}' }, _.or([{ uid: _.exists(false) }, { uid: _.eq('') }, { uid: _.eq(null) }])]);
      const userMatchCond = (user?._id) ? _.or([{ uid: _.eq(user._id) }, legacyCond]) : { _openid: myOpenId ? _.in([myOpenId, '{openid}']) : '{openid}' };
      const myLikesRes = await db.collection('timeline_comment_likes').where(_.and([{ postId: post._id }, userMatchCond])).get();
      const myLikedCommentIds = myLikesRes.data.map((l: any) => l.commentId);

      const subs = res.data.filter((c: any) => c.parentId);
      this.setData({ currentComments: res.data.filter((c: any) => !c.parentId).map((main: any) => ({ ...main, time: this.formatRelativeTime(main.createTime), nickName: main.author?.nickName || '神秘同学', avatar: main.author?.avatar, isExpanded: false, hasLiked: myLikedCommentIds.includes(main._id), Permission: main.author?.Permission || 0, authorUID: main.authorUID || '', subComments: subs.filter((sub: any) => sub.parentId === main._id).sort((a: any, b: any) => a.createTime - b.createTime).map((sub: any) => ({ ...sub, nickName: sub.author?.nickName, replyToName: sub.replyToName, Permission: sub.author?.Permission || 0 })) })) });
    } catch {}
  },

  async onLikeComment(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showModal({ title: '提示', content: '绑定身份后才能点赞哦', success: (res) => res.confirm && wx.switchTab({ url: '/pages/mine/mine' }) });
    wx.vibrateShort({ type: 'medium' });
    
    const { id, index } = e.currentTarget.dataset;
    const comment = this.data.currentComments[index];
    this.setData({ [`currentComments[${index}].hasLiked`]: !comment.hasLiked, [`currentComments[${index}].likes`]: Math.max(0, (comment.likes || 0) + (comment.hasLiked ? -1 : 1)) });
    
    try { await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', type: 'comment_like', commentId: id, postId: this.data.currentPostId, count: comment.hasLiked ? -1 : 1, uid: user._id, targetOpenId: comment._openid || comment.authorUID || '', likerName: user.nickName || '某同学', likerAvatar: user.weiXinAvatar || '', postSnippet: comment.content || '' } }); } 
    catch { this.setData({ [`currentComments[${index}].hasLiked`]: comment.hasLiked, [`currentComments[${index}].likes`]: Math.max(0, comment.likes || 0) }); }
  },

  closeComment() { this.setData({ showCommentDrawer: false, inputFocus: false }); },
  expandReplies(e: any) { this.setData({ [`currentComments[${e.currentTarget.dataset.index}].isExpanded`]: true }); },
  onReplyClick(e: any) { this.setData({ replyParentId: e.currentTarget.dataset.id, replyTargetName: e.currentTarget.dataset.name, inputFocus: true }); },
  onCommentInput(e: any) { this.setData({ commentText: e.detail.value }); },
  onInputBlur() { if (!this.data.commentText.trim()) this.setData({ replyParentId: '', replyTargetName: '' }); },

  async submitComment() {
    if (!this.data.commentText.trim() || this.data.isSubmittingComment) return;
    this.setData({ isSubmittingComment: true });
    const user = wx.getStorageSync('currentUser');
    if (!user) return this.setData({ isSubmittingComment: false }), wx.showToast({ title: '请先登录', icon: 'none' });
    
    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: this.data.commentText } });
      if (textCheck.result?.isRisky) return this.setData({ isSubmittingComment: false }), wx.showToast({ title: '包含违规词汇', icon: 'none' });

      const mockComment = { _id: 'temp_' + Date.now(), content: this.data.commentText, time: '刚刚', likes: 0, hasLiked: false, author: { nickName: this.data.currentUserNickName, avatar: this.data.currentUserAvatar, Permission: user.Permission || 0 }, parentId: this.data.replyParentId || "", replyToName: this.data.replyTargetName || "" };

      if (!this.data.replyParentId) this.setData({ currentComments: [mockComment, ...this.data.currentComments], commentText: '', replyParentId: '', replyTargetName: '', inputFocus: false, isSubmittingComment: false, [`posts[${this.data.currentPostIndex}].commentCount`]: (this.data.posts[this.data.currentPostIndex].commentCount || 0) + 1 });
      else { this.setData({ commentText: '', replyParentId: '', replyTargetName: '', inputFocus: false, isSubmittingComment: false }); wx.showToast({ title: '回复成功', icon: 'success' }); }

      await wx.cloud.callFunction({ name: 'postService', data: { action: 'addComment', postId: this.data.currentPostId, parentId: this.data.replyParentId, replyToName: this.data.replyTargetName, content: this.data.commentText, uid: user._id, author: { nickName: this.data.currentUserNickName, avatar: this.data.currentUserAvatar, Permission: user.Permission || 0 } } });
      this.openComment({ currentTarget: { dataset: { post: { _id: this.data.currentPostId }, index: this.data.currentPostIndex } } });
    } catch { this.setData({ isSubmittingComment: false }); wx.showToast({ title: '发送失败', icon: 'none' }); }
  },

  onAvatarClick(e: any) {
    const targetData = e.currentTarget.dataset.post || e.currentTarget.dataset.comment;
    if (!targetData) return; 
    if (targetData.isAnonymous) return wx.showToast({ title: '对方开启了匿名', icon: 'none' });
    this.setData({ currentProfile: targetData, showProfilePopup: true });
  },

  closeProfilePopup() { this.setData({ showProfilePopup: false }); },
  preventTouchMove() {}
});