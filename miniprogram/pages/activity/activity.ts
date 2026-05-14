export {};
const app = getApp();

Page<any, any>({
  data: { activityData: null as any, isOffline: false, offlineTips: '活动尚未开启', showPopup: false, popupData: {} as any, isPlayingBGM: false },
  innerAudioContext: null as WechatMiniprogram.InnerAudioContext | null,

  onLoad(options: any) {
    if (!options.id) return wx.showToast({ title: '参数错误', icon: 'none' });
    this.fetchActivityData(options.id);
  },

  onUnload() { this.innerAudioContext?.destroy(); },
  goBack() { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) }); },

  fetchActivityData(id: string) {
    wx.cloud.database().collection('activities').doc(id).get({
      success: (res) => {
        const data = res.data;
        const now = Date.now();
        const start = data.start_time ? new Date(data.start_time).getTime() : 0;
        const end = data.end_time ? new Date(data.end_time).getTime() : Infinity;

        if (data.status === false || now < start || now > end) {
          return this.setData({ isOffline: true, offlineTips: data.offline_tips || '当前活动暂不可用，去论坛看看吧~' });
        }

        if (data.html_content) {
          const hrSpc = "margin: 30px 0 !important;";
          const hrDash = "border: none; border-top: 1px dashed #ddd;";
          const imgLyt = "width: 48% !important; height: auto !important; float: left !important; margin: 1% !important; border-radius: 8px; display: block; box-sizing: border-box;";

          data.html_content = data.html_content
            .replace(/<p([\s>])/gi, '<p style="line-height: 2 !important; letter-spacing: 1px !important; margin-bottom: 12px !important;"$1')
            .replace(/<span([\s>])/gi, '<span style="line-height: 2 !important; letter-spacing: 1px !important;"$1')
            .replace(/<hr([^>]*?)>/gi, (m: string) => /style\s*=\s*"/i.test(m) ? m.replace(/style\s*=\s*"/i, `style="${hrSpc} `) : `<hr style="${hrSpc} ${hrDash}">`)
            .replace(/<img([^>]*?)>/gi, (m: string) => /style\s*=\s*"/i.test(m) ? m.replace(/style\s*=\s*"/i, `style="${imgLyt} `) : `<img style="${imgLyt}">`)
            + '<div style="clear: both;"></div>';
        }

        this.setData({ activityData: data });
        if (data.bgm_url) this.initBGM(data.bgm_url);
      },
      fail: () => this.setData({ isOffline: true, offlineTips: '找不到该活动信息' })
    });
  },

  initBGM(url: string) {
    this.innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext.src = url;
    this.innerAudioContext.loop = true;
    this.innerAudioContext.play();
    this.setData({ isPlayingBGM: true });
  },

  toggleBGM() {
    if (!this.innerAudioContext) return;
    this.data.isPlayingBGM ? this.innerAudioContext.pause() : this.innerAudioContext.play();
    this.setData({ isPlayingBGM: !this.data.isPlayingBGM });
  },

  handleBlockClick(e: any) {
    const { action, actionData } = e.currentTarget.dataset;
    if (!action) return;

    switch (action) {
      case 'MapsTo': 
      case 'navigateTo':
        const url = typeof actionData === 'string' ? actionData : (actionData?.url || actionData?.path);
        if (url) wx.navigateTo({ url, fail: () => wx.switchTab({ url }) });
        break;
      case 'showCustomPopup': 
        if (actionData) this.setData({ showPopup: true, popupData: actionData });
        break;
      case 'showToast': 
        wx.showToast({ title: typeof actionData === 'string' ? actionData : (actionData?.title || '成功'), icon: 'none' });
        break;
    }
  },
  closePopup() { this.setData({ showPopup: false }); }
});