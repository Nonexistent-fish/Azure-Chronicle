export {};
const db = wx.cloud.database();
const _ = db.command;

Page<any, any>({
  data: {
    post: null as any, isAuthor: false, isAdmin: false, currentOpenId: '', statusText: '', 
    canDelete: false, deleteTip: '', currentUserId: '', 
    rawComments: [] as any[], rawMyLikedCommentIds: [] as string[], comments: [] as any[], commentSort: 'popular', likeUsers: [] as any[], 
    commentText: '', canSend: false, replyParentId: '', replyTargetName: '', inputFocus: false, isSubmitting: false,
    showProfilePopup: false, currentProfile: null as any, showActionSheet: false, 
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
  },

  onLoad(options: any) { 
    if (options.id) { this.initDetail(options.id); } 
    else { wx.showToast({ title: '参数错误', icon: 'none' }); setTimeout(() => wx.navigateBack(), 1000); }
  },

  async initDetail(id: string) {
    try {
      const currentUser = wx.getStorageSync('currentUser');
      const myOpenId = (wx.getStorageSync('realOpenID') || (currentUser && currentUser._openid) || '').trim();
      const myUserId = currentUser ? currentUser._id : '';
      let isAdmin = currentUser && (currentUser.Permission === 2 || currentUser.Permission === 3) || wx.getStorageSync('isSuperAdmin');
      
      const cfRes: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'getPostDetail', id, uid: myUserId, openId: myOpenId, isAdmin } });
      
      if (!cfRes.result?.data?.post || cfRes.result.data.post.status === -1) {
        wx.showToast({ title: '该动态已被删除', icon: 'none', duration: 1500, mask: true });
        wx.setStorageSync('dead_post_id', id);
        return setTimeout(() => wx.navigateBack(), 1500);
      }

      const { post, allComments, myLikedCommentIds, likeUsers } = cfRes.result.data;
      let isAuthor = post._isMyPost;

      if (post.status !== 1 && !isAuthor && !isAdmin) {
        wx.showToast({ title: '该动态已失效或隐藏', icon: 'none', duration: 1500, mask: true });
        wx.setStorageSync('dead_post_id', id);
        return setTimeout(() => wx.navigateBack(), 1500);
      }

      post.timeDisplay = this.formatRelativeTime(post.createTime);
      this.setData({ post, isAuthor, isAdmin, currentOpenId: myOpenId, currentUserId: myUserId, likeUsers: likeUsers || [], rawComments: allComments || [], rawMyLikedCommentIds: myLikedCommentIds || [] });
      if (isAuthor || isAdmin) this.checkAuthorAdminLogic(post, isAuthor, isAdmin);
      this.processComments();
      
    } catch (err: any) { 
      wx.showToast({ title: '无法加载内容', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  processComments() {
    const { rawComments, rawMyLikedCommentIds, commentSort } = this.data;
    let mainComments = rawComments.filter((c: any) => !c.parentId);
    const subComments = rawComments.filter((c: any) => c.parentId);

    if (commentSort === 'popular') mainComments.sort((a: any, b: any) => (b.likes || 0) - (a.likes || 0));
    else mainComments.sort((a: any, b: any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

    const processed = mainComments.map((main: any) => ({
      ...main, avatar: main.author?.avatar, nickName: main.author?.nickName, authorUID: main.authorUID || '', Permission: main.author?.Permission || 0,
      timeDisplay: this.formatRelativeTime(main.createTime), hasLiked: rawMyLikedCommentIds.includes(main._id), 
      subComments: subComments.filter((sub: any) => sub.parentId === main._id).sort((a: any, b: any) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime()).map((sub: any) => ({ ...sub, avatar: sub.author?.avatar, nickName: sub.author?.nickName, Permission: sub.author?.Permission || 0, timeDisplay: this.formatRelativeTime(sub.createTime) }))
    }));
    
    this.setData({ comments: processed, 'post.commentCount': mainComments.length });
  },

  changeSort(e: any) { 
    const sort = e.currentTarget.dataset.sort;
    if (this.data.commentSort === sort) return;
    this.setData({ commentSort: sort }); this.processComments();
  },

  checkAuthorAdminLogic(data: any, isAuthor: boolean, isAdmin: boolean) {
    const statusMap: any = { 0: '审核中', 1: '已通过', 2: '未通过' };
    let canDelete = isAdmin || (isAuthor && (data.status === 0 || data.status === 2)), deleteTip = '';

    if (!canDelete && isAuthor && data.status === 1) {
      if (data.isPrivate) {
        const baseTimeMs = new Date(String(data.visibilityTime || data.createTime).replace(/-/g, '/')).getTime() || new Date(data.visibilityTime || data.createTime).getTime();
        if (baseTimeMs) {
          const diffDays = (Date.now() - baseTimeMs) / 86400000;
          if (diffDays >= 7) canDelete = true; else deleteTip = `* 转为私密满 7 天后可永久删除 (还需 ${Math.ceil(7 - diffDays)} 天)`;
        }
      } else deleteTip = '* 需先转为私密，并在私密状态满 7 天后方可删除';
    }
    this.setData({ statusText: statusMap[data.status], canDelete, deleteTip });
  },

  onReplyClick(e: any) { 
    if (!wx.getStorageSync('currentUser')) return wx.showModal({ title: '提示', content: '请先绑定身份', showCancel: false });
    this.setData({ replyParentId: e.currentTarget.dataset.id, replyTargetName: e.currentTarget.dataset.name, inputFocus: true });
  },

  scrollToComments() { wx.createSelectorQuery().select('#comment-section').boundingClientRect(r => r && wx.pageScrollTo({ scrollTop: r.top, duration: 300 })).exec(); },
  onCommentInput(e: any) { const text = e.detail.value; this.setData({ commentText: text, canSend: text.trim().length > 0 }); },
  onInputBlur() { if (!this.data.commentText.trim()) this.setData({ replyParentId: '', replyTargetName: '' }); },

  async submitComment() { 
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showModal({ title: '提示', content: '请先绑定身份' });
    const realText = this.data.commentText.trim();
    if (!realText) return wx.showToast({ title: '不能发送空内容哦', icon: 'none' });
    if (this.data.isSubmitting) return;

    this.setData({ isSubmitting: true });
    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: realText } });
      if (textCheck.result?.isRisky) return this.setData({ isSubmitting: false }), wx.showToast({ title: '包含违规词汇', icon: 'none' });

      const addRes: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'addComment', postId: this.data.post._id, parentId: this.data.replyParentId || "", replyToName: this.data.replyTargetName || "", content: realText, uid: user._id, author: { nickName: user.nickName, avatar: user.weiXinAvatar, Permission: user.Permission || 0 } } });

      const newComment = { _id: addRes.result._id, postId: this.data.post._id, parentId: this.data.replyParentId || "", replyToName: this.data.replyTargetName || "", content: realText, authorUID: user._id, _openid: user._openid, author: { nickName: user.nickName, avatar: user.weiXinAvatar, Permission: user.Permission || 0 }, likes: 0, createTime: new Date().toISOString() };
      this.data.rawComments.push(newComment); this.processComments();

      if (!this.data.replyParentId) this.syncToHomePage('commentCount', this.data.post.commentCount); 
      this.setData({ commentText: '', canSend: false, replyParentId: '', replyTargetName: '', inputFocus: false, isSubmitting: false });
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) { this.setData({ isSubmitting: false }); wx.showToast({ title: '发送失败', icon: 'none' }); }
  },

  onDeleteComment(e: any) { 
    const { id } = e.currentTarget.dataset, postId = this.data.post._id, user = wx.getStorageSync('currentUser');
    wx.showModal({
      title: '删除评论', content: '删除后，相关的回复和通知也将一并消失，确定吗？', confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...' });
          try {
            const cfRes: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'deleteComment', commentId: id, postId: postId, uid: user._id } });
            if (!cfRes.result.success) throw new Error();
            this.setData({ rawComments: this.data.rawComments.filter(c => c._id !== id && c.parentId !== id) });
            this.processComments();
            const targetComment = this.data.rawComments.find((c: any) => c._id === id);
            if (targetComment && !targetComment.parentId) {
              this.setData({ 'post.commentCount': Math.max(0, this.data.post.commentCount - 1) });
              this.syncToHomePage('commentCount', this.data.post.commentCount);
            }
            wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' });
          } catch(e) { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); }
        }
      }
    });
  },

  async onLikeComment(e: any) {
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });
    wx.vibrateShort({ type: 'medium' });

    const { id, index } = e.currentTarget.dataset;
    const comment = this.data.comments[index], isLiked = comment.hasLiked, incVal = isLiked ? -1 : 1;
    this.setData({ [`comments[${index}].hasLiked`]: !isLiked, [`comments[${index}].likes`]: Math.max(0, (comment.likes || 0) + incVal) });
    
    const rawIdx = this.data.rawComments.findIndex(c => c._id === id);
    if(rawIdx > -1) this.data.rawComments[rawIdx].likes = Math.max(0, (comment.likes || 0) + incVal);
    if (!isLiked) this.data.rawMyLikedCommentIds.push(id); else this.data.rawMyLikedCommentIds = this.data.rawMyLikedCommentIds.filter(i => i !== id);

    try { await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', type: 'comment_like', commentId: id, postId: this.data.post._id, count: incVal, uid: user._id, openId: user._openid || '', targetOpenId: comment._openid || comment.authorUID || '', likerName: user.nickName, likerAvatar: user.weiXinAvatar, postSnippet: comment.content } }); } 
    catch (err) { this.setData({ [`comments[${index}].hasLiked`]: isLiked, [`comments[${index}].likes`]: comment.likes }); if(rawIdx > -1) this.data.rawComments[rawIdx].likes = comment.likes; }
  },

  async onLikePost() { 
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });

    const id = this.data.post._id;
    if ((this as any).likeLocks?.[id]) return;
    ((this as any).likeLocks || ((this as any).likeLocks = {}))[id] = true; setTimeout(() => delete (this as any).likeLocks[id], 300);
    
    const isLiked = this.data.post.hasLiked, countVal = isLiked ? -1 : 1; 
    this.setData({ 'post.hasLiked': !isLiked, 'post.likeCount': Math.max(0, (this.data.post.likeCount || 0) + countVal) });
    this.syncToHomePage('hasLiked', !isLiked); this.syncToHomePage('likeCount', this.data.post.likeCount);

    try {
      await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', postId: id, type: 'like', count: countVal, uid: user._id, openId: user._openid || '', targetOpenId: this.data.post._openid, likerName: user.nickName, likerAvatar: user.weiXinAvatar, postSnippet: this.data.post.title || this.data.post.content || '分享了动态' } });
      if (this.data.isAuthor) {
        const cfRes: any = await wx.cloud.callFunction({ name: 'postService', data: { action: 'getPostDetail', id: id, uid: this.data.currentUserId, isAdmin: this.data.isAdmin } });
        if(cfRes.result?.data?.likeUsers) this.setData({ likeUsers: cfRes.result.data.likeUsers });
      }
    } catch (e: any) { this.setData({ 'post.hasLiked': isLiked, 'post.likeCount': Math.max(0, (this.data.post.likeCount || 0) - countVal) }); }
  },

  async onFavoritePost() { 
    const user = wx.getStorageSync('currentUser');
    if (!user) return wx.showToast({ title: '请先登录', icon: 'none' });

    const isFav = this.data.post.hasFavorited, countVal = isFav ? -1 : 1, pid = this.data.post._id;
    this.setData({ 'post.hasFavorited': !isFav, 'post.favoriteCount': Math.max(0, (this.data.post.favoriteCount || 0) + countVal) });
    this.syncToHomePage('hasFavorited', !isFav); this.syncToHomePage('favoriteCount', this.data.post.favoriteCount);

    try { await wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', postId: pid, type: 'favorite', count: countVal, uid: user._id, openId: user._openid || '' } }); } 
    catch (e) { this.setData({ 'post.hasFavorited': isFav, 'post.favoriteCount': Math.max(0, (this.data.post.favoriteCount || 0) - countVal) }); }
  },
  
  onMoreOptions() { this.setData({ showActionSheet: true }); },
  closeActionSheet() { this.setData({ showActionSheet: false }); },
  onReportPostClick() {
    this.closeActionSheet();
    if (!wx.getStorageSync('currentUser')) return wx.showModal({ title: '提示', content: '请先绑定身份' });
    wx.navigateTo({ url: `/pages/index/reports/reports?postId=${this.data.post._id}` });
  },
  
  onAvatarClick(e: any) {
    const { source, index, sindex } = e.currentTarget.dataset;
    let targetData: any = source === 'post' ? this.data.post : (source === 'comment' ? this.data.comments[index] : (source === 'subcomment' ? this.data.comments[index].subComments[sindex] : this.data.likeUsers[index]));
    if (!targetData) return; 
    if (targetData.isAnonymous) return wx.showToast({ title: '对方开启了匿名，无法查看名片', icon: 'none' });
    this.setData({ currentProfile: targetData, showProfilePopup: true });
  },
  
  closeProfilePopup() { this.setData({ showProfilePopup: false }); },
  
  onTogglePrivacy(e: any) { 
    if (!this.data.isAuthor) return this.setData({ 'post.isPrivate': !e.detail.value }), wx.showToast({ title: '仅作者可操作', icon: 'none' });
    const targetPrivate = e.detail.value, post = this.data.post;
    
    if (post.status === 1 && targetPrivate && !post.isPrivate) {
      const now = Date.now(), createTimeMs = new Date(post.createTime.replace(/-/g, '/')).getTime() || new Date(post.createTime).getTime();
      if (createTimeMs && (now - createTimeMs) / 3600000 < 24) {
        const baseTimeMs = new Date(String(post.visibilityTime || post.createTime).replace(/-/g, '/')).getTime() || new Date(post.visibilityTime || post.createTime).getTime();
        if (baseTimeMs && (now - baseTimeMs) / 3600000 < 24) { this.setData({ 'post.isPrivate': false }); return wx.showModal({ title: '操作受限', content: `贴子发布不满24小时，无法转私密。`, showCancel: false }); }
      }
    }

    wx.showLoading({ title: '设置中' });
    try {
      const updateData: any = { isPrivate: targetPrivate };
      if (targetPrivate) updateData.visibilityTime = db.serverDate();
      db.collection('timeline_posts').doc(post._id).update({ data: updateData }).then(() => { wx.hideLoading(); this.initDetail(post._id); });
    } catch (err) { wx.hideLoading(); this.setData({ 'post.isPrivate': !targetPrivate }); }
  }, 

  onDelete() {
    if (!this.data.canDelete) return;
    const post = this.data.post, isForceDelete = (post.status === 0 || post.status === 2);
    wx.showModal({
      title: '确认删除', content: isForceDelete ? '确定要永久删除这条动态吗？相关的图片和评论也将被彻底清理。' : '确定要永久删除这条动态吗？相关的评论和图片也将被清理。', confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({ name: 'postService', data: { action: 'softDeletePost', postId: post._id, forceDelete: isForceDelete, mediaList: isForceDelete ? post.media : [] } });
            const pages = getCurrentPages();
            if (pages.length > 1) {
              const prevPage = pages[pages.length - 2];
              if (prevPage.data?.posts) {
                const index = prevPage.data.posts.findIndex((p: any) => p._id === post._id);
                if (index !== -1) { if (typeof prevPage.hidePost === 'function') prevPage.hidePost(post._id, index); else { const newPosts = [...prevPage.data.posts]; newPosts.splice(index, 1); prevPage.setData({ posts: newPosts }); } }
              }
            }
            wx.showToast({ title: '删除成功', icon: 'none', duration: 1000 }); setTimeout(() => wx.navigateBack(), 1000);
          } catch (e) { wx.showToast({ title: '删除失败，请重试', icon: 'none' }); }
        }
      }
    });
  },

  syncToHomePage(field: string, val: any) {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      const prevPage = pages[pages.length - 2]; 
      if (prevPage.route.includes('index/index') && prevPage.data?.posts) {
        const index = prevPage.data.posts.findIndex((p: any) => p._id === this.data.post._id);
        if (index !== -1) prevPage.setData({ [`posts[${index}].${field}`]: val });
      }
    }
  },

  onEdit() { wx.reLaunch({ url: `/pages/upload/upload?id=${this.data.post._id}&isEdit=true` }); },
  
  onPreviewMedia(e: any) {
    const { current } = e.currentTarget.dataset, post = this.data.post;
    if (!post?.media?.length) return;
    wx.previewMedia({ sources: post.media.map((m: any) => ({ url: m.fileID, type: m.fileType === 'video' ? 'video' : 'image', poster: m.tempFilePath || '' })), current: parseInt(current) || 0, fail: () => wx.showToast({ title: '媒体加载失败', icon: 'none' }) });
  },

  formatRelativeTime(dateStr: any) {
    if (!dateStr) return '刚刚';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  },
  preventTouchMove() { return; }
});