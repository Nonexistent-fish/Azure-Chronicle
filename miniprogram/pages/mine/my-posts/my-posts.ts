// pages/my-post/my-post.ts
export {};
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    posts: [] as any[],
    statusMap: { 0: '审核中', 1: '已通过', 2: '未通过' } as any,
    isLoaded: false 
  },

  onLoad() {
    this.initLoading();
  },

  onShow() {
  },

  onPullDownRefresh() {
    this.initLoading().then(() => wx.stopPullDownRefresh());
  },

  async initLoading() {
    
    
    try {
      let realOpenID = wx.getStorageSync('realOpenID');
      if (!realOpenID) {
        const authRes: any = await wx.cloud.callFunction({ 
          name: 'userService', 
          data: {
            action: 'checkUserStatus'
          }
        });
        realOpenID = authRes.result.openid || authRes.result.userData._openid;
        wx.setStorageSync('realOpenID', realOpenID); 
      }

      const res = await db.collection('timeline_posts')
        .where({
          _openid: realOpenID, 
          status: _.in([0, 1, 2, 3]) 
        })
        .orderBy('createTime', 'desc')
        .get();

      const formattedPosts = res.data.map((item: any) => ({
        ...item,
        timeDisplay: item.createTime ? new Date(item.createTime).toLocaleString('zh-CN', { hour12: false }) : '时间未知',
        isPrivate: item.isPrivate || false 
      }));

      this.setData({ posts: formattedPosts, isLoaded: true });
      

    } catch (err: any) {
      console.error('未知错误', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` });
  }
});