const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const xpUtils = require('./common/xpUtils');
const mailUtils = require('./common/mailUtils');
const DYNAMICS_COLLECTION = 'timeline_posts'; 
const CONFIG_ID = '';//app_config数据库内统计人数加减的ID

// 工具：安全获取用户状态
const getSafeStatus = r => r ? Number(r.registerStatus ?? r.status ?? 0) : 0;

// 每日签到
async function handleSignIn(openid, { userId }) {
  try {
    if (!userId) {
      const { data } = await db.collection('register_students').where({ _openid: openid }).get();
      if (!data.length) return { success: false, msg: '未找到档案' };
      userId = (data.find(u => [1, 3].includes(Number(u.registerStatus))) || data[0])._id;
    }
    return await xpUtils.addXp({ action: 'sign_in', targetUserId: userId, sourceUserId: openid });
  } catch { return { success: false, msg: '签到失败' }; }
}

// 登录查验
async function handleLogin(openid) {
  try {
    const { data } = await db.collection('register_students').where({ _openid: openid }).get();
    return { success: true, hasUser: data.length > 0, user: data[0], openid };
  } catch { return { success: false, msg: '查询失败' }; }
}

// 提交注册与资料更新（防越权）
async function handleSubmitRegister(openid, { realName, className, weiXinAvatar, nickName, campus = '', phoneNumber = '', gender = 0 }) {
  if (!realName || !className || !weiXinAvatar || !nickName) return { success: false, msg: '信息不完整' };
  try {
    const { data: nicks } = await db.collection('register_students').where({ nickName, _openid: _.neq(openid) }).get();
    if (nicks.some(u => Number(u.registerStatus) !== -1)) return { success: false, msg: '昵称被占用' };

    const { data } = await db.collection('register_students').where({ _openid: openid }).get();
    if (data.length) {
      const t = data.find(u => Number(u.registerStatus) === -1) || data.find(u => Number(u.registerStatus) === 2) || data.find(u => Number(u.registerStatus) === 0) || data.find(u => [1, 3].includes(Number(u.registerStatus))) || data[0];
      const st = Number(t.registerStatus);
      if (st === 0) return { success: false, msg: '审核中' };
      if (st === 1 || st === 3) return { success: false, msg: '已通过' };

      await db.collection('register_students').doc(t._id).update({ data: { realName, className, weiXinAvatar, nickName, campus, phoneNumber, gender: Number(gender), Permission: t.Permission ?? 0, registerStatus: 0, rejectionReason: '', updateTime: db.serverDate() } });
      if (st === -1) await db.collection(DYNAMICS_COLLECTION).where({ _openid: openid, status: 3 }).update({ data: { status: 1 } }).catch(() => {});
      return { success: true, msg: '已提交等待审核' };
    }

    await db.collection('register_students').add({ data: { _openid: openid, realName, className, weiXinAvatar, nickName, campus, phoneNumber, gender: Number(gender), Permission: 0, registerStatus: 0, createTime: db.serverDate() } });
    return { success: true, msg: '提交成功' };
  } catch { return { success: false, msg: '提交异常' }; }
}

// 检查用户审核与封禁状态
async function handleCheckUserStatus(openid, { userId }) {
  try {
    const { data: conf } = await db.collection('test_account').where({ key: 'Bozhi_Future' }).get().catch(() => ({ data: [] }));
    const isSuperAdmin = conf.length > 0 && openid === conf[0].value;

    let u = null;
    if (userId) {
      const { data } = await db.collection('register_students').doc(userId).get().catch(() => ({ data: null }));
      if (data?._openid === openid) u = data;
    }
    if (!u) {
      const { data } = await db.collection('register_students').where({ _openid: openid }).get();
      if (data.length) u = data.find(x => getSafeStatus(x) === 0) || data.find(x => [1, 3].includes(getSafeStatus(x))) || data.find(x => getSafeStatus(x) === 2) || data.find(x => getSafeStatus(x) === -1) || data[0];
    }
    if (u) return { success: true, exists: true, openid, isSuperAdmin, userData: { ...u, registerStatus: getSafeStatus(u), rejectionReason: u.rejectionReason || '' } };
    return { success: true, exists: false, openid, isSuperAdmin };
  } catch { return { success: false, msg: '查询失败' }; }
}

// 获取公开资料
async function handleGetPublicProfile({ targetOpenId, targetId }) {
  if (!targetOpenId && !targetId) return { success: false, msg: '参数缺失' };
  try {
    const { data } = await db.collection('register_students').where(targetId ? { _id: targetId } : { _openid: targetOpenId }).get();
    return data.length ? { success: true, data: data[0] } : { success: false, msg: '不存在' };
  } catch { return { success: false, msg: '查询异常' }; }
}

// 更新常规资料
async function handleUpdateUserProfile(openid, { userId, updateData }) {
  if (!userId) return { success: false, msg: '缺少参数' };
  try {
    const { data } = await db.collection('register_students').doc(userId).get();
    if (data._openid !== openid && openid && openid !== '') return { success: false, msg: '非法操作' };//填写你的open_id
    const r = await db.collection('register_students').doc(userId).update({ data: { ...updateData, updateTime: db.serverDate() } });
    return { success: true, updated: r.stats.updated };
  } catch { return { success: false, msg: '更新失败' }; }
}

// 更新隐私敏感字段与风控
async function handleUpdatePrivacyInfo(openid, { field, value }) {
  if (!['phoneNumber', 'wechatId', 'qqId'].includes(field)) return { success: false, errMsg: '非法字段' };
  if (field === 'wechatId' && value) {
    try {
      const res = await cloud.openapi.security.msgSecCheck({ openid, scene: 1, version: 2, content: value });
      if (res.result?.suggest !== 'pass') return { success: false, errMsg: 'SEC_CHECK_FAIL' };
    } catch { return { success: false, errMsg: 'SEC_CHECK_FAIL' }; }
  }
  try {
    await db.collection('register_students').where({ _openid: openid }).update({ data: { [field]: value } });
    return { success: true };
  } catch { return { success: false, errMsg: 'DB_UPDATE_FAIL' }; }
}

// 账号注销与内容软删
async function handleUnsubscribeUser(openid, { targetUid }) {
  try {
    const q = targetUid ? { _id: targetUid, _openid: openid } : { _openid: openid };
    const { data } = await db.collection('register_students').where(_.and([q, { registerStatus: _.neq(-1) }])).get();
    if (!data.length) return { success: true, msg: '已注销' };
    await db.collection('register_students').where(q).update({ data: { registerStatus: -1, cancelTime: db.serverDate() } });
    await db.collection(DYNAMICS_COLLECTION).where({ ...(targetUid ? { 'author._id': targetUid } : { _openid: openid }), status: 1 }).update({ data: { status: 3, isPrivate: true } });
    await db.collection('app_config').doc(CONFIG_ID).update({ data: { registerUser: _.inc(-data.length) } }).catch(() => {});
    return { success: true };
  } catch (e) { return { success: false, errmsg: e.message }; }
}

// 昵称静默查重
async function handleCheckNickName(openid, { nickName }) {
  if (!nickName) return { isAvailable: false };
  try {
    const { data } = await db.collection('register_students').where({ nickName, _openid: _.neq(openid) }).get();
    return { success: true, isAvailable: !data.some(u => Number(u.registerStatus) !== -1) };
  } catch { return { success: false, isAvailable: true }; }
}

// 云函数入口与路由分发
exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const { action, ...payload } = event;

  const routers = {
    login: () => handleLogin(openid),
    submitRegister: () => handleSubmitRegister(openid, payload),
    checkUserStatus: () => handleCheckUserStatus(openid, payload),
    getPublicProfile: () => handleGetPublicProfile(payload),
    updateUserProfile: () => handleUpdateUserProfile(openid, payload),
    updatePrivacyInfo: () => handleUpdatePrivacyInfo(openid, payload),
    unsubscribeUser: () => handleUnsubscribeUser(openid, payload),
    checkNickName: () => handleCheckNickName(openid, payload),
    sign_in: () => handleSignIn(openid, payload),
    getPeersContacts: () => mailUtils.getPeersContacts(event.payload?.peerIds || event.peerIds),
    markAllAsRead: () => mailUtils.markAllAsRead(openid),
    hideExchanges: () => mailUtils.hideExchanges(event.payload?.ids || event.ids, openid),
    handle: () => mailUtils.handleContactExchange(event.payload || event),
    updateMailboxTime: () => mailUtils.updateMailboxTime(event.payload?.userId || event.userId)
  };

  return routers[action] ? routers[action]() : { success: false, msg: `未知指令: ${action}` };
};