// app.ts

export interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    appStatus: string,
    loginReadyCallback: Function | null,
    [key: string]: any 
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  configReadyCallback?: (mode: string) => void
  silentLogin?: () => void;
  initAppConfig?: () => void;
}

App<IAppOption>({
  globalData: {
    appStatus: '', // 默认审核模式状态
    loginReadyCallback: null,
  },
  
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'your-env-id-here', // 替换为自己的云开发环境ID
        traceUser: true,
      });
    }

    // 拉取全局配置与执行静默登录
    this.initAppConfig();
    if (this.silentLogin) {
      this.silentLogin();
    }
  },

  // 拉取云端审核配置
  async initAppConfig() {
    try {
      const res: any = await wx.cloud.callFunction({ 
        name: 'userService', 
        data: { action: 'getAppStatus' } 
      });
      const status = res.result.status || 'right'; 
      
      this.globalData.appStatus = status;
      
      if (this.configReadyCallback) {
        this.configReadyCallback(status);
      }
    } catch (e) {
      this.globalData.appStatus = 'right';
      if (this.configReadyCallback) {
        this.configReadyCallback('right');
      }
    }
  },

  // 静默登录机制
  async silentLogin() {
    try {
      const res: any = await wx.cloud.callFunction({ 
        name: 'userService', 
        data: { action: 'login' } 
      });
      
      if (res.result && res.result.success) {
        wx.setStorageSync('realOpenID', res.result.openid);
        
        let user = null;
        if (res.result.hasUser) {
          user = res.result.user;
          wx.setStorageSync('currentUser', user);
        } else {
          wx.removeStorageSync('currentUser');
        }

        if (this.globalData.loginReadyCallback) {
          this.globalData.loginReadyCallback(res.result.openid, user);
        }
      }
    } catch (err) {
      console.error('静默登录失败', err);
    }
  }
});