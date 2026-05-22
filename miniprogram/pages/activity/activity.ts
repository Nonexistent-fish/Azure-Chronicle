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
    const db = wx.cloud.database();
    db.collection('activities').doc(id).get({
      success: (res) => {
        const data = res.data;
        const now = Date.now();

        // 1. 修复 iOS 无法解析中划线日期导致页面强行下线的兼容性隐患
        const parseDate = (t: any) => t ? new Date(String(t).replace(/-/g, '/')).getTime() : 0;
        const startTime = parseDate(data.start_time);
        const endTime = data.end_time ? parseDate(data.end_time) : Infinity;

        if (data.status === false || now < startTime || now > endTime) {
          this.setData({
            isOffline: true,
            offlineTips: data.offline_tips || '当前活动暂不可用'
          });
          return;
        }

        if (data.html_content) {
          let html = data.html_content;
          html = html.replace(/<p([\s>])/gi, '<p style="line-height: 2 !important; letter-spacing: 1px !important; margin-bottom: 12px !important;"$1');
          html = html.replace(/<span([\s>])/gi, '<span style="line-height: 2 !important; letter-spacing: 1px !important;"$1');
          
          const hrSpacing = "margin: 30px 0 !important;";
          const hrDashedStyle = "border: none; border-top: 1px dashed #ddd;";
          html = html.replace(/<hr([^>]*?)>/gi, (match) => {
            return /style\s*=\s*"/i.test(match) ? match.replace(/style\s*=\s*"/i, `style="${hrSpacing} `) : `<hr style="${hrSpacing} ${hrDashedStyle}">`;
          });
          
          // 2. 修复开源版过度简写导致无 inline style 的图片直接白屏丢失原属性的致命 Bug
          const imgLayout = "width: 48% !important; height: auto !important; float: left !important; margin: 1% !important; border-radius: 8px; display: block; box-sizing: border-box;";
          html = html.replace(/<img([^>]*?)>/gi, (match, attrs) => {
            return /style\s*=\s*"/i.test(match) ? match.replace(/style\s*=\s*"/i, `style="${imgLayout} `) : `<img ${attrs || ''} style="${imgLayout}">`;
          });
          
          html += '<div style="clear: both;"></div>';
          data.html_content = html;
        }

        this.setData({ activityData: data });
        if (data.bgm_url) this.initBGM(data.bgm_url);
        wx.hideLoading();
      },
      fail: () => {
        this.setData({ isOffline: true, offlineTips: '找不到该活动信息' });
        wx.hideLoading();
      }
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