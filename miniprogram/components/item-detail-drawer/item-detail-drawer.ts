Component({
  properties: {
    show: { type: Boolean, value: false },
    item: { 
      type: Object, 
      value: {},
      observer(newVal) {
        if (!newVal?._id || newVal._cacheChecked) return;
        wx.nextTick(() => {
          // 在异步队列中重新获取一下确保数据最新
          const currentItem = this.properties.item;
          if (!currentItem || currentItem._cacheChecked) return;

          const now = Date.now();
          const cacheKey = `outfit_img_v_${currentItem._id}`;
          let lastRefresh = wx.getStorageSync(cacheKey) || 0;
          const isExpired = !lastRefresh || (now - lastRefresh > 604800000);
          
          if (isExpired) {
            lastRefresh = now;
            wx.setStorageSync(cacheKey, lastRefresh);
          }
          
          const addV = (url: string) => {
            if (!url || url.match(/^(wxfile|http:\/\/tmp|cloud):\/\//)) return url;
            const cleanUrl = url.split(/[\?&]v=/)[0];
            return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${lastRefresh}`;
          };

          const updated: any = { ...currentItem, _cacheChecked: true };
          if (updated.type === 'bg') {
            updated.bgUrlLarge = addV(updated.bgUrlLarge);
            updated.bgUrlSmall = addV(updated.bgUrlSmall);
          } else if (updated.type === 'frame') {
            updated.avatarFrameUrl = addV(updated.avatarFrameUrl);
          }
          
          this.setData({ item: updated });

          if (isExpired) {
            this.triggerEvent('cacheRefresh', { id: currentItem._id });
          }
        });
      }
    },
    userInfo: { type: Object, value: {} },
    mode: { type: String, value: 'outfit' } 
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onEquip() { this.triggerEvent('equip', this.data.item); },
    onClaim() { this.triggerEvent('claim', this.data.item); },
    onBuy() { this.triggerEvent('buy', this.data.item); }
  }
});