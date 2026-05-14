export {};
const db = wx.cloud.database();

Page<any, any>({
  data: {
    isLoading: true, isRegistered: false, isSubmitting: false, userInfo: null as any,
    tempName: '', tempClass: '', avatarUrl: '', tempNickName: '', nickNameError: '', 
    campusList: ['月罗路校区', '四元路校区'], campusIndex: 0, tempCampus: '月罗路校区' 
  },

  onShow() { this.checkLoginStatus(); },

  handleCampusChange(e: any) { this.setData({ campusIndex: e.detail.value, tempCampus: this.data.campusList[e.detail.value] }); },
  onChooseAvatar(e: any) { this.setData({ avatarUrl: e.detail.avatarUrl }); },
  handleInputNickName(e: any) { this.setData({ tempNickName: e.detail.value, nickNameError: '' }); },
  handleInputName(e: any) { this.setData({ tempName: e.detail.value }); },
  handleInputClass(e: any) { this.setData({ tempClass: e.detail.value }); },

  async checkNickNameSilent(e: any) {
    const newName = e.detail.value.trim();
    this.setData({ tempNickName: newName, nickNameError: '' });
    if (!newName) return;
    if (newName.length < 3) return this.setData({ nickNameError: '昵称不能少于3个字' });
    if (newName.length > 8) return this.setData({ nickNameError: '最高只有8个字' });

    if (['博智拾光', '博智未来', '青笺拾光', '青笺校园','青笺校园日记'].some(word => newName.includes(word))) return this.setData({ nickNameError: '包含系统违禁词' });

    try {
      const textCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: newName } });
      if (textCheck.result?.isRisky) return this.setData({ nickNameError: '包含违规词' });

      const duplicateCheck: any = await wx.cloud.callFunction({ name: 'userService', data: { action: 'checkNickName', nickName: newName } });
      if (duplicateCheck.result?.isAvailable === false) this.setData({ nickNameError: '该昵称已被占用' });
    } catch (err) { console.error('静默校验失败', err); }
  },

  async checkLoginStatus() {
    this.setData({ isLoading: true });
    try {
      const { result } = await wx.cloud.callFunction({ name: 'userService', data: { action: 'checkUserStatus' } }) as any;
      const { exists, userData } = result || {};
      
      if (exists && userData) {
        wx.setStorageSync('currentUser', userData); 
        const status = Number(userData.registerStatus);

        if (status === -1) {
          wx.setStorageSync('isRegistered', false);
          return this.setData({ isLoading: false, isRegistered: false, userInfo: userData });
        }

        wx.setStorageSync('isRegistered', true); 
        this.setData({ isLoading: false, isRegistered: true, userInfo: userData });
        
        if (status === 1) return setTimeout(() => wx.switchTab({ url: '/pages/index/index', fail: () => wx.reLaunch({ url: '/pages/index/index' }) }), 1500);
        if (status === 3) return setTimeout(() => wx.reLaunch({ url: '/pages/mine/tools/tools' }), 1500);
      } else {
        wx.removeStorageSync('currentUser'); wx.removeStorageSync('isRegistered');
        this.setData({ isLoading: false, isRegistered: false, userInfo: null });
      }
    } catch { this.setData({ isLoading: false }); }
  },

  async submitForm() {
    if (this.data.isSubmitting) return;

    const { tempName, tempClass, avatarUrl, tempNickName, tempCampus, nickNameError } = this.data;
    const finalNickName = tempNickName.trim();

    if (!avatarUrl || !finalNickName || !tempName || !tempClass) return wx.showToast({ title: '请填写完整资料', icon: 'none' });
    if (nickNameError) return wx.showToast({ title: '请修正标红的错误信息', icon: 'none' });
    if (finalNickName.length < 3 || finalNickName.length > 8) return this.setData({ nickNameError: '昵称长度需在3-8个字之间' });

    const { confirm } = await wx.showModal({ title: '身份绑定确认', content: '您的校园身份将与当前微信号【强绑定】，一经提交无法自行解绑或修改。请确认填写的信息真实无误。', confirmText: '确认提交', confirmColor: '#10b981', cancelText: '再检查下' });
    if (!confirm) return;
    
    this.setData({ isSubmitting: true });

    try {
      const safetyCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', text: `${tempName}${tempClass}${finalNickName}` } });
      if (safetyCheck.result?.isRisky) { this.setData({ isSubmitting: false }); return wx.showToast({ title: '内容包含违规词，请修改', icon: 'none' }); }

      let finalAvatarUrl = avatarUrl;
      try {
        const { tempFilePath } = await wx.compressImage({ src: avatarUrl, quality: 80 });
        finalAvatarUrl = tempFilePath;
        const imageBuffer = wx.getFileSystemManager().readFileSync(finalAvatarUrl);
        const imgCheck: any = await wx.cloud.callFunction({ name: 'auditService', data: { action: 'autoCheck', buffer: imageBuffer } });
        if (imgCheck.result?.isRisky) { this.setData({ isSubmitting: false }); return wx.showToast({ title: '头像图片违规，请更换', icon: 'none' }); }
      } catch (imgErr) { console.warn('图片压缩或检测跳过', imgErr); }

      wx.showLoading({ title: '提交中...', mask: true });

      const extMatch = avatarUrl.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
      const { fileID } = await wx.cloud.uploadFile({ cloudPath: `avatars/${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`, filePath: finalAvatarUrl });
      
      const { result } = await wx.cloud.callFunction({
        name: 'userService', 
        data: { action: 'submitRegister', realName: tempName, className: tempClass, campus: tempCampus, weiXinAvatar: fileID, nickName: finalNickName, gender: 0, registerStatus: 0, Permission: 0 }
      }) as any;

      wx.hideLoading();

      if (result?.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        const newUserData = { _openid: wx.getStorageSync('realOpenID'), realName: tempName, className: tempClass, campus: tempCampus, weiXinAvatar: fileID, nickName: finalNickName, registerStatus: 0, Permission: 0, gender: 0 };
        wx.setStorageSync('currentUser', newUserData); wx.setStorageSync('isRegistered', true);
        this.setData({ isRegistered: true, userInfo: newUserData, isSubmitting: false });
      } else {
        wx.showToast({ title: result?.msg || '提交失败', icon: 'none' });
      }
    } catch (err: any) {
      wx.hideLoading();
      wx.showToast({ title: '报错: ' + (err.errMsg || err.message || '网络异常').substring(0, 15), icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  async applyReRegister() {
    if (!this.data.userInfo?._id) return;
    const resetData = () => { wx.removeStorageSync('currentUser'); wx.removeStorageSync('isRegistered'); this.setData({ isRegistered: false, userInfo: null, tempName: '', tempClass: '', avatarUrl: '', tempNickName: '', campusIndex: 0, tempCampus: this.data.campusList[0] }); };
    try {
      await db.collection('register_students').doc(this.data.userInfo._id).remove();
      resetData(); wx.showToast({ title: '请重新填写资料', icon: 'success' });
    } catch {
      wx.showModal({ title: '提示', content: '准备重置，请重新提交您的资料。', showCancel: false, success: resetData });
    }
  },

  goToFacultyRegister() { wx.redirectTo({ url: '/pages/mine/faculty-register/faculty-register' }); },
  goBackToTools() { wx.navigateBack({ delta: 1 }); }
});