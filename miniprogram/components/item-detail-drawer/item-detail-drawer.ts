Component({
  properties: {
    show: { type: Boolean, value: false },
    item: { 
      type: Object, 
      value: {},
      observer(newVal) {
        if (!newVal?._id || newVal._cacheChecked) return;
        
        const now = Date.now();
        const cacheKey = `outfit_img_v_${newVal._id}`;
        let lastRefresh = wx.getStorageSync(cacheKey) || 0;
        
        if (now - lastRefresh > 604800000) {
          lastRefresh = now;
          wx.setStorageSync(cacheKey, lastRefresh);
          
          const addV = (url: string) => {
            if (!url || url.match(/^(wxfile|http:\/\/tmp|cloud):\/\//)) return url;
            const cleanUrl = url.split(/[\?&]v=/)[0];
            return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${lastRefresh}`;
          };

          const updated: any = { ...newVal, _cacheChecked: true };
          
          // 直接覆写你指定的原生字段名
          if (updated.type === 'bg') {
            updated.bgUrlLarge = addV(updated.bgUrlLarge);
            updated.bgUrlSmall = addV(updated.bgUrlSmall);
          } else if (updated.type === 'frame') {
            updated.avatarFrameUrl = addV(updated.avatarFrameUrl);
          }
          
          this.setData({ item: updated });
          this.triggerEvent('cacheRefresh', { id: newVal._id });
        }
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