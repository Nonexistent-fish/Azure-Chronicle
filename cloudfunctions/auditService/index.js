const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SUPER_IDS = [''];//使用你自己的_openid

// 检查是否具备管理员或开发者权限
async function checkAdmin(openid) {
  if (SUPER_IDS.includes(openid)) return true;
  const { data } = await db.collection('register_students').where({ 
    _openid: openid,
    Permission: _.in([2, 3])
  }).get();
  return data.length > 0;
}

// 微信官方图文安全内容检测与降级处理
async function handleAutoContentCheck(openid, { text, imageFileId, buffer }) {
  if (imageFileId || buffer) {
    try {
      let val = buffer;
      if (imageFileId) {
        val = (await cloud.downloadFile({ fileID: imageFileId })).fileContent;
      }
      await cloud.openapi.security.imgSecCheck({
        media: { contentType: 'image/png', value: Buffer.from(val) }
      });
      return { success: true, isRisky: false };
    } catch (e) {
      const isRisky = e.errCode === 87014;
      return { success: !isRisky, isRisky, msg: isRisky ? '图片违规' : '服务降级放行' };
    }
  }

  if (text) {
    try {
      const res = await cloud.openapi.security.msgSecCheck({ openid, scene: 2, version: 2, content: text });
      const risky = res?.result?.suggest === 'risky';
      return { success: !risky, isRisky: risky, msg: risky ? '包含违规词汇' : '' };
    } catch (e) {
      return { success: true, isRisky: false, msg: '服务降级放行' };
    }
  }

  return { success: true, isRisky: false };
}

// 处理用户注册审核状态
async function handleAuditUser({ targetUid, auditStatus, rejectReason = '信息不符' }) {
  if (!targetUid) return { success: false, msg: '参数缺失' };
  const isPass = auditStatus === 'pass';
  if (!isPass && auditStatus !== 'reject') return { success: false, msg: `未知审核状态: ${auditStatus}` };

  try {
    const res = await db.collection('register_students').doc(targetUid).update({
      data: {
        registerStatus: isPass ? 1 : 2,
        status: isPass ? 1 : 2,
        rejectionReason: isPass ? '' : rejectReason,
        updateTime: db.serverDate()
      }
    });

    if (isPass) {
      db.collection('app_config').doc('26894d4e6995707100f571084c3b0615')
        .update({ data: { registerUser: _.inc(1) } }).catch(() => {});
    }

    return { success: res.stats.updated > 0, updated: res.stats.updated };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// 处理用户动态帖子审核
async function handleAuditPost({ postId, auditStatus, rejectReason = '内容不符合社区规范' }) {
  if (!postId) return { success: false, msg: '参数缺失' };
  const isPass = auditStatus === 'pass';
  if (!isPass && auditStatus !== 'reject') return { success: false, msg: `未知审核状态: ${auditStatus}` };

  try {
    const data = { status: isPass ? 1 : 2, auditTime: db.serverDate() };
    if (!isPass) data.rejectionReason = rejectReason;

    const res = await db.collection('timeline_posts').doc(postId).update({ data });
    return { success: res.stats.updated > 0 };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

// 云函数入口与路由分发
exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID || event.openid;
  const { action } = event;

  if (action === 'autoCheck') return handleAutoContentCheck(openid, event);
  if (!(await checkAdmin(openid))) return { success: false, msg: '越权拦截' };

  const routers = {
    auditUser: handleAuditUser,
    auditPost: handleAuditPost
  };

  if (routers[action]) return routers[action](event);
  return { success: false, msg: `未知的审核路由动作: ${action}` };
};