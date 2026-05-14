import { xpToLevel } from '../../utils/levelUtils';
const db = wx.cloud.database();
const _ = db.command;

Component({
  properties: {
    show: {
      type: Boolean, value: false,
      observer(newVal) { newVal && this.data.targetData ? this.initProfile() : this.clearLongPress(); }
    },
    targetData: { type: Object, value: null }
  },

  data: {
    pData: {} as Record<string, any>, targetStats: { bio: '', profileLikes: 0 }, profileHasLiked: false,
    myTodayLikesCount: 0, thumbAnim: false, particleBursts: [] as any[], hasShownLimitToast: false,
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    levelInfo: null as any, badgeStyle: ''
  },

  methods: {
    preventTouchMove() {},
    closePopup() { this.triggerEvent('close'); },

    async initProfile() {
      const t = this.data.targetData;
      if (!t) return;

      const targetOpenId = t._openid || t.targetOpenId;
      const exactTargetId = t.authorUID || t.targetRealId || t.author?._id || t.uid || (t.content === undefined && t.title === undefined ? t._id : '');
      const rawTargetName = t.author?.nickName || t.nickName || t.likerName || '神秘同学';
      const user = wx.getStorageSync('currentUser') || {};
      const myOpenId = wx.getStorageSync('realOpenID') || user._openid;

      if (exactTargetId === user._id && rawTargetName === user.nickName) {
        wx.showToast({ title: '这是你自己哦~', icon: 'none' });
        return this.closePopup();
      }

      let pData: Record<string, any> = {
        nickName: rawTargetName.slice(0, 8), avatar: t.author?.avatar || t.weiXinAvatar || t.avatar || this.data.defaultAvatar,
        gender: t.author?.gender ?? t.gender, permission: t.author?.Permission || t.Permission || 0,
        cardTheme: 'dark', targetOpenId, targetRealId: exactTargetId, targetContactCount: 0
      };

      this.setData({ pData, 'targetStats.bio': '时空连接中...', 'targetStats.profileLikes': 0, profileHasLiked: false, myTodayLikesCount: 0, hasShownLimitToast: false });

      try {
        const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'getPublicProfile', targetOpenId, targetId: exactTargetId } }) as any;
        let currentXp = 0;

        if (result?.success && result.data) {
          const ud = result.data;
          const getUrl = (f: any) => (!f ? '' : (Array.isArray(f) ? f[0]?.fileID || f[0]?.url || f[0] || '' : f));
          
          Object.assign(pData, {
            targetRealId: ud._id, miniCardBgUrl: getUrl(ud.miniCardBgUrl) || getUrl(ud.cardBgUrl) || '', cardTheme: ud.cardTheme || 'dark',
            avatarFrameUrl: getUrl(ud.avatarFrameUrl), avatarFrameSizeLevel: ud.avatarFrameSizeLevel || 'normal', avatarFrameShadow: ud.avatarFrameShadow || '',
            targetContactCount: [ud.phoneNumber, ud.wechatId, ud.qqId].filter(x => x?.trim()).length
          });
          if (t.author?.gender === undefined) pData.gender = ud.gender;
          currentXp = ud.xp || 0;
          this.setData({ pData, 'targetStats.bio': ud.bio || '这位同学很懒，什么都没写~', 'targetStats.profileLikes': ud.profileLikes || 0 });
        } else {
          this.setData({ 'targetStats.bio': '档案暂时无法读取' });
        }

        const lv = xpToLevel(currentXp);
        this.setData({ levelInfo: lv, badgeStyle: `background: ${lv.bgColor}; color: ${lv.color}; border: 1rpx solid ${lv.color};` });

        const cacheKey = `profile_likes_${pData.targetRealId || targetOpenId}`;
        const todayStr = new Date().toDateString();
        let localLike = wx.getStorageSync(cacheKey);

        if (localLike?.date === todayStr) {
          this.setData({ profileHasLiked: localLike.hasLiked, myTodayLikesCount: localLike.count });
        } else {
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const { total } = await db.collection('profile_likes').where({ targetOpenId: pData.targetRealId || targetOpenId, _openid: myOpenId ? _.in([myOpenId, '{openid}']) : '{openid}', createTime: _.gte(todayStart) }).count();
          localLike = { date: todayStr, hasLiked: total > 0, count: total };
          wx.setStorageSync(cacheKey, localLike);
          this.setData({ profileHasLiked: localLike.hasLiked, myTodayLikesCount: localLike.count });
        }
      } catch { this.setData({ 'targetStats.bio': '网络开小差了，加载失败' }); }
    },

    onLongPressProfileLike() {
      this.executeProfileLike();
      (this as any).longPressInterval = setInterval(() => this.executeProfileLike(), 180);
    },
    clearLongPress() {
      if ((this as any).longPressInterval) { clearInterval((this as any).longPressInterval); (this as any).longPressInterval = null; }
    },
    onLikeProfile() { this.executeProfileLike(); },

    executeProfileLike() {
      let likes = this.data.targetStats.profileLikes || 0;
      let count = this.data.myTodayLikesCount;

      this.setData({ thumbAnim: false }, () => wx.nextTick(() => this.setData({ thumbAnim: true })));

      if (count >= 5) {
        if (!this.data.hasShownLimitToast) { wx.showToast({ title: '今日点赞已达上限', icon: 'none' }); this.setData({ hasShownLimitToast: true }); }
        this.triggerParticles(likes);
        return this.setData({ profileHasLiked: true });
      }

      likes++; count++;
      this.triggerParticles(likes);
      this.setData({ profileHasLiked: true, 'targetStats.profileLikes': likes, myTodayLikesCount: count });

      const id = this.data.pData.targetRealId || this.data.pData.targetOpenId;
      wx.setStorageSync(`profile_likes_${id}`, { date: new Date().toDateString(), hasLiked: true, count });

      const user = wx.getStorageSync('currentUser') || {};
      wx.cloud.callFunction({ name: 'postService', data: { action: 'likeService', type: 'profile_like', targetRealId: this.data.pData.targetRealId, targetOpenId: id, likerName: user.nickName || '神秘同学', likerAvatar: user.weiXinAvatar || '' } }).catch(() => {});
    },

    triggerParticles(total: number) {
      const level = total >= 1300 ? 'legendary' : (total >= 500 ? 'epic' : 'rare'); 
      const burstId = Date.now() + Math.random();
      this.setData({ particleBursts: [...this.data.particleBursts, { id: burstId, level }] });
      setTimeout(() => this.setData({ particleBursts: this.data.particleBursts.filter((b:any) => b.id !== burstId) }), 800);
    },

    async sendExchangeRequest() {
      const user = wx.getStorageSync('currentUser');
      if (!user) return wx.showModal({ title: '提示', content: '请先绑定身份' });
      const fromOpenId = wx.getStorageSync('realOpenID') || user._openid || ''; 
      if (!fromOpenId) return wx.showModal({ title: '状态异常', content: '账号信息不全，请重新登录试试', showCancel: false });

      const content: number[] = []; 
      if (user.phoneNumber?.trim()) content.push(0);
      if (user.wechatId?.trim()) content.push(1);
      if (user.qqId?.trim()) content.push(2);

      if (content.length < 2) return wx.showModal({ title: '权限拦截', content: '要先绑定两个联系方式才能开通此服务哦', confirmText: '去完善', success: (res) => res.confirm && wx.navigateTo({ url: '/pages/settings/settings' }) });
      if ((this.data.pData.targetContactCount || 0) < 2) return wx.showToast({ title: '对方未开通该服务', icon: 'none' });

      const { targetOpenId, targetRealId, nickName, avatar } = this.data.pData;
      if (!targetOpenId) return wx.showToast({ title: '获取对方档案失败', icon: 'none' });

      wx.showLoading({ title: '信件投递中...' });
      try {
        const { data } = await db.collection('contact_exchanges').where({ from_openid: fromOpenId, to_openid: targetOpenId, status: _.in([0, 1]) }).get().catch(() => ({ data: [] })); 
        if (data?.length) {
          const latest = data.sort((a:any, b:any) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())[0];
          if (latest.status === 0) { wx.hideLoading(); return wx.showToast({ title: '已发送过申请，请等待回复~', icon: 'none' }); }
          if (latest.status === 1 && Date.now() - new Date(latest.updateTime || latest.createTime).getTime() < 21600000) {
            wx.hideLoading(); return wx.showToast({ title: '你们刚互换过，快去信箱查看吧', icon: 'none' });
          }
        }

        await db.collection('contact_exchanges').add({
          data: { from_openid: fromOpenId, to_openid: targetOpenId, exchange_content: content, status: 0, hidden: [], createTime: db.serverDate(), updateTime: db.serverDate(), fromUID: user._id || '', toUID: targetRealId || '', fromName: user.nickName || '神秘同学', fromAvatar: user.weiXinAvatar || this.data.defaultAvatar, toName: nickName || '神秘同学', toAvatar: avatar || this.data.defaultAvatar }
        });
        
        wx.hideLoading();
        this.closePopup();
        wx.showToast({ title: '申请已发送！', icon: 'success' });
      } catch { wx.hideLoading(); wx.showToast({ title: '网络开小差了', icon: 'none' }); }
    }
  }
});