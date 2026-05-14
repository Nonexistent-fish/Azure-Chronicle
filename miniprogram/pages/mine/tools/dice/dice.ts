export {};

const THEMES = [
  { id: 'white', name: '珍珠白', bg: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)', dot: '#1e293b' },
  { id: 'black', name: '黑曜石', bg: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)', dot: '#ffffff' },
  { id: 'red',   name: '宝石红', bg: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)', dot: '#ffffff' },
  { id: 'blue',  name: '深海蓝', bg: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)', dot: '#ffffff' },
  { id: 'green', name: '翡翠绿', bg: 'linear-gradient(135deg, #10b981 0%, #065f46 100%)', dot: '#ffffff' }
];

Page<any, any>({
  data: {
    diceList: [] as any[], isRolling: false, totalScore: 0,
    activeDieIdx: -1, showTrash: false, inTrashZone: false,       
    editingDieIdx: -1, showEditModal: false, themeOptions: THEMES,
    stageWidth: 300, windowHeight: 500, safeBottomY: 400, rpxToPx: 0.5 
  },
  rollTimer: null as any, dragState: null as any, maxZIndex: 200,

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const ratio = sys.windowWidth / 750;
    this.setData({ stageWidth: sys.windowWidth, windowHeight: sys.windowHeight, safeBottomY: sys.windowHeight - (400 * ratio), rpxToPx: ratio });
    this.addDie(THEMES[0]); 
  },

  addDie(theme = THEMES[0]) {
    if (this.data.diceList.length >= 12) return wx.showToast({ title: '桌子放不下啦', icon: 'none' });
    this.maxZIndex++;
    const newDie = {
      id: `die_${Date.now()}_${Math.floor(Math.random()*1000)}`, result: 6, theme, 
      x: this.data.stageWidth / 2 - (65 * this.data.rpxToPx) + (Math.random() * 40 - 20), 
      y: this.data.windowHeight * 0.3 + (Math.random() * 40 - 20), 
      zIndex: this.maxZIndex, isDeleting: false, rotateX: 0, rotateY: 0
    };
    this.setData({ diceList: [...this.data.diceList, newDie] }, () => this.calculateTotal());
  },

  addNewDie() { wx.vibrateShort({ type: 'light' }); this.addDie(THEMES[Math.floor(Math.random() * THEMES.length)]); },

  dragStart(e: any) {
    if (this.data.isRolling) return;
    const idx = e.currentTarget.dataset.idx;
    const touch = e.touches[0];
    this.maxZIndex++;
    this.dragState = { idx, startX: touch.clientX, startY: touch.clientY, initX: this.data.diceList[idx].x, initY: this.data.diceList[idx].y, lastX: touch.clientX, lastY: touch.clientY };
    this.setData({ activeDieIdx: idx, [`diceList[${idx}].zIndex`]: this.maxZIndex, inTrashZone: false });
  },

  onDieLongPress() {
    if (this.data.isRolling || !this.dragState) return;
    wx.vibrateShort({ type: 'medium' }); this.setData({ showTrash: true });
  },

  dragMove(e: any) {
    if (!this.dragState || this.data.isRolling) return;
    const touch = e.touches[0];
    const { idx, startX, startY, initX, initY, lastX, lastY } = this.dragState;
    const ratio = this.data.rpxToPx;
    
    let newX = Math.max(0, Math.min(initX + touch.clientX - startX, this.data.stageWidth - 130 * ratio));
    let newY = Math.max(0, Math.min(initY + touch.clientY - startY, this.data.windowHeight - 130 * ratio));

    this.dragState.lastX = touch.clientX; this.dragState.lastY = touch.clientY;
    const inZone = Math.hypot(this.data.stageWidth / 2 - (newX + 65 * ratio), 190 * ratio - (newY + 65 * ratio)) < 90 * ratio;

    let updates: any = { 
      [`diceList[${idx}].x`]: newX, [`diceList[${idx}].y`]: newY,
      [`diceList[${idx}].rotateX`]: Math.max(-35, Math.min(35, -(touch.clientY - lastY) * 4)),
      [`diceList[${idx}].rotateY`]: Math.max(-35, Math.min(35, (touch.clientX - lastX) * 4))
    };

    if (inZone !== this.data.inTrashZone) { updates.inTrashZone = inZone; if (inZone) wx.vibrateShort({ type: 'heavy' }); }
    if (!this.data.showTrash) updates.showTrash = true;
    this.setData(updates);
  },

  dragEnd() {
    if (!this.dragState) return;
    const idx = this.dragState.idx;

    if (this.data.inTrashZone) {
      wx.vibrateShort({ type: 'heavy' });
      this.setData({ [`diceList[${idx}].isDeleting`]: true, showTrash: false, inTrashZone: false, activeDieIdx: -1 });
      setTimeout(() => {
        this.setData({ diceList: this.data.diceList.filter(d => d.id !== this.data.diceList[idx].id) }, () => this.calculateTotal());
        this.dragState = null;
      }, 300);
    } else {
      let finalY = this.data.diceList[idx].y;
      if (finalY > this.data.safeBottomY) { finalY = this.data.safeBottomY; wx.vibrateShort({ type: 'light' }); }
      this.setData({ [`diceList[${idx}].y`]: finalY, [`diceList[${idx}].rotateX`]: 0, [`diceList[${idx}].rotateY`]: 0, showTrash: false, inTrashZone: false, activeDieIdx: -1 });
      this.dragState = null;
    }
  },

  openDieSettings(e: any) {
    if (this.data.isRolling || this.data.activeDieIdx !== -1) return; 
    wx.vibrateShort({ type: 'light' });
    this.setData({ editingDieIdx: e.currentTarget.dataset.idx, showEditModal: true });
  },

  closeSettings() { this.setData({ showEditModal: false, editingDieIdx: -1 }); },
  
  changeDieColor(e: any) { this.setData({ [`diceList[${this.data.editingDieIdx}].theme`]: THEMES.find(t => t.id === e.currentTarget.dataset.id) }); },

  startRoll() {
    if (this.data.diceList.length === 0) return wx.showToast({ title: '桌上没骰子', icon: 'none' });
    wx.vibrateShort({ type: 'medium' }); this.setData({ isRolling: true });
    this.rollTimer = setInterval(() => { this.setData({ diceList: this.data.diceList.map((die: any) => ({ ...die, result: Math.floor(Math.random() * 6) + 1 })) }); wx.vibrateShort({ type: 'light' }); }, 60); 
  },

  stopRoll() {
    if (!this.data.isRolling) return; 
    clearInterval(this.rollTimer);
    let sum = 0;
    const finalResults = this.data.diceList.map((die: any) => { const num = Math.floor(Math.random() * 6) + 1; sum += num; return { ...die, result: num }; });
    wx.vibrateShort({ type: 'heavy' }); this.setData({ diceList: finalResults, totalScore: sum, isRolling: false });
  },

  calculateTotal() {
    let sum = 0; this.data.diceList.forEach((die: any) => { sum += die.result; });
    this.setData({ totalScore: sum });
  }
});