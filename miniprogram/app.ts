// app.ts

export interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    loginReadyCallback: Function | null, 
    [key: string]: any 
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
  silentLogin?: () => void;
}

App<IAppOption>({
  globalData: {
    loginReadyCallback: null, 
  },
  
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'test1-3gu356f7c94728ab', // 你的环境ID
        traceUser: true,
      });
    }

    // 执行静默登录
    if (this.silentLogin) {
      this.silentLogin();
    }
  },

  // 静默登录
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
          // 写入缓存
          wx.setStorageSync('currentUser', user);
        } else {
          // 没查到用户，清理旧缓存
          wx.removeStorageSync('currentUser');
        }

        // 拿到结果后，通知正在等待的 index.ts
        if (this.globalData.loginReadyCallback) {
          this.globalData.loginReadyCallback(user);
        }
      }
    } catch (err) {
      console.error('静默登录失败', err);
      // 失败也需通知首页停止转圈，防卡死
      if (this.globalData.loginReadyCallback) {
        this.globalData.loginReadyCallback(null);
      }
    }
  }
});