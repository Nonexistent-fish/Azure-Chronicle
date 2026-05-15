const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 工具：获取指定偏移量的北京时间日期字符串 (默认获取当天)
const getBeijingDateStr = (offset = 0) => new Date(Date.now() + 28800000 + offset).toISOString().split('T')[0];

module.exports = {
  // 核心经验发放与防刷校验路由
  async addXp({ action, targetUserId, sourceUserId, targetItemId }) {
    const todayStr = getBeijingDateStr();
    let xpToAdd = 0, returnData = {};

    // 拦截自己点自己
    if (['like_post', 'favorite_post', 'like_comment', 'like_profile'].includes(action) && targetUserId === sourceUserId) {
      return { success: false, msg: '不加经验' };
    }

    try {
      const checkLimit = async (q, max) => (await db.collection('xp_logs').where(q).count()).total >= max;

      // 签到逻辑分支
      if (action === 'sign_in') {
        const { data: user } = await db.collection('register_students').doc(targetUserId).get();
        if (user.lastSignDate === todayStr) return { success: false, msg: '今日已签到' };

        const cDays = user.lastSignDate === getBeijingDateStr(-86400000) ? (user.continuousDays || 0) + 1 : 1;
        const maxDays = Math.max(cDays, user.maxContinuousDays || 0);
        xpToAdd = cDays >= 7 ? 5 : (cDays >= 3 ? 3 : 1);

        await db.collection('register_students').doc(targetUserId).update({ 
          data: { lastSignDate: todayStr, continuousDays: cDays, maxContinuousDays: maxDays } 
        });
        returnData.continuousDays = cDays;
      } 
      // 名片点赞双重上限分支
      else if (action === 'like_profile') {
        if (await checkLimit({ dateStr: todayStr, action, userId: targetUserId, sourceUserId }, 5)) return { success: false, msg: '名片点赞达上限' };
        if (await checkLimit({ dateStr: todayStr, action, userId: targetUserId }, 20)) return { success: false, msg: '名片经验已达今日上限(20点)' };
        xpToAdd = 1;
      } 
      // 规则化动作分发路由
      else {
        const rules = {
          like_post: { q: { dateStr: todayStr, action, userId: targetUserId, sourceUserId }, max: 2, xp: 2, msg: '动态点赞达上限' },
          favorite_post: { q: { action, targetId: targetItemId, sourceUserId }, max: 1, xp: 5, msg: '已收藏过该动态' },
          like_comment: { q: { dateStr: todayStr, action, userId: targetUserId, sourceUserId }, max: 3, xp: 1, msg: '评论点赞达上限' },
          report_success: { xp: 20 },
          daily_first_like: { q: { dateStr: todayStr, action, userId: targetUserId }, max: 1, xp: 1, msg: '今日已获取首赞经验' },
          daily_first_comment: { q: { dateStr: todayStr, action, userId: targetUserId }, max: 1, xp: 2, msg: '今日已获取首评经验' },
          official_tag_comment: { q: { action, targetId: targetItemId, userId: targetUserId }, max: 1, xp: 2, msg: '该话题下已获取过经验' }
        };
        const rule = rules[action];
        if (!rule) return { success: false, msg: '未知动作' };
        if (rule.q && await checkLimit(rule.q, rule.max)) return { success: false, msg: rule.msg };
        xpToAdd = rule.xp;
      }

      // 并发写入日志与更新余额
      if (xpToAdd > 0) {
        await Promise.all([
          db.collection('xp_logs').add({ data: { userId: targetUserId, sourceUserId: sourceUserId || targetUserId, targetId: targetItemId || '', action, xpGained: xpToAdd, dateStr: todayStr, createTime: db.serverDate() } }),
          db.collection('register_students').doc(targetUserId).update({ data: { xp: _.inc(xpToAdd) } })
        ]);
        return { success: true, xpAdded: xpToAdd, msg: '经验发放成功', ...returnData };
      }
      return { success: false, msg: '校验通过，但未加经验' };
    } catch (err) { 
      return { success: false, error: err.message || err }; 
    }
  }
};