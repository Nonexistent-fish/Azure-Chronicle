export {};

Page<any, any>({
  data: {
    minVal: '1', maxVal: '100', displayValue: '?', wheelRotation: 0, isSpinning: false
  },

  handleInput(e: any) {
    const cleanValue = e.detail.value.replace(/[^\d]/g, '');
    this.setData({ [e.currentTarget.dataset.field]: cleanValue });
    return cleanValue;
  },

  startRandom() {
    if (this.data.isSpinning) return;
    
    const min = parseInt(this.data.minVal || '0', 10);
    const max = parseInt(this.data.maxVal || '0', 10);

    if (min >= max) return wx.showToast({ title: '最小值必须小于最大值', icon: 'none' });

    const finalResult = Math.floor(Math.random() * (max - min + 1)) + min;
    this.setData({ 
      isSpinning: true, 
      wheelRotation: this.data.wheelRotation + (360 * 6) + Math.floor(Math.random() * 360) 
    });
    wx.vibrateShort({ type: 'medium' });

    let flickerTimer = setInterval(() => {
      this.setData({ displayValue: (Math.floor(Math.random() * (max - min + 1)) + min).toString() });
    }, 50);

    setTimeout(() => {
      clearInterval(flickerTimer);
      wx.vibrateShort({ type: 'heavy' });
      this.setData({ displayValue: finalResult.toString(), isSpinning: false });
    }, 2750);
  }
});