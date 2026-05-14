const mailUtils = require('./common/mailUtils');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 工具函数：生成随机码、获取北京时间今日字符串、数组洗牌
const genCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();
const getTodayStr = () => new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 祈愿盲盒：获取活动配置、奖池信息及用户当前资产
async function getGachaConfig(openid, { activityId }) {
  try {
    const actId = String(activityId || '').trim();
    if (!actId) return { code: -1, msg: '缺少活动ID' };

    const { data: acts } = await db.collection('activities').where({ _id: actId }).get();
    if (!acts.length) return { code: -1, msg: `找不到ID为 ${actId} 的活动` };
    const act = acts[0];
    if (!act.status) return { code: -1, msg: '该祈愿活动暂未开启' };

    const { data: prizes } = await db.collection('lottery_prizes').where({ activity_id: actId }).get();
    const fItems = [], eItems = [];

    prizes.forEach(p => {
      if (p.is_featured) fItems.push({
        _id: p._id, name: p.name || '未命名大奖', desc: p.featured_desc || '',
        loreLines: p.featured_lore ? p.featured_lore.split('\n').filter(l => l.trim()) : [],
        imageUrl: p.image || '', bgUrl: p.featured_bg || act.page_bg_image || ''
      });
      if (p.is_exchangeable) eItems.push({
        _id: p._id, name: p.name || '未命名兑换物', cost: Number(p.exchange_cost) || 0, imageUrl: p.image || ''
      });
    });

    const fragId = act.fragment_id || 'default_fragment';
    const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
    const user = users[0] || {};
    const ms = Array.isArray(act.milestone_config) ? act.milestone_config : [];

    return {
      code: 0,
      data: {
        poolInfo: { title: act.main_title || '未命名祈愿', subtitle: act.sub_title || '', bgUrl: act.page_bg_image || '', bgmUrl: act.bgm_url || '' },
        fragmentId: fragId,
        maxMilestone: ms.length ? Math.max(...ms.map(m => Number(m.target) || 0)) : 30,
        milestones: ms, featuredItems: fItems, exchangeItems: eItems,
        userAssets: { fragments: Number(user.wallet?.[fragId] || 0), draws: Number(user.lotto_draws?.[actId] || 0), points: user.points || 0 }
      }
    };
  } catch (err) {
    return { code: 500, msg: `配置异常: ${err.message}` };
  }
}

// 祈愿盲盒：执行抽卡逻辑与资产扣除
async function gachaDraw(openid, { activityId, count }) {
  try {
    if (!activityId || !count) return { code: -1, msg: '参数缺失' };

    const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
    if (!users.length) return { code: -1, msg: '用户未注册' };
    const user = users[0];

    const { data: act } = await db.collection('activities').doc(activityId).get();
    if (!act) return { code: -1, msg: '活动不存在' };

    const cost = count === 5 ? 45 : count * (act.draw_cost || 10);
    if (user.points === undefined || user.points < cost) return { code: -1, msg: `后台校验：积分不足，需 ${cost} 积分` };

    const fragId = act.fragment_id || 'default_fragment';
    const { data: prizes } = await db.collection('lottery_prizes').where({ activity_id: activityId }).get();
    const weight = prizes.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);

    let rewards = [], fragInc = 0, ptsInc = 0;
    let skins = user.ownedSkins || [];

    for (let i = 0; i < count; i++) {
      let r = Math.random() * weight, sum = 0, hit = null;
      for (let p of prizes) {
        sum += (Number(p.weight) || 0);
        if (r <= sum) { hit = p; break; }
      }
      if (!hit) continue;

      if (['fragment', '碎片'].includes(hit.prize_type)) {
        fragInc += (Number(hit.asset_value) || 1);
        rewards.push({ name: hit.name, image: hit.image, type: 'fragment' });
      } else if (['virtual_asset', '虚拟资产'].includes(hit.prize_type)) {
        const val = String(hit.asset_value);
        if (!isNaN(Number(val)) && val.trim()) {
          ptsInc += Number(val);
          rewards.push({ name: hit.name, image: hit.image, type: 'points' });
        } else {
          if (skins.some(s => (typeof s === 'string' ? s : s.templateId) === val && (s.expireTime === -1 || s.expireTime > Date.now()))) {
            fragInc += 10;
            rewards.push({ name: `${hit.name} (已拥有, 折算碎片x10)`, image: hit.image, type: 'converted' });
          } else {
            skins.push({ uid: Math.random().toString(36).substring(2, 10) + Date.now().toString(36), templateId: val, obtainTime: Date.now(), expireTime: -1, obtainWay: 'lotto' });
            rewards.push({ name: hit.name, image: hit.image, type: 'item' });
          }
        }
      } else {
        rewards.push({ name: hit.name, image: hit.image, type: 'other' });
      }
    }

    const oldD = user.lotto_draws?.[activityId] || 0;
    const newD = oldD + count;

    if (Array.isArray(act.milestone_config)) {
      act.milestone_config.forEach(m => {
        if (m.isReward && m.target > oldD && m.target <= newD) fragInc += (Number(m.rewardCount) || 0);
      });
    }

    const updateData = {
      points: _.inc(ptsInc - cost),
      [`wallet.${fragId}`]: _.inc(fragInc),
      [`lotto_draws.${activityId}`]: _.inc(count),
      ownedSkins: skins
    };

    await db.collection('register_students').doc(user._id).update({ data: updateData });

    return {
      code: 0,
      data: {
        newTotalDraws: newD,
        newFragments: (user.wallet?.[fragId] || 0) + fragInc,
        newPoints: user.points + ptsInc - cost,
        rewards
      }
    };
  } catch (err) {
    return { code: 500, msg: `系统异常: ${err.message}` };
  }
}

// 祈愿盲盒：碎片兑换物品
async function gachaExchange(openid, { activityId, prizeId }) {
  try {
    if (!activityId || !prizeId) return { code: -1, msg: '参数缺失' };

    const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
    if (!users.length) return { code: -1, msg: '用户未注册' };
    const user = users[0];

    const { data: act } = await db.collection('activities').doc(activityId).get();
    if (!act) return { code: -1, msg: '活动不存在' };

    const fragId = act.fragment_id || 'default_fragment';
    const { data: prize } = await db.collection('lottery_prizes').doc(prizeId).get();
    if (!prize || !prize.is_exchangeable) return { code: -1, msg: '该物品不可兑换' };

    const cost = Number(prize.exchange_cost);
    const frags = user.wallet?.[fragId] || 0;
    if (frags < cost) return { code: -1, msg: '碎片不足' };

    let updateData = { [`wallet.${fragId}`]: _.inc(-cost) };
    const val = String(prize.asset_value);

    if (!isNaN(Number(val)) && val.trim()) {
      updateData.points = _.inc(Number(val));
    } else {
      if ((user.ownedSkins || []).some(s => (typeof s === 'string' ? s : s.templateId) === val && (s.expireTime === -1 || s.expireTime > Date.now()))) {
        return { code: -1, msg: '您已拥有该外观，无需重复兑换' };
      }
      updateData.ownedSkins = _.push({ templateId: val, obtainTime: Date.now(), expireTime: -1, obtainWay: 'exchange' });
    }

    await db.collection('register_students').doc(user._id).update({ data: updateData });
    return { code: 0, data: { newFragments: frags - cost } };
  } catch (err) {
    return { code: 500, msg: `系统异常: ${err.message}` };
  }
}

// 抽奖活动：安全拉取奖品列表（屏蔽敏感数据如CDK）
async function getPrizes({ activityId }) {
  try {
    if (!activityId) return { success: false, msg: '缺少活动 ID' };
    const { data } = await db.collection('lottery_prizes').where({ activity_id: activityId }).get();
    return { success: true, data: data.map(p => { delete p.cdk_list; return p; }) };
  } catch {
    return { success: false, msg: '拉取失败' };
  }
}

// 抽奖活动：每日领取免费抽奖券
async function claimDailyTicket(openid, { activityId }) {
  if (!activityId) return { success: false, msg: '缺少活动 ID' };
  const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
  if (!users.length) return { success: false, msg: '用户未注册' };

  const today = getTodayStr();
  if (users[0].last_lottery_claim_date === today) return { success: false, msg: '今天已经领取过了，请勿重复调用接口' };

  const tk = genCode();
  await db.collection('lottery_tickets').add({ data: { activity_id: activityId, ticket_code: tk, _openid: openid, source: 'daily_claim', create_time: db.serverDate() } });
  await db.collection('register_students').doc(users[0]._id).update({ data: { last_lottery_claim_date: today } });

  return { success: true, msg: '领取成功', ticket: tk };
}

// 抽奖活动：填写好友暗号并批量派发抽奖券
async function submitFriendCode(openid, { activityId, friendCode }) {
  if (!activityId || !friendCode) return { success: false, msg: '参数缺失' };
  const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
  if (!users.length) return { success: false, msg: '用户未注册' };
  const user = users[0];

  if (user.activity_invites?.[activityId] === friendCode) return { success: false, msg: '不能填写自己的邀请码' };
  if (user.activity_filled_friend_codes?.[activityId]) return { success: false, msg: '本次活动您已绑定过邀请码，不可篡改' };

  const { data: inviters } = await db.collection('register_students').where({ [`activity_invites.${activityId}`]: friendCode }).get();
  if (!inviters.length) return { success: false, msg: '无效的邀请码，未找到对应好友' };

  const invOpenid = inviters[0]._openid;
  const tks = Array.from({ length: 4 }, genCode);

  await Promise.all([
    db.collection('lottery_tickets').add({ data: { activity_id: activityId, ticket_code: tks[0], _openid: openid, source: 'fill_invite', create_time: db.serverDate() } }),
    db.collection('lottery_tickets').add({ data: { activity_id: activityId, ticket_code: tks[1], _openid: invOpenid, source: 'invite_reward', create_time: db.serverDate() } }),
    db.collection('lottery_tickets').add({ data: { activity_id: activityId, ticket_code: tks[2], _openid: invOpenid, source: 'invite_reward', create_time: db.serverDate() } }),
    db.collection('lottery_tickets').add({ data: { activity_id: activityId, ticket_code: tks[3], _openid: invOpenid, source: 'invite_reward', create_time: db.serverDate() } })
  ]);

  await db.collection('register_students').doc(user._id).update({ data: { [`activity_filled_friend_codes.${activityId}`]: friendCode } });
  return { success: true, msg: '兑换成功' };
}

// 定时任务：扫描到期活动，自动开奖并下发奖励
async function executeLotteryDraw() {
  const now = db.serverDate();
  const { data: acts } = await db.collection('activities').where({ draw_time: _.lte(now), is_drawn: _.neq(true) }).get();
  if (!acts.length) return { msg: '当前没有需要开奖的活动' };

  for (let act of acts) {
    const actId = act._id;
    await db.collection('activities').doc(actId).update({ data: { is_drawn: true, draw_execute_time: now } });

    let tks = [], skip = 0;
    while (true) {
      const { data } = await db.collection('lottery_tickets').where({ activity_id: actId }).skip(skip).limit(1000).get();
      tks.push(...data);
      if (data.length < 1000) break;
      skip += 1000;
    }
    if (!tks.length) continue;

    tks = shuffle(tks);
    const { data: prizes } = await db.collection('lottery_prizes').where({ activity_id: actId }).get();
    let wIdx = 0, mails = [], updates = [], wonMap = new Map();

    for (let p of prizes) {
      let qty = p.quantity || 0, isSkin = false, val = null;
      if (['virtual_asset', '虚拟资产'].includes(p.prize_type) && p.asset_value) {
        val = String(p.asset_value);
        if (!isNaN(Number(val)) && val.trim()) val = Number(val);
        else isSkin = true;
      }

      while (qty > 0 && wIdx < tks.length) {
        const tk = tks[wIdx];
        if (isSkin) {
          const set = wonMap.get(tk._openid) || new Set();
          if (set.has(val)) { tks.push(tk); wIdx++; continue; }
          wonMap.set(tk._openid, set.add(val));
        }

        let txt = `恭喜你在[${act.main_title || act.sub_title || act.title || '抽奖活动'}]中抽中了[${p.name}]!\n`;
        let sub = 'reward', cdk = '', hasCdk = false;

        if (['virtual_asset', '虚拟资产'].includes(p.prize_type)) {
          txt += `已自动发放至您的账户，请前往个人中心查看！`;
          updates.push({ openid: tk._openid, isSkin, val });
        } else if (p.prize_type === 'cdk') {
          if (p.cdk_list?.length) {
            cdk = p.cdk_list.pop();
            hasCdk = true;
            sub = 'cdk';
            txt += `请复制下方兑换码前往steam平台兑换您的奖励。`;
            await db.collection('lottery_prizes').doc(p._id).update({ data: { cdk_list: p.cdk_list, quantity: _.inc(-1) } });
          } else break;
        } else if (p.prize_type === 'physical') {
          txt += `您获得了实物大奖：【${p.name}】！\n领取指引：${p.claim_instruction || '请凭借此邮件截图联系管理员。'}`;
        }

        mails.push({ targetOpenId: tk._openid, isRead: false, isDeleted: false, type: 'system_notification', subType: sub, has_cdk: hasCdk, cdk_code: cdk, content: txt, statusText: p.prize_type === 'cdk' ? '🎁 奖励下发' : '🎊 中奖通知', createTime: db.serverDate(), updateTime: db.serverDate() });
        await db.collection('lottery_results').add({ data: { activity_id: actId, prize_name: p.name, prize_type: p.prize_type, _openid: tk._openid, ticket_code: tk.ticket_code, cdk_code: cdk, create_time: db.serverDate() } });
        qty--; wIdx++;
      }
    }

    for (let m of mails) await mailUtils.sendSystemMail(m);
    for (let u of updates) {
      if (u.isSkin) await db.collection('register_students').where({ _openid: u.openid }).update({ data: { ownedSkins: _.push({ templateId: u.val, obtainTime: Date.now(), expireTime: -1, obtainWay: 'lottery_draw' }) } });
      else if (u.val > 0) await db.collection('register_students').where({ _openid: u.openid }).update({ data: { points: _.inc(u.val) } });
    }
  }
  return { msg: '开奖巡逻执行完毕' };
}

// 积分夺宝：基于全局奖池的简单抽奖逻辑
async function playLotto(openid) {
  try {
    const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
    if (!users.length) return { success: false, msg: '用户未注册' };
    const user = users[0];
    if ((user.points || 0) < 2) return { success: false, msg: '积分不足，需要 2 积分' };

    const { data: pools } = await db.collection('lotto_pool').where({ poolType: 'global' }).get();
    if (!pools.length) return { success: false, msg: '系统奖池未初始化' };
    const pool = pools[0];

    if (Math.random() < 0.01) {
      await db.collection('register_students').doc(user._id).update({ data: { points: _.inc(pool.currentJackpot - 2) } });
      await db.collection('lotto_pool').doc(pool._id).update({ data: { currentJackpot: 80 } });
      return { success: true, isWin: true, winAmount: pool.currentJackpot, msg: '祥瑞降临，清空奖池！' };
    }
    await db.collection('register_students').doc(user._id).update({ data: { points: _.inc(-2) } });
    await db.collection('lotto_pool').doc(pool._id).update({ data: { currentJackpot: _.inc(1) } });
    return { success: true, isWin: false, msg: '诚心祈福，再接再厉' };
  } catch {
    return { success: false, msg: '系统繁忙，请稍后再试' };
  }
}

// 每日运势：抽签预览(peek)与确认提交(commit)
async function handleFortune(openid, action) {
  const today = getTodayStr();
  const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
  if (!users.length) return { success: false, msg: '用户未注册' };
  const user = users[0];

  const hasKoi = (user.achievements || []).some(a => a.id === 'fortune_koi_01');
  if (user.lastFortuneDate === today && user.lastFortuneLevel) return { success: true, isCommitted: true, level: user.lastFortuneLevel, isSP: hasKoi };

  if (action === 'peek') {
    if (user.pendingFortune?.date === today) return { success: true, isCommitted: false, level: user.pendingFortune.level, isSP: user.pendingFortune.isSP };

    const r = Math.floor(Math.random() * 1000) + 1;
    const isSP = r <= 2;
    const level = isSP ? '锦鲤' : r <= 100 ? '大吉' : r <= 400 ? '中吉' : r <= 800 ? '小吉' : r <= 950 ? '平' : '水逆';

    await db.collection('register_students').doc(user._id).update({ data: { pendingFortune: { date: today, level, isSP } } });
    return { success: true, isCommitted: false, level, isSP };
  }

  if (action === 'commit') {
    if (user.pendingFortune?.date !== today) return { success: false, msg: '无待确认的运势' };
    const { level, isSP } = user.pendingFortune;
    let ud = { lastFortuneDate: today, lastFortuneLevel: level, xp: _.inc(2), pendingFortune: _.remove() }, frameUrl = '';

    if (isSP) {
      if (!hasKoi) {
        frameUrl = 'cloud://test1-3gu356f7c94728ab.7465-test1-3gu356f7c94728ab-1404357158/weda-uploader/6ee2eaa2830da7626ce08bde8906cb75-koi.png';
        ud.avatarFrameUrl = frameUrl;
        ud.avatarFrameSizeLevel = 'normal';
        ud.achievements = _.push({ id: 'fortune_koi_01', unlockTime: Date.now() });
      } else ud.xp = _.inc(50);
    }

    await db.collection('register_students').doc(user._id).update({ data: ud });
    return { success: true, isCommitted: true, isNewDraw: true, level, isSP, frameUrl };
  }
}

// 社交活动：初始化用户的独立邀请码
async function initInviteCode(openid, { activityId, inviteCode }) {
  try {
    const { data: users } = await db.collection('register_students').where({ _openid: openid }).get();
    if (!users.length) return { success: false };
    const ud = users[0].activity_invites ? { [`activity_invites.${activityId}`]: inviteCode } : { activity_invites: { [activityId]: inviteCode } };
    await db.collection('register_students').doc(users[0]._id).update({ data: ud });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// 云函数入口与路由分发
exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID || event.openid;
  const action = event.action || (event.TriggerName === 'autoDrawTimer' ? 'executeLotteryDraw' : null);

  const routers = {
    getGachaConfig,
    gachaDraw,
    gachaExchange,
    getPrizes,
    claimDaily: claimDailyTicket,
    claimDailyTicket,
    submitFriendCode,
    executeLotteryDraw: () => executeLotteryDraw(),
    initInviteCode,
    playLotto: () => playLotto(openid),
    peekFortune: () => handleFortune(openid, 'peek'),
    commitFortune: () => handleFortune(openid, 'commit')
  };

  return routers[action] ? routers[action](openid, event) : { success: false, msg: `未知的游戏路由动作: ${action}` };
};