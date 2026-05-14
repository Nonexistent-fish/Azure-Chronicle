import { xpToLevel } from '../../utils/levelUtils';
export {};
const db = wx.cloud.database();
const PUNCTUATION_REGEX = /[.,\/#!$%\^&\*;:{}=\-_`~()'\"<>\?\[\]【】、，。！？；：‘’“”（）《》\s\n]/;
const PUNCTUATION_GLOBAL_REGEX = new RegExp(PUNCTUATION_REGEX.source, 'g');

Page({
  data: {
    titleVal: '',
    contentVal: '',
    contentLen: 0, 
    mediaFiles: [] as any[], 
    userInfo: null as any,
    isAnonymous: false,
    isPrivate: false,
    isEdit: false,
    editId: '',
    maxChars: 150,
    isShaking: false,    
    isSubmitting: false,
    appStatus: '',
    isUploadingMedia: false 
  },

  titleWarnThrottled: false, 
  authCheckPromise: null as any, 
  uploadTaskPromise: null as Promise<boolean> | null,

  async onLoad(options: any) {
    if (options.isEdit === 'true' && options.id) {
      this.setData({ isEdit: true, editId: options.id });
      this.loadOldPostData(options.id);
    }
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }

    if (this.authCheckPromise) return;

    this.authCheckPromise = this.processPageInit();
    await this.authCheckPromise;
    this.authCheckPromise = null;
  },

  async getGlobalAppStatus() {
    const getStatus = () => this.data.appStatus || wx.getStorageSync('appStatus') || getApp().globalData?.appStatus;
    let status = getStatus();

    if (!status) {
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        status = getStatus();
        if (status) break; 
      }
    }

    const finalStatus = status || '';
    this.setData({ appStatus: finalStatus });
    return finalStatus;
  },

  async processPageInit() {
    const cachedUser = wx.getStorageSync('currentUser');
    if (cachedUser) {
      this.setData({ userInfo: cachedUser });
      this.calcTextLimit(cachedUser);
    }

    const currentStatus = await this.getGlobalAppStatus();

    if (currentStatus === 'right') {
      return; 
    }

    const isAuthorized = await this.verifyIdentity();

    if (!isAuthorized) {
      this.kickOutUnauthUser();
      return; 
    }

    if (!wx.getStorageSync('hasAgreedStandard')) {
      this.checkFirstTimeStandard();
    }
  },

  async verifyIdentity(): Promise<boolean> {
    const cachedUser = wx.getStorageSync('currentUser');

    try {
      if (cachedUser && cachedUser._id) {
        try {
          const res = await db.collection('register_students').doc(cachedUser._id).get();
          if (res.data) {
            const freshUser = res.data;
            this.setData({ userInfo: freshUser });
            wx.setStorageSync('currentUser', freshUser);
            this.calcTextLimit(freshUser);
            return true; 
          }
        } catch (docErr: any) {
          if (docErr && docErr.message && String(docErr.message).includes('not exist')) {
            return false; 
          }
          throw docErr; 
        }
      }

      const authRes: any = await wx.cloud.callFunction({ 
        name: 'userService', 
        data: { action: 'checkUserStatus' }
      });
      const realOpenID = authRes.result?.openid || authRes.result?.userData?._openid;

      if (!realOpenID) throw new Error('无法获取 OpenID');
      wx.setStorageSync('realOpenID', realOpenID);

      const res = await db.collection('register_students').where({ _openid: realOpenID }).get();

      if (res.data && res.data.length > 0) {
        const freshUser = res.data[0];
        this.setData({ userInfo: freshUser });
        wx.setStorageSync('currentUser', freshUser);
        this.calcTextLimit(freshUser);
        return true; 
      } else {
        return false; 
      }
    } catch (err) {
      console.warn('身份校验网络波动，启动断网降级策略:', err);
      return !!cachedUser;
    }
  },

  kickOutUnauthUser() {
    const currentStatus = this.data.appStatus || wx.getStorageSync('appStatus') || getApp().globalData?.appStatus;
    if (currentStatus === 'right') return;

    wx.removeStorageSync('currentUser');
    this.setData({ userInfo: null });

    wx.showModal({
      title: '身份验证未通过',
      content: '未查询到您的学籍档案，请先完成校园墙身份绑定。',
      showCancel: false,
      success: () => {
        wx.switchTab({ 
          url: '/pages/mine/mine',
          fail: () => { wx.reLaunch({ url: '/pages/mine/mine' }); }
        }); 
      }
    });
  },

  calcTextLimit(user: any) {
    const currentXp = user?.xp || 0;
    const levelInfo = xpToLevel(currentXp);
    const level = levelInfo.level;

    let limit = 150;
    if (level >= 6) limit = 300;
    else if (level >= 4) limit = 250;
    else if (level >= 2) limit = 200;

    this.setData({ maxChars: limit });
  },

  checkFirstTimeStandard() {
    const currentStatus = this.data.appStatus || wx.getStorageSync('appStatus') || getApp().globalData?.appStatus;
    if (currentStatus === 'right') return;

    wx.showModal({
      title: '社区规范提示',
      content: '为维护良好的校园社区环境，首次发布前请查阅《青笺校园日记内容发布与社区规范》。',
      confirmText: '去查看',
      cancelText: '暂不发布',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('hasAgreedStandard', true);
          this.goToStandard();
        } else {
          wx.switchTab({ 
            url: '/pages/index/index',
            fail: () => { wx.reLaunch({ url: '/pages/index/index' }); }
          }); 
        }
      }
    });
  },

  goToStandard() {
    wx.navigateTo({
      url: '/pages/upload/standard/standard',
      fail: (err) => {
        console.error('跳转规范页面失败', err);
        wx.showToast({ title: '页面开发中', icon: 'none' });
      }
    });
  },

  async loadOldPostData(id: string) {
    try {
      const res = await db.collection('timeline_posts').doc(id).get();
      const post = res.data;
      if (!post) throw new Error('未找到数据');

      let inheritedMedia = [] as any[];
      if (post.media && Array.isArray(post.media)) {
        inheritedMedia = post.media.map((m: any) => ({
            tempFilePath: m.fileID || m, 
            fileType: m.fileType || 'image',
            width: m.width,
            height: m.height,
            duration: m.duration,
            thumb: m.thumb,
            isOld: true 
          }));
      }

      this.setData({
        titleVal: post.title || '',
        contentVal: post.content || '',
        contentLen: this.getRealLength(post.content || ''),
        isAnonymous: post.isAnonymous || false,
        isPrivate: post.isPrivate || false,
        mediaFiles: inheritedMedia
      });
    } catch (err) {
      wx.showToast({ title: '内容继承失败', icon: 'none' });
    }
  },

  togglePrivacy() {
    const newStatus = !this.data.isPrivate;
    this.setData({ isPrivate: newStatus });
    wx.showToast({ title: newStatus ? '已设为私密' : '已设为公开', icon: 'none' });
  },

  onAnonymousChange(e: any) {
    this.setData({ isAnonymous: e.detail.value });
    wx.vibrateShort({ type: 'light' }); 
  },

  getRealLength(str: string): number {
    return str.replace(PUNCTUATION_GLOBAL_REGEX, '').length;
  },

  truncateByRealLength(str: string, maxLimit: number): string {
    let realCount = 0;
    for (let i = 0; i < str.length; i++) {
      if (!PUNCTUATION_REGEX.test(str[i])) {
        realCount++;
      }
      if (realCount > maxLimit) {
        return str.substring(0, i);
      }
    }
    return str;
  },

  onTitleInput(e: any) { 
    let val = e.detail.value;
    let currentRealLen = this.getRealLength(val);
    
    if (currentRealLen > 20) {
      val = this.truncateByRealLength(val, 20);
      
      if (!(this as any).titleWarnThrottled) {
        wx.showToast({ title: '标题只能显示20字', icon: 'none', duration: 1500 });
        (this as any).titleWarnThrottled = true;
        setTimeout(() => { (this as any).titleWarnThrottled = false; }, 3000);
      }
    }
    
    this.setData({ titleVal: val });
    return val; 
  },

  onContentInput(e: any) { 
    let val = e.detail.value;
    const limit = this.data.maxChars;
    let currentRealLen = this.getRealLength(val);
    
    if (currentRealLen >= limit) {
      if (currentRealLen > limit) {
        val = this.truncateByRealLength(val, limit);
        currentRealLen = limit;
      }
      
      if (!this.data.isShaking) {
        this.setData({ isShaking: true });
        wx.vibrateShort({ type: 'light' }); 
      
        setTimeout(() => {
          this.setData({ isShaking: false });
        }, 500); 
      }
    }
    
    this.setData({ 
      contentVal: val,
      contentLen: currentRealLen 
    });
    return val;
  },

  async chooseMedia() {
    try {
      const res = await wx.chooseMedia({
        count: 9,
        mediaType: ['mix'],
        sourceType: ['album', 'camera'],
        sizeType: ['original', 'compressed'],
        maxDuration: 60,
      });
      
      const currentFiles = this.data.mediaFiles;
      const newFilesRaw = res.tempFiles.map(f => ({
        ...f,
        isOld: false,
        uploadStatus: 'pending', 
        tempId: Date.now() + Math.random().toString().slice(2, 6) 
      }));

      let newImages = newFilesRaw.filter(f => f.fileType === 'image');
      let newVideos = newFilesRaw.filter(f => f.fileType === 'video');

      if (currentFiles.filter(f => f.fileType === 'image').length + newImages.length > 3) {
        wx.showToast({ title: '图片限3张', icon: 'none' });
        newImages = newImages.slice(0, 3 - currentFiles.filter(f => f.fileType === 'image').length);
      }
      if (currentFiles.filter(f => f.fileType === 'video').length + newVideos.length > 1) {
        wx.showToast({ title: '视频限1个', icon: 'none' });
        newVideos = [];
      }

      const validNewFiles = [...newImages, ...newVideos];
      if (validNewFiles.length === 0) return;

      this.setData({ 
        mediaFiles: [...currentFiles, ...validNewFiles],
        isUploadingMedia: true 
      });

      this.uploadTaskPromise = this.silentProcessMedia(validNewFiles);

    } catch (err) { console.log('取消选择'); }
  },

  async silentProcessMedia(files: any[]): Promise<boolean> {
    let hasError = false;

    const uploadTasks = files.map(async (file) => {
      let filePath = file.tempFilePath;
      let finalWidth = file.width || 0;
      let finalHeight = file.height || 0;
      let duration = file.duration || 0;
      let thumbCloudId = '';
      let isGif = false;
      let finalCloudId = '';

      try {
        if (file.fileType === 'image') {
          const info = await wx.getImageInfo({ src: filePath });
          finalWidth = info.width;
          finalHeight = info.height;

          if (info.type && info.type.toLowerCase() === 'gif') {
            isGif = true;
          } else {
            const { width, height } = this.calcCompressedSize(info.width, info.height, 1080);
            const compress = await wx.compressImage({ 
              src: filePath, quality: 70, compressedWidth: width, compressedHeight: height 
            });
            filePath = compress.tempFilePath;
            finalWidth = width;
            finalHeight = height;
          }
        } else if (file.fileType === 'video') {
          try {
            const vidRes: any = await new Promise((resolve, reject) => {
              (wx as any).compressVideo({
                src: filePath, quality: 'high',
                success: resolve, fail: reject
              });
            });
            filePath = vidRes.tempFilePath;
          } catch (e) { console.warn('视频压缩失败，使用原视频'); }
          
          if (file.thumbTempFilePath) {
             thumbCloudId = await this.uploadFileToCloud(file.thumbTempFilePath, 'video_thumbs');
          }
        }

        let fileStat: any = await new Promise((resolve) => {
          wx.getFileSystemManager().getFileInfo({ filePath, success: resolve, fail: () => resolve({ size: 0 }) });
        });
        
        if (isGif && fileStat.size > 5 * 1024 * 1024) throw new Error("动图过大(>5MB)");
        if (!isGif && file.fileType === 'image' && fileStat.size > 2 * 1024 * 1024) throw new Error("图片过大(>2MB)");
        if (file.fileType === 'video' && fileStat.size > 30 * 1024 * 1024) throw new Error("视频过大(>30MB)");

        finalCloudId = await this.uploadFileToCloud(filePath, 'posts');

        if (file.fileType === 'image') {
          const imgCheck: any = await wx.cloud.callFunction({
            name: 'auditService', 
            data: { action: 'autoCheck', imageFileId: finalCloudId }
          }).catch(() => ({ result: { isRisky: false }})); 

          if (imgCheck.result && imgCheck.result.isRisky) {
            await wx.cloud.deleteFile({ fileList: [finalCloudId] }).catch(()=>{});
            throw new Error("图片包含违规内容");
          }
        }

        this.updateMediaFileStatus(file.tempId, {
          uploadStatus: 'success',
          finalCloudId: finalCloudId,
          thumbCloudId: thumbCloudId,
          finalWidth, finalHeight, duration
        });

      } catch (err: any) {
        hasError = true;
        console.error('媒体处理失败:', err);
        wx.showToast({ title: err.message || '文件处理失败', icon: 'none' });
        this.removeMediaByTempId(file.tempId);
      }
    });

    await Promise.all(uploadTasks);
    
    this.setData({ isUploadingMedia: false });
    this.uploadTaskPromise = null; 
    
    return !hasError; 
  },

  updateMediaFileStatus(tempId: string, updateData: any) {
    const list = this.data.mediaFiles;
    const index = list.findIndex(f => f.tempId === tempId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updateData };
      this.setData({ mediaFiles: list });
    }
  },

  removeMediaByTempId(tempId: string) {
    const list = this.data.mediaFiles.filter(f => f.tempId !== tempId);
    this.setData({ mediaFiles: list });
  },

  removeMedia(e: any) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.mediaFiles;
    list.splice(index, 1);
    this.setData({ mediaFiles: list });
  },

  calcCompressedSize(width: number, height: number, limit: number) {
    if (width <= limit && height <= limit) return { width, height };
    const ratio = width / height;
    if (width > height) return { width: limit, height: Math.round(limit / ratio) };
    else return { width: Math.round(limit * ratio), height: limit };
  },

  async uploadFileToCloud(filePath: string, folder: string = 'posts') {
    const match = filePath.match(/\.[^.]+?$/);
    const suffix = (match && match[0]) ? match[0] : '.jpg';
    
    const randomName = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const cloudPath = `${folder}/${randomName}${suffix}`;
    
    const res = await wx.cloud.uploadFile({ cloudPath, filePath });
    return res.fileID;
  },

  async submitPost() {
    if (this.data.isSubmitting) return; 

    const title = this.data.titleVal.trim();
    const content = this.data.contentVal.trim();
    
    const hasMedia = this.data.mediaFiles && this.data.mediaFiles.length > 0;

    if (!hasMedia && this.data.contentLen < 5) {
      return wx.showToast({ title: '无配图时有效正文至少5字', icon: 'none' });
    }
    
    if (this.data.contentLen > this.data.maxChars) {
      return wx.showToast({ title: `字数超出等级上限(${this.data.maxChars})`, icon: 'none' });
    }

    const currentStatus = this.data.appStatus || wx.getStorageSync('appStatus') || getApp().globalData?.appStatus;
    if (currentStatus !== 'right' && !wx.getStorageSync('hasAgreedStandard')) {
      return this.checkFirstTimeStandard();
    }

    this.setData({ isSubmitting: true });

    try {
      const textCheckPromise = wx.cloud.callFunction({
        name: 'auditService', 
        data: { action: 'autoCheck', text: `${title}\n${content}` }
      });

      if (this.uploadTaskPromise) {
        const isMediaAllSafe = await this.uploadTaskPromise;
        if (!isMediaAllSafe) {
          this.setData({ isSubmitting: false });
          return; 
        }
      }

      const textCheck: any = await textCheckPromise;
      if (textCheck.result && textCheck.result.success === false && textCheck.result.isRisky) {
        throw new Error("TEXT_RISKY");
      }

      const allMedia = this.data.mediaFiles.map(f => {
        if (f.isOld) {
          return { fileID: f.tempFilePath, fileType: f.fileType, width: f.width, height: f.height, duration: f.duration, thumb: f.thumb };
        }
        return { 
          fileType: f.fileType, 
          fileID: f.finalCloudId, 
          width: f.finalWidth, 
          height: f.finalHeight, 
          duration: f.duration, 
          thumb: f.fileType === 'video' ? f.thumbCloudId : f.finalCloudId 
        };
      });

      const cmsImages = allMedia.filter(m => m.fileType === 'image').map(m => m.fileID);
      const videoObj = allMedia.find(m => m.fileType === 'video');
      const cmsVideo = videoObj ? videoObj.fileID : null;

      const postData = {
        title, 
        content, 
        media: allMedia,  
        cms_images: cmsImages, 
        cms_video: cmsVideo,   
        isAnonymous: this.data.isAnonymous,
        isPrivate: this.data.isPrivate,
        status: 0, 
        createTime: db.serverDate(),
        author: {
          _id: this.data.userInfo?._id || 'audit_user_id', 
          nickName: this.data.userInfo?.nickName || '微信用户',
          avatar: this.data.userInfo?.weiXinAvatar || '',
          gender: this.data.userInfo?.gender || 0,
          Permission: this.data.userInfo?.Permission || 0 
        }
      };

      if (this.data.isEdit) {
        await db.collection('timeline_posts').doc(this.data.editId).update({ data: postData });
      } else {
        await db.collection('timeline_posts').add({ 
          data: { 
            ...postData, 
            likeCount: 0, 
            viewCount: 0, 
            commentCount: 0,
            favoriteCount: 0,       
            hotScore: Date.now()    
          } 
        });
      }

      wx.showToast({ title: '发布成功', icon: 'none' });
      this.resetForm();
      setTimeout(() => { wx.switchTab({ url: '/pages/index/index' }); }, 1000);

    } catch (err: any) {
      if (err.message === "TEXT_RISKY") {
        wx.showToast({ title: '文字违规，请修改', icon: 'none' });
      } else {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
      console.error('发布异常:', err);
    } finally {
      this.setData({ isSubmitting: false });
    }
  },  

  resetForm() {
    this.setData({ 
      titleVal: '', 
      contentVal: '', 
      contentLen: 0, 
      mediaFiles: [], 
      isAnonymous: false, 
      isPrivate: false, 
      isEdit: false, 
      editId: '',
      isUploadingMedia: false
    });
    this.uploadTaskPromise = null;
  }
});