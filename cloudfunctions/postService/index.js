const mailUtils = require('./common/mailUtils');
const xpUtils = require('./common/xpUtils'); 
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext(), { action, uid = '' } = event, safeUid = String(uid).trim();
  if (event.Type === 'Timer' || action === 'cleanup') return await handleSystemCleanup();

  switch (action) {
    case 'getTopicHistory': return await handleGetTopicHistory(event);
    case 'getPosts': return await handleGetPosts(OPENID, safeUid, event);
    case 'getPostDetail': return await handleGetPostDetail(OPENID, safeUid, event);
    case 'softDeletePost': return await handleSoftDeletePost(event); 
    case 'addComment': return await handleAddComment(OPENID, safeUid, event);
    case 'deleteComment': return await handleDeleteComment(OPENID, safeUid, event); 
    case 'likeService': return await handleLikeService(OPENID, safeUid, event);
    case 'voteTopic': return await handleVoteTopic(OPENID, event);
    case 'checkReaction': return await handleCheckReaction(OPENID, safeUid, event);
    case 'getMyFavorites': return await handleGetMyFavorites(OPENID, safeUid, event);
    default: return { success: false, msg: `未知动作: ${action}` };
  }
};

// 1. 获取动态列表 (游标增量 & 老版兼容)
async function handleGetPosts(openId, uid, e) {
  let cond = { status: 1, isPrivate: false };
  if (e.latestPostTime) cond.createTime = _.gt(new Date(e.latestPostTime));
  else if (e.oldestPostTime) cond.createTime = _.lt(new Date(e.oldestPostTime));
  else { const t = new Date(); t.setDate(t.getDate() - (e.daysLimit || 60)); cond.createTime = _.gte(t); }

  if (e.keyword) cond = _.and([cond, _.or([{ content: db.RegExp({ regexp: e.keyword, options: 'i' }) }, { title: db.RegExp({ regexp: e.keyword, options: 'i' }) }])]);
  if (e.hiddenIds?.length) cond._id = _.nin(e.hiddenIds);

  let query = db.collection('timeline_posts').where(cond);
  if (e.latestPostTime) query = query.orderBy('createTime', 'asc');
  else if (e.isRecommend && !e.oldestPostTime) query = query.orderBy('isPinned', 'desc').orderBy('hotScore', 'desc').orderBy('createTime', 'desc');
  else query = query.orderBy('createTime', 'desc');

  let raw = (await query[(e.latestPostTime || e.oldestPostTime) ? 'limit' : 'skip']((!e.latestPostTime && !e.oldestPostTime) ? (e.skip || 0) : (e.limit || 10)).limit(e.limit || 10).get()).data;
  if (e.latestPostTime && raw.length) raw.reverse();

  if (raw.length) {
    const ids = raw.map(p => p._id), match = uid ? { uid: _.eq(uid) } : { _openid: _.eq(openId) };
    const [favs, likes, cmts] = await Promise.all([
      db.collection('timeline_favorites').where(_.and([{ postId: _.in(ids) }, match])).get(),
      db.collection('timeline_likes').where(_.and([{ postId: _.in(ids) }, match])).get(),
      Promise.all(ids.map(id => db.collection('timeline_comments').where({ postId: id }).orderBy('likes', 'desc').orderBy('createTime', 'desc').limit(1).get().then(r => r.data[0] || null)))
    ]);
    const fIds = favs.data.map(f => f.postId), lIds = likes.data.map(l => l.postId);
    raw = raw.map((p, i) => ({ ...p, hasFavorited: fIds.includes(p._id), hasLiked: lIds.includes(p._id), topComment: cmts[i] }));
  }

  return { data: raw.map(p => { p._isMyPost = p.authorUID ? p.authorUID === uid : p._openid === openId; if (p.isAnonymous) { p.author = { nickName: '匿名同学', avatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', Permission: 0 }; delete p._openid; delete p.authorUID; } return p; }) };
}

// 2. 获取动态详情
async function handleGetPostDetail(openId, uid, { id }) {
  let post = (await db.collection('timeline_posts').doc(id).get().catch(() => null))?.data || (await db.collection('daily_topics').doc(id).get().catch(() => null))?.data;
  if (!post) return { data: null };
  const isAuthor = (post.authorUID ? post.authorUID === uid : post._openid === openId);
  const match = uid ? { uid: _.eq(uid) } : { _openid: _.eq(openId) };

  const [favs, likes, cmts, myCLikes, likeUsers] = await Promise.all([
    db.collection('timeline_favorites').where(_.and([{ postId: id }, match])).get(),
    db.collection('timeline_likes').where(_.and([{ postId: id }, match, _.or([{ type: 'like' }, { type: _.exists(false) }])])).get(),
    db.collection('timeline_comments').where({ postId: id }).get(),
    db.collection('timeline_likes').where(_.and([{ postId: id }, { type: 'comment_like' }, match])).get(),
    isAuthor ? db.collection('timeline_likes').where({ postId: id, type: 'like' }).orderBy('createTime', 'desc').limit(21).get().then(async r => {
      let ls = r.data.filter(i => (uid && i.uid) ? i.uid !== uid : i._openid !== openId).slice(0, 20);
      if (!ls.length) return [];
      let map = {};
      const uRes = await db.collection('register_students').where({ _id: _.in(ls.map(l => l.uid).filter(Boolean)) }).get(); uRes.data.forEach(u => map[u._id] = u);
      const oRes = await db.collection('register_students').where({ _openid: _.in(ls.filter(l => !l.uid).map(l => l._openid).filter(Boolean)) }).get(); oRes.data.forEach(u => { if (!map[u._openid]) map[u._openid] = u; });
      return ls.map(l => { const u = (l.uid ? map[l.uid] : map[l._openid]) || {}; return { _id: u._id || l.uid || l._id, _openid: l._openid || '', avatar: u.weiXinAvatar || l.avatar || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', nickName: u.nickName || l.nickName || '神秘同学', Permission: u.Permission || 0, isAnonymous: false }; });
    }) : []
  ]);

  post = { ...post, _isMyPost: isAuthor, hasFavorited: !!favs.data.length, hasLiked: !!likes.data.length, favoriteCount: (!!favs.data.length && !post.favoriteCount) ? 1 : post.favoriteCount, likeCount: (!!likes.data.length && !post.likeCount) ? 1 : post.likeCount };
  if (post.isAnonymous) { post.author = { nickName: '匿名同学', avatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', Permission: 0 }; delete post._openid; delete post.authorUID; }
  return { data: { post, allComments: cmts.data, myLikedCommentIds: myCLikes.data.map(l => l.commentId), likeUsers } };
}

// 3. 删除评论
async function handleDeleteComment(openId, uid, { commentId, postId }) {
  if (!commentId || !postId) return { success: false, msg: '缺失参数' };
  try {
    const cmt = (await db.collection('timeline_comments').doc(commentId).get()).data;
    if (!cmt) return { success: false, msg: '评论已不存在' };
    if (!(cmt.authorUID ? cmt.authorUID === uid : cmt._openid === openId)) return { success: false, msg: '无权删除' };

    let ids = [commentId];
    if (!cmt.parentId) ids = ids.concat((await db.collection('timeline_comments').where({ parentId: commentId }).field({ _id: true }).get()).data.map(c => c._id));

    const tasks = [db.collection('timeline_comments').where({ _id: _.in(ids) }).remove(), db.collection('timeline_comment_likes').where({ commentId: _.in(ids) }).remove(), db.collection('user_notifications').where({ commentId: _.in(ids) }).remove()];
    if (!cmt.parentId) tasks.push(db.collection('timeline_posts').doc(postId).update({ data: { commentCount: _.inc(-1) } }).catch(()=>{}));
    await Promise.all(tasks);
    return { success: true, deletedCount: ids.length };
  } catch (e) { return { success: false, error: e }; }
}

// 4. 发布评论
async function handleAddComment(openId, uid, e) {
  const cmt = await db.collection('timeline_comments').add({ data: { _openid: openId, postId: e.postId, parentId: e.parentId || '', replyToName: e.replyToName || '', content: e.content, authorUID: uid, author: e.author, voteSide: e.voteSide || '', likes: 0, createTime: db.serverDate() } });
  let isTopic = false;

  if (!e.parentId) {
    const upd = await db.collection('timeline_posts').where({ _id: e.postId }).update({ data: { commentCount: _.inc(1), hotScore: _.inc(3600000) } });
    if (upd.stats.updated === 0) isTopic = !!(await db.collection('daily_topics').where({ _id: e.postId }).update({ data: { commentCount: _.inc(1) } })).stats.updated;
  }

  try {
    let tOpenId = '', snip = '';
    if (e.parentId) {
      const p = (await db.collection('timeline_comments').doc(e.parentId).get()).data;
      if (p) { tOpenId = p._openid || p.authorUID; snip = p.content; if (!isTopic) isTopic = !!(await db.collection('daily_topics').where({ _id: e.postId }).count()).total; }
    } else {
      const p = (await db.collection('timeline_posts').doc(e.postId).get().catch(() => db.collection('daily_topics').doc(e.postId).get().catch(()=>null)))?.data;
      if (p) { tOpenId = p._openid || p.authorUID; snip = p.title || p.content || '分享了动态'; isTopic = !!p.topicType; }
    }
    if (tOpenId && tOpenId !== openId) await mailUtils.sendCommentNotification({ targetOpenId: tOpenId, postId: e.postId, commentId: cmt._id, author: e.author, content: e.content, postSnippet: snip, targetType: isTopic ? 'daily_topic' : 'post' });
    xpUtils.addXp({ action: 'daily_first_comment', targetUserId: openId, sourceUserId: openId }).catch(()=>{});
  } catch (err) {}
  return { success: true, _id: cmt._id };
}

// 5. 清理过期动态
async function handleSystemCleanup() {
  try {
    const ps = (await db.collection('timeline_posts').where({ status: -1, deleteTime: _.lt(new Date(Date.now() - 259200000)) }).limit(50).get()).data;
    for (let p of ps) {
      const fIds = (p.media || []).map(m => m.fileID).filter(Boolean);
      if (fIds.length) await cloud.deleteFile({ fileList: fIds }).catch(()=>{});
      await Promise.all(['timeline_comments', 'timeline_likes', 'timeline_favorites', 'timeline_comment_likes'].map(c => db.collection(c).where({ postId: p._id }).remove().catch(()=>{})));
      await db.collection('timeline_posts').doc(p._id).remove().catch(()=>{});
    }
    return { success: true, msg: `清理了 ${ps.length} 条动态` };
  } catch (err) { return { success: false, error: err }; }
}

// 6. 软删除动态
async function handleSoftDeletePost({ postId }) {
  try { if (!postId) throw 1; await db.collection('timeline_posts').doc(postId).update({ data: { status: -1, deleteTime: db.serverDate() } }); return { success: true }; } catch (e) { return { success: false }; }
}

// 7. 投票
async function handleVoteTopic(openId, { topicId, topicType, option, choiceIndex }) {
  try { await db.collection('daily_topics').doc(topicId).update({ data: { [topicType === 'choice' ? `votesC${choiceIndex}` : (option === 'A' ? 'votesA' : 'votesB')]: _.inc(1) } }); return { success: true, msg: '投票成功', openid: openId }; } catch (e) { return { success: false, errMsg: '数据库写入失败' }; }
}

// 8. 点赞/收藏
async function handleLikeService(myO, uid, e) {
  const inc = Number(e.count || 1), name = e.likerName || '神秘同学', ava = e.likerAvatar || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
  const match = uid ? { uid: _.eq(uid) } : { _openid: _.eq(myO) };

  try {
    if (['like', 'favorite'].includes(e.type)) {
      const isL = e.type === 'like', fld = isL ? 'likeCount' : 'favoriteCount', col = isL ? 'timeline_likes' : 'timeline_favorites', boost = isL ? 1800000 : 7200000;
      const p = (await db.collection('timeline_posts').doc(e.postId).get().catch(()=>null))?.data;
      const tOpen = p?._openid || p?.authorUID || '', snip = p?.title || p?.content || '未命名动态', isSelf = tOpen === myO;
      
      if (inc > 0 && (await db.collection(col).where(_.and([{ postId: _.eq(e.postId) }, match])).count()).total === 0) {
        await Promise.all([
          db.collection('timeline_posts').doc(e.postId).update({ data: { [fld]: _.inc(1), hotScore: _.inc(boost) } }),
          db.collection(col).add({ data: { _openid: myO, uid, postId: e.postId, targetOpenId: tOpen, isSelfAction: isSelf, ...(isL ? { nickName: name, avatar: ava } : {}), createTime: db.serverDate() } }),
          ...(!isSelf && tOpen ? [isL ? mailUtils.sendLikeNotification({ targetOpenId: tOpen, type: 'like_post', postId: e.postId, likerName: name, likerAvatar: ava, postSnippet: snip }) : null, xpUtils.addXp({ action: `${e.type}_post`, targetUserId: tOpen, sourceUserId: myO, targetItemId: e.postId })] : []),
          ...(isL ? [xpUtils.addXp({ action: 'daily_first_like', targetUserId: myO, sourceUserId: myO })] : [])
        ].filter(Boolean));
      } else if (inc < 0 && (await db.collection(col).where(_.and([{ postId: _.eq(e.postId) }, match])).count()).total > 0) {
        await Promise.all([db.collection('timeline_posts').doc(e.postId).update({ data: { [fld]: _.inc(-1), hotScore: _.inc(-boost) } }), db.collection(col).where(_.and([{ postId: _.eq(e.postId) }, match])).remove()]);
      }
    } else if (e.type === 'comment_like') {
      const c = (await db.collection('timeline_comments').doc(e.commentId).get().catch(()=>null))?.data;
      const tOpen = c?._openid || c?.authorUID || '', snip = c?.content || '', isSelf = tOpen === myO;
      const cMatch = uid ? _.or([{ uid: _.eq(uid) }, _.and([{ _openid: _.eq(myO) }, _.or([{ uid: _.exists(false) }, { uid: _.eq('') }, { uid: _.eq(null) }])])]) : { _openid: _.eq(myO) };

      if (inc > 0 && (await db.collection('timeline_comment_likes').where(_.and([{ commentId: _.eq(e.commentId) }, cMatch])).count()).total === 0) {
        await Promise.all([
          db.collection('timeline_comments').doc(e.commentId).update({ data: { likes: _.inc(1) } }),
          db.collection('timeline_comment_likes').add({ data: { _openid: myO, uid, postId: e.postId, commentId: e.commentId, targetOpenId: tOpen, isSelfAction: isSelf, createTime: db.serverDate() } }),
          ...(!isSelf && tOpen ? [mailUtils.sendLikeNotification({ targetOpenId: tOpen, type: 'like_comment', postId: e.postId, commentId: e.commentId, likerName: name, likerAvatar: ava, postSnippet: snip }), xpUtils.addXp({ action: 'like_comment', targetUserId: tOpen, sourceUserId: myO, targetItemId: e.commentId })] : []),
          xpUtils.addXp({ action: 'daily_first_like', targetUserId: myO, sourceUserId: myO })
        ]);
      } else if (inc < 0 && (await db.collection('timeline_comment_likes').where(_.and([{ commentId: _.eq(e.commentId) }, cMatch])).count()).total > 0) {
        await Promise.all([db.collection('timeline_comments').doc(e.commentId).update({ data: { likes: _.inc(-1) } }), db.collection('timeline_comment_likes').where(_.and([{ commentId: _.eq(e.commentId) }, cMatch])).remove()]);
      }
    } else if (e.type === 'profile_like') {
      const isSelf = e.targetOpenId === myO;
      await Promise.all([
        db.collection('register_students').doc(e.targetRealId).update({ data: { profileLikes: _.inc(1) } }),
        db.collection('profile_likes').add({ data: { _openid: myO, targetOpenId: e.targetOpenId, isSelfAction: isSelf, likerName: name, likerAvatar: ava, createTime: db.serverDate() } }),
        ...(!isSelf ? [mailUtils.sendLikeNotification({ targetOpenId: e.targetOpenId, type: 'like_profile', likerName: name, likerAvatar: ava, postSnippet: '给你递了一个大大的赞' }), xpUtils.addXp({ action: 'like_profile', targetUserId: e.targetOpenId, sourceUserId: myO })] : [])
      ]);
    }
    return { success: true };
  } catch (e) { return { success: false, error: e }; }
}

// 9. 获取历史话题
async function handleGetTopicHistory() {
  try {
    const ts = (await db.collection('daily_topics').where({ status: 2 }).orderBy('createTime', 'desc').limit(7).get()).data;
    if (!ts.length) return { success: true, data: [] };
    const cmts = await Promise.all(ts.map(t => db.collection('timeline_comments').where({ postId: t._id }).orderBy('likes', 'desc').limit(1).get().then(r => r.data[0] || null)));
    
    return { success: true, data: ts.map((t, i) => {
      const tot = t.topicType === 'choice' ? (t.choices||[]).reduce((s,_,x)=>s+(t[`votesC${x}`]||0),0) : (t.topicType === 'none' ? (t.commentCount||0) : (t.votesA||0)+(t.votesB||0));
      const c = cmts[i]; const d = new Date(t.createTime);
      return { ...t, topicType: t.topicType || 'battle', dateDisplay: isNaN(d) ? '未知' : `${d.getMonth()+1}月${d.getDate()}日`, totalVotes: tot, percentAStr: tot ? Math.round(((t.votesA||0)/tot)*100)+'%' : '50%', percentBStr: tot ? (100-Math.round(((t.votesA||0)/tot)*100))+'%' : '50%', optionsDisplay: t.topicType === 'choice' ? (t.choices||[]).map((txt, j) => { const v = t[`votesC${j}`]||0; return { label: typeof txt === 'string' ? txt : (txt.text||''), votes: v, percentStr: tot ? Math.round((v/tot)*100)+'%' : '0%', isTop: v > 0 && v === Math.max(...(t.choices||[]).map((_,x)=>t[`votesC${x}`]||0)) }; }) : [], topComment: c ? { avatar: c.author?.avatar, nickName: c.author?.nickName, content: (c.content||'').replace(/^\[.*?\]\s*/, ''), likes: c.likes||0 } : null };
    })};
  } catch (e) { return { success: false }; }
}

// 10. 反应堆游戏防刷/排位
async function handleCheckReaction(openId, uFb, e) {
  const avg = e.average, uid = e.uid || uFb || openId;
  try {
    const scrs = (await db.collection('reaction_scores').orderBy('average', 'asc').limit(30).get()).data;
    const thr = scrs.length >= 30 ? scrs[29].average : 320;
    if (!avg || avg < 80 || avg > thr) return { success: true, qualified: false, rank: (await db.collection('reaction_scores').where({ average: _.lt(avg) }).count()).total + 1, threshold: thr };

    const exist = (await db.collection('reaction_scores').where({ uid }).get()).data[0];
    if (exist) { if (avg < exist.average) await db.collection('reaction_scores').doc(exist._id).update({ data: { average: avg, fastest: Math.min(e.fastest, exist.fastest), slowest: Math.max(e.slowest, exist.slowest), updateTime: db.serverDate(), nickName: e.nickName || exist.nickName, avatar: e.avatar || exist.avatar } }); }
    else await db.collection('reaction_scores').add({ data: { uid, nickName: e.nickName || '神秘同学', avatar: e.avatar || '', average: avg, fastest: e.fastest || avg, slowest: e.slowest || avg, createTime: db.serverDate(), updateTime: db.serverDate() } });

    return { success: true, qualified: true, updated: !exist || avg < exist.average, rank: (await db.collection('reaction_scores').where({ average: _.lt(avg) }).count()).total + 1, threshold: thr };
  } catch (e) { return { success: false, qualified: false, threshold: 320 }; }
}

// 11. 获取我的收藏列表
async function handleGetMyFavorites(openId, uid, e) {
  const match = uid ? { uid: _.eq(uid) } : { _openid: _.eq(openId) };
  try {
    const favs = (await db.collection('timeline_favorites').where(match).orderBy('createTime', 'desc').skip(e.skip || 0).limit(e.limit || 10).get()).data;
    if (!favs.length) return { data: [], favCount: 0 };
    const ids = favs.map(f => f.postId);
    const [raw, likes, cmts] = await Promise.all([
      db.collection('timeline_posts').where({ _id: _.in(ids), status: 1, isPrivate: false }).get().then(r => ids.map(i => r.data.find(p => p._id === i)).filter(Boolean)),
      db.collection('timeline_likes').where(_.and([{ postId: _.in(ids) }, match])).get(),
      Promise.all(ids.map(id => db.collection('timeline_comments').where({ postId: id, parentId: "" }).orderBy('likes', 'desc').limit(1).get().then(r => (r.data[0]?.likes > 0) ? r.data[0] : null)))
    ]);

    const lIds = likes.data.map(l => l.postId);
    return { data: raw.map((p, i) => { 
      const c = cmts[i]; p.hasLiked = lIds.includes(p._id); 
      if (p.commentCount > 0 && c) p.topComment = { nickName: c.author.nickName, content: c.content, Permission: c.author.Permission || 0 }; 
      p._isMyPost = p.authorUID ? p.authorUID === uid : p._openid === openId; 
      if (p.isAnonymous) { p.author = { nickName: '匿名同学', avatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', Permission: 0 }; delete p._openid; delete p.authorUID; } 
      return p; 
    }), favCount: favs.length };
  } catch (e) { return { data: [], favCount: 0 }; }
}