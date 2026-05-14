export {};
const db = wx.cloud.database();
let sysHeight = 600;

Page<any, any>({
  data: {
    gameState: 'idle', dotText: '开始', targetRounds: 5, reactionTimes: [] as number[], earlyCount: 0,
    chartPoints: [] as any[], chartSegments: [] as any[], currentReaction: null as number | null,
    averageTime: 0, fastestTime: 0, slowestTime: 0, rankList: [] as any[], myRank: -1, qualificationStatus: '',
    isPressing: false, isFilling: false, toastMsg: '', showToastFlag: false, showBackToTop: false
  },
  countdownTimer: null as any, waitTimer: null as any, missTimer: null as any,
  touchTimer: null as any, toastTimer: null as any, startTime: 0,

  onLoad() { sysHeight = wx.getSystemInfoSync().windowHeight; this.fetchLeaderboard(false); },
  onUnload() { this.clearAllTimers(); if (this.touchTimer) clearTimeout(this.touchTimer); if (this.toastTimer) clearTimeout(this.toastTimer); },
  onPageScroll(e: any) { this.setData({ showBackToTop: e.scrollTop > sysHeight + 80 }); },
  scrollToLeaderboardTop() { wx.pageScrollTo({ selector: '.leaderboard-screen', duration: 300 }); },

  clearAllTimers() { [this.countdownTimer, this.waitTimer, this.missTimer].forEach(t => t && clearTimeout(t)); },
  
  showCustomToast(msg: string) { 
    if (this.toastTimer) clearTimeout(this.toastTimer); 
    this.setData({ toastMsg: msg, showToastFlag: true }); 
    this.toastTimer = setTimeout(() => this.setData({ showToastFlag: false }), 2000); 
  },

  selectMode(e: any) { if (this.data.gameState === 'idle') this.setData({ targetRounds: parseInt(e.currentTarget.dataset.rounds) }); },

  triggerPenalty() {
    this.clearAllTimers();
    if (this.data.earlyCount + 1 >= 2) {
      this.setData({ gameState: 'idle', dotText: '开始', earlyCount: 0, chartPoints: [], chartSegments: [], currentReaction: null, isPressing: false, isFilling: false });
      this.showCustomToast('失误两次，测试结束');
    } else {
      this.setData({ earlyCount: this.data.earlyCount + 1, currentReaction: null }); this.startCountdown();
    }
  },

  handleDotTouchStart() {
    const { gameState } = this.data;
    this.setData({ isPressing: true });

    if (gameState === 'idle') {
      this.setData({ isFilling: true });
      this.touchTimer = setTimeout(() => {
        this.setData({ isPressing: false, isFilling: false, reactionTimes: [], earlyCount: 0, chartPoints: [], chartSegments: [], currentReaction: null });
        this.startCountdown();
      }, 500);
    } else if (gameState === 'waiting') { 
      this.triggerPenalty(); 
    } else if (gameState === 'ready') {
      this.clearAllTimers();
      const reactTime = Date.now() - this.startTime;
      if (reactTime < 60) { this.showCustomToast('非人类速度，请手动重试'); return this.startCountdown(); }
      
      const newTimes = [...this.data.reactionTimes, reactTime];
      this.updateChart(newTimes);
      this.setData({ reactionTimes: newTimes, currentReaction: reactTime });
      newTimes.length >= this.data.targetRounds ? this.finishGame(newTimes) : this.startCountdown();
    } else if (gameState === 'done') {
      this.setData({ gameState: 'idle', dotText: '开始', earlyCount: 0, chartPoints: [], chartSegments: [], currentReaction: null });
    }
  },

  handleDotTouchEnd() { this.setData({ isPressing: false, isFilling: false }); if (this.data.gameState === 'idle' && this.touchTimer) clearTimeout(this.touchTimer); },

  startCountdown() {
    this.clearAllTimers();
    let count = 3; this.setData({ gameState: 'countdown', dotText: count.toString(), currentReaction: null });
    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) this.setData({ dotText: count.toString() });
      else { clearInterval(this.countdownTimer); this.startRandomWait(); }
    }, 800);
  },

  startRandomWait() {
    this.setData({ gameState: 'waiting', dotText: '' });
    this.waitTimer = setTimeout(() => {
      this.setData({ gameState: 'ready', dotText: '' });
      this.startTime = Date.now();
      this.missTimer = setTimeout(() => { if (this.data.gameState === 'ready') this.triggerPenalty(); }, 3000);
    }, Math.floor(Math.random() * 2000) + 2000);
  },

  updateChart(times: number[]) {
    if (!times.length) return;
    const w = 280, h = 80;
    let min = Math.min(...times) - 20, max = Math.max(...times) + 20;
    if (max === min) max = min + 10;

    const pts = times.map((t, i) => ({
      x: (times.length > 1 ? (i / (times.length - 1)) * w : w / 2) + 10,
      y: (h - ((t - min) / (max - min)) * h) * 0.7 + (h * 0.2),
      val: t
    }));

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y;
      segs.push({ x: pts[i].x, y: pts[i].y, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI });
    }
    this.setData({ chartPoints: pts, chartSegments: segs });
  },

  async finishGame(times: number[]) {
    this.clearAllTimers();
    const avg = Math.floor(times.reduce((a, b) => a + b, 0) / times.length);
    const fast = Math.min(...times), slow = Math.max(...times);
    this.setData({ averageTime: avg, fastestTime: fast, slowestTime: slow });

    if (this.data.targetRounds !== 10) return this.setData({ gameState: 'done', dotText: '完成' });

    const user = wx.getStorageSync('currentUser');
    if (!user?._id) return this.setData({ gameState: 'done', dotText: '未登录', qualificationStatus: 'unlogged' });

    if ((times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length) < 5) {
      this.setData({ gameState: 'idle', dotText: '开始', earlyCount: 0, chartPoints: [], chartSegments: [], currentReaction: null });
      return this.showCustomToast('检测到异常点击规律，成绩作废');
    }

    try {
      const { result } = await wx.cloud.callFunction({ name: 'postService', data: { action: 'checkReaction', average: avg, fastest: fast, slowest: slow, uid: user._id, nickName: user.nickName, avatar: user.weiXinAvatar } }) as any;
      this.setData({ gameState: 'done', dotText: '完成', qualificationStatus: result?.qualified ? 'qualified' : 'notQualified', myRank: result?.rank || -1 });
      this.fetchLeaderboard(false);
    } catch { this.setData({ gameState: 'done', dotText: '完成', qualificationStatus: 'failed' }); }
  },

  async fetchLeaderboard(isPull = true) {
    if (this.data.isRefreshing) return;
    this.setData({ isRefreshing: true });
    try {
      const { data } = await db.collection('reaction_scores').orderBy('average', 'asc').limit(30).get();
      const user = wx.getStorageSync('currentUser');
      this.setData({ rankList: data, myRank: user ? data.findIndex((i: any) => i.uid === user._id) + 1 || -1 : -1 });
    } catch {} finally { setTimeout(() => this.setData({ isRefreshing: false }), 600); }
  }
});