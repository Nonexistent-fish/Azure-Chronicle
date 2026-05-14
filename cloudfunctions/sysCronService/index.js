const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 获取并同步每日一言到全局配置
async function refreshHitokoto() {
  try {
    const { data } = await axios.get('https://v1.hitokoto.cn');
    if (!data?.hitokoto) return { success: false, msg: 'API返回异常' };

    const sentence = { text: data.hitokoto, from: data.from || '青笺', fromWho: data.from_who || '' };
    const { data: configs } = await db.collection('app_config').limit(1).get();

    if (configs.length) {
      await db.collection('app_config').doc(configs[0]._id).update({ data: { sentence } });
      return { success: true, data: sentence };
    }
    return { success: false, msg: '未找到配置记录' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 每日话题上新：优先插队话题 -> 随机常规话题 -> 克隆历史话题
async function refreshDailyTopic() {
  try {
    const Topics = db.collection('daily_topics');
    let next = null, isClone = false;

    const { data: priority } = await Topics.where({ status: 3 }).orderBy('createTime', 'asc').limit(1).get();
    if (priority.length) {
      next = priority[0];
    } else {
      const { list: normal } = await Topics.aggregate().match({ status: 0 }).sample({ size: 1 }).end();
      if (normal.length) next = normal[0];
      else {
        const { list: old } = await Topics.aggregate().match({ status: 2 }).sample({ size: 1 }).end();
        if (old.length) { next = old[0]; isClone = true; }
      }
    }

    if (!next) return { success: false, msg: '题库为空' };

    await Topics.where({ status: 1 }).update({ data: { status: 2 } });

    if (isClone) {
      const clone = { ...next, status: 1, votesA: 0, votesB: 0, createTime: db.serverDate() };
      delete clone._id;
      if (clone.topicType === 'choice' && Array.isArray(clone.choices)) {
        clone.choices.forEach((c, i) => { clone[`votesC${i}`] = 0; if (typeof c === 'object') c.votes = 0; });
      }
      await Topics.add({ data: clone });
    } else {
      await Topics.doc(next._id).update({ data: { status: 1, createTime: db.serverDate() } });
    }
    return { success: true, msg: '话题轮换成功' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 同步指定外币的最新汇率
async function syncExchangeRate() {
  const keys = { id: '10014690', key: 'e1bf4e7557a7111b2157a4980f0b18ac' };
  const cur = ['USD', 'EUR', 'JPY', 'GBP', 'RUB', 'KRW'];
  const rates = {};

  try {
    await Promise.all(cur.map(c =>
      axios.get(`https://cn.apihz.cn/api/jinrong/huilv.php?id=${keys.id}&key=${keys.key}&from=CNY&to=${c}&money=1`)
        .then(res => { if (res.data?.code === 200) rates[c] = parseFloat(res.data.rate); })
        .catch(() => {})
    ));

    if (Object.keys(rates).length) {
      await db.collection('exchange_rates').doc('latest').set({ data: { base: 'CNY', rates, updateTime: db.serverDate() } });
      return { success: true, rates };
    }
    return { success: false, msg: '接口无有效返回' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 云函数入口：定时任务与系统服务路由总线
exports.main = async (event) => {
  const triggerMap = {
    dailyMorningTopic: 'refreshDailyTopic',
    dailySyncExchange: 'syncExchangeRate',
    dailySyncHitokoto: 'refreshHitokoto'
  };
  
  const action = triggerMap[event.TriggerName] || event.action;

  const routers = {
    refreshHitokoto,
    refreshDailyTopic,
    syncExchangeRate,
    getAppStatus
  };

  return routers[action] ? routers[action]() : { success: false, msg: `未知指令: ${action}` };
};