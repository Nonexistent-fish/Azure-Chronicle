export {};

Page<any, any>({
  data: {
    logs: [
      {
        version: 'v1.0.0', date: '2026-05-15',
        content: [
          '青笺集-Azure Chronicle发布',
        ]
      }
    ]
  },

  onLoad() {},
  
  onShareAppMessage() {
    return {
      title: '查看我们的更新记录',
      path: '/pages/settings/changelog/changelog'
    };
  }
});