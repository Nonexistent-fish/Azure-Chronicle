const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

module.exports = {
  // 处理互换联系方式状态
  async handleContactExchange({ requestId, status, exchangeContent = [] }) {
    try {
      await db.collection('contact_exchanges').doc(requestId).update({
        data: { status, exchange_content: exchangeContent, updateTime: db.serverDate() }
      });
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 安全获取对方联系方式
  async getPeersContacts(peerIds) {
    try {
      if (!peerIds?.length) return { success: true, data: [] };
      const { data } = await db.collection('register_students')
        .where({ _openid: _.in(peerIds) })
        .field({ _openid: true, phoneNumber: true, wechatId: true, qqId: true })
        .get();
      return { success: true, data };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 清空所有未读通知
  async markAllAsRead(myOpenId) {
    try {
      await Promise.all([
        db.collection('user_notifications')
          .where(_.and([_.or([{ _openid: myOpenId }, { targetOpenId: myOpenId }]), { isRead: false }]))
          .update({ data: { isRead: true } }),
        db.collection('feedback_reports')
          .where({ _openid: myOpenId, isRead: false })
          .update({ data: { isRead: true } })
      ]);
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 隐藏特定信件
  async hideExchanges(ids, myOpenId) {
    try {
      if (!ids?.length) return { success: true };
      await db.collection('contact_exchanges')
        .where({ _id: _.in(ids) })
        .update({ data: { hiddenBy: _.addToSet(myOpenId) } });
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 静默更新信箱访问时间
  async updateMailboxTime(userId) {
    try {
      if (!userId) return { success: false, msg: '缺少 userId' };
      await db.collection('register_students').doc(userId).update({
        data: { lastMailboxVisit: db.serverDate() }
      });
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 发送系统通知信件
  async sendSystemMail(mailData) {
    try {
      const finalData = {
        ...mailData,
        isRead: false,
        isDeleted: false,
        type: 'system_notification',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };
      await db.collection('user_notifications').add({ data: finalData });
      return { success: true };
    } catch (err) {
      console.error('发信失败:', err);
      return { success: false, err: err.message || err };
    }
  },

  // 发送评论通知
  async sendCommentNotification({ targetOpenId, postId, commentId, author, content, postSnippet, targetType = 'post' }) {
    try {
      await db.collection('user_notifications').add({
        data: { targetOpenId, type: 'comment', targetType, postId, commentId, author, content, postSnippet, isRead: false, isDeleted: false, createTime: db.serverDate(), updateTime: db.serverDate() }
      });
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  },

  // 发送点赞通知
  async sendLikeNotification({ targetOpenId, type, postId = '', commentId = '', likerName, likerAvatar, postSnippet = '' }) {
    try {
      const query = { targetOpenId, type, isDeleted: false };
      if (postId) query.postId = postId;
      if (commentId) query.commentId = commentId;

      const { data } = await db.collection('user_notifications').where(query).limit(1).get();

      if (data.length > 0) {
        const notif = data[0];
        const likers = notif.likers || [];
        if (!likers.includes(likerName)) likers.unshift(likerName);
        
        const nameStr = likers.slice(0, 2).join('、') + (likers.length > 2 ? ` 等 ${likers.length} 人` : '');
        
        await db.collection('user_notifications').doc(notif._id).update({
          data: { likers, likerNamesArr: nameStr, latestAvatar: likerAvatar, isRead: false, updateTime: db.serverDate() }
        });
      } else {
        await db.collection('user_notifications').add({
          data: { targetOpenId, type, postId, commentId, likers: [likerName], likerNamesArr: likerName, latestAvatar: likerAvatar, postSnippet, isRead: false, isDeleted: false, createTime: db.serverDate(), updateTime: db.serverDate() }
        });
      }
      return { success: true };
    } catch (err) { return { success: false, err: err.message || err }; }
  }
};